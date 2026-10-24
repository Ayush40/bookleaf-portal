// Orchestrates AI work around a ticket: background classification and on-demand drafting.
import { query } from '../db.js';
import { maxPriority } from '../constants.js';
import { ruleTriage } from './rules.js';
import { classify, draftReply, aiEnabled } from './ai.js';
import { getBook, listBooks } from './books.js';
import { templateDraft } from '../prompts/fallback.js';

/**
 * Called after a ticket is saved (fire-and-forget). The ticket already has rule-based values,
 * so a failure here costs nothing: the ticket just keeps them and is flagged ai_status='failed'.
 */
export async function classifyTicket(ticketId) {
  const { rows: [t] } = await query(
    `SELECT t.id, t.subject, t.description, b.title, b.status
       FROM tickets t LEFT JOIN books b ON b.book_id = t.book_id WHERE t.id = $1`, [ticketId]);
  if (!t) return;
  if (!aiEnabled()) {
    await query(`UPDATE tickets SET ai_status='skipped', ai_reason='AI not configured - keyword rules used' WHERE id=$1`, [ticketId]);
    return;
  }
  try {
    const ai = await classify(ticketId, { subject: t.subject, description: t.description, bookTitle: t.title, bookStatus: t.status });
    const floor = ruleTriage(`${t.subject}\n${t.description}`).floor;
    const priority = maxPriority(ai.priority, floor); // AI may raise priority but never go below the policy floor
    // Admin overrides always win, even if they happen while the AI call is in flight.
    await query(
      `UPDATE tickets SET
         category        = CASE WHEN category_source = 'admin' THEN category ELSE $2::text END,
         category_source = CASE WHEN category_source = 'admin' THEN 'admin' ELSE 'ai' END,
         priority        = CASE WHEN priority_source = 'admin' THEN priority ELSE $3::text END,
         priority_source = CASE WHEN priority_source = 'admin' THEN 'admin' ELSE 'ai' END,
         ai_status = 'done', ai_reason = $4
       WHERE id = $1`,
      [ticketId, ai.category, priority, floor !== 'Low' && priority === floor && ai.priority !== floor ? `${ai.reason} (priority raised by policy rule)` : ai.reason]);
  } catch (err) {
    console.warn(`[ai] classification failed for ticket ${ticketId}: ${err.message}`);
    await query(`UPDATE tickets SET ai_status='failed', ai_reason=$2 WHERE id=$1`, [ticketId, `AI failed (${err.message}). Keyword rules used; use "Retry AI" or classify manually.`.slice(0, 400)]);
  }
}

export const classifyInBackground = (id) => classifyTicket(id).catch((e) => console.error('[triage]', e));

/** After a restart, pick up tickets whose classification never finished. */
export async function requeuePending() {
  const { rows } = await query(`SELECT id FROM tickets WHERE ai_status = 'pending' ORDER BY id`);
  for (const r of rows) classifyInBackground(r.id);
}

// --- Drafting ---------------------------------------------------------------------------------------
const inflight = new Map(); // ticketId -> Promise (collapses duplicate clicks / double page loads into one LLM call)

export function generateDraft(ticketId) {
  if (!inflight.has(ticketId)) inflight.set(ticketId, buildDraft(ticketId).finally(() => inflight.delete(ticketId)));
  return inflight.get(ticketId);
}

async function buildDraft(ticketId) {
  const { rows: [t] } = await query(
    `SELECT t.*, a.name AS author_name FROM tickets t JOIN authors a ON a.author_id = t.author_id WHERE t.id = $1`, [ticketId]);
  if (!t) return null;
  const author = { name: t.author_name };
  const book = t.book_id ? await getBook(t.book_id) : null;
  const books = book ? [] : await listBooks({ authorId: t.author_id });
  // Cost control: only the last 4 follow-up messages, each clipped, not the whole history.
  const { rows: recent } = await query('SELECT sender_role, body FROM ticket_messages WHERE ticket_id=$1 ORDER BY id DESC LIMIT 4', [ticketId]);
  const ctx = { ticket: t, author, book, books, thread: recent.reverse(), category: t.category, priority: t.priority };

  let draft, source = 'ai', warning = null;
  try {
    draft = await draftReply(ticketId, ctx);
  } catch (err) {
    console.warn(`[ai] draft failed for ticket ${ticketId}: ${err.message}`);
    draft = templateDraft(ctx);
    source = 'template';
    warning = err.code === 'AI_DISABLED'
      ? 'AI is not configured, so this is a rule-based template using the author\'s real data. Edit before sending.'
      : `AI request failed (${err.message}). This is a rule-based template using the author's real data. Edit before sending, or try regenerating later.`;
  }
  await query('UPDATE tickets SET ai_draft=$2, ai_draft_source=$3, ai_draft_at=now() WHERE id=$1', [ticketId, draft, source]);
  return { draft, source, warning };
}
