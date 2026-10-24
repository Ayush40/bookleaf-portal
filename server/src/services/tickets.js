// Ticket data access + lifecycle rules. Routes stay thin; all SQL and business rules live here.
import { query, withTx } from '../db.js';
import { AppError, notFound } from '../utils/errors.js';
import { ruleTriage } from './rules.js';
import { aiEnabled } from './ai.js';
import { getBook } from './books.js';

export const ticketNo = (id) => `BL-${String(id).padStart(4, '0')}`;

const SELECT = `
  SELECT t.*, a.name AS author_name, a.email AS author_email, a.phone AS author_phone, a.city AS author_city,
         b.title AS book_title, b.status AS book_status, u.name AS assignee_name,
         (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id = t.id AND m.sender_role = 'admin')::int AS admin_reply_count,
         (SELECT count(*) FROM ticket_messages m WHERE m.ticket_id = t.id)::int AS message_count,
         (SELECT sender_role FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_sender
    FROM tickets t
    JOIN authors a ON a.author_id = t.author_id
    LEFT JOIN books b ON b.book_id = t.book_id
    LEFT JOIN users u ON u.id = t.assigned_to`;

// ---- serializers: the author shape deliberately omits priority, AI fields, notes and assignee ----
const common = (r) => ({
  id: r.id, ticketNo: ticketNo(r.id), subject: r.subject, status: r.status, category: r.category,
  bookId: r.book_id, bookTitle: r.book_title || null, createdAt: r.created_at, updatedAt: r.updated_at,
  adminReplyCount: r.admin_reply_count, messageCount: r.message_count,
});
const toAuthor = (r) => ({ ...common(r), description: r.description, attachments: r.attachments });
const toAdminRow = (r) => ({
  ...common(r), priority: r.priority, categorySource: r.category_source, prioritySource: r.priority_source,
  aiStatus: r.ai_status, authorId: r.author_id, authorName: r.author_name,
  assignedTo: r.assigned_to, assigneeName: r.assignee_name, lastSender: r.last_sender, resolvedAt: r.resolved_at,
});
const toMessage = (m) => ({
  id: m.id, sender: m.sender_role, senderName: m.sender_role === 'admin' ? (m.sender_name || 'BookLeaf Support') : m.sender_name, body: m.body, createdAt: m.created_at,
});

async function messagesFor(ticketId) {
  const { rows } = await query(
    `SELECT m.*, u.name AS sender_name FROM ticket_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = $1 ORDER BY m.id`, [ticketId]);
  return rows.map(toMessage);
}

// ---------------------------------------------------------------------------------------------- author
export async function createTicket({ authorId, bookId, subject, description, attachments }) {
  if (bookId) {
    const { rows } = await query('SELECT 1 FROM books WHERE book_id=$1 AND author_id=$2', [bookId, authorId]);
    if (!rows.length) throw new AppError(400, 'That book is not linked to your account.', 'INVALID_BOOK');
  }
  const { rows: dupe } = await query(
    `SELECT id FROM tickets WHERE author_id=$1 AND subject=$2 AND description=$3 AND created_at > now() - interval '2 minutes'`, [authorId, subject, description]);
  if (dupe.length) throw new AppError(409, 'You just submitted this exact ticket. We have it and will reply soon.', 'DUPLICATE_TICKET');

  const guess = ruleTriage(`${subject}\n${description}`); // instant, so the ticket is useful even if AI never answers
  const { rows: [t] } = await query(
    `INSERT INTO tickets (author_id, book_id, subject, description, attachments, category, priority, ai_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [authorId, bookId, subject, description, attachments, guess.category, guess.priority, aiEnabled() ? 'pending' : 'skipped']);
  return t.id;
}

export async function listForAuthor(authorId) {
  const { rows } = await query(`${SELECT} WHERE t.author_id = $1 ORDER BY t.updated_at DESC, t.id DESC`, [authorId]);
  return rows.map(toAuthor);
}

export async function getForAuthor(authorId, id) {
  const { rows: [r] } = await query(`${SELECT} WHERE t.id = $1 AND t.author_id = $2`, [id, authorId]);
  if (!r) throw notFound('Ticket'); // 404 (not 403) so we never reveal that another author's ticket exists
  return { ...toAuthor(r), messages: await messagesFor(id) };
}

export async function addAuthorMessage(authorId, user, id, body) {
  await withTx(async (c) => {
    const { rows: [t] } = await c.query('SELECT status FROM tickets WHERE id=$1 AND author_id=$2 FOR UPDATE', [id, authorId]);
    if (!t) throw notFound('Ticket');
    if (t.status === 'Closed') throw new AppError(409, 'This ticket is closed. Please open a new ticket for further questions.', 'TICKET_CLOSED');
    await c.query(`INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body) VALUES ($1,'author',$2,$3)`, [id, user.id, body]);
    // A reply reopens a resolved ticket and makes the cached AI draft stale.
    await c.query(
      `UPDATE tickets SET status = CASE WHEN status='Resolved' THEN 'Open' ELSE status END,
         resolved_at = CASE WHEN status='Resolved' THEN NULL ELSE resolved_at END,
         ai_draft = NULL, ai_draft_source = NULL, updated_at = now() WHERE id=$1`, [id]);
  });
}

// ---------------------------------------------------------------------------------------------- admin
export async function listForAdmin(f, adminId) {
  const where = [];
  const vals = [];
  const add = (sql, v) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
  if (f.status) add('t.status = ?', f.status);
  if (f.category) add('t.category = ?', f.category);
  if (f.priority) add('t.priority = ?', f.priority);
  if (f.assigned === 'me') add('t.assigned_to = ?', adminId);
  else if (f.assigned === 'unassigned') where.push('t.assigned_to IS NULL');
  else if (f.assigned) add('t.assigned_to = ?', Number(f.assigned));
  if (f.from) add('t.created_at >= ?::date', f.from);
  if (f.to) add(`t.created_at < (?::date + 1)`, f.to);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, '\\$&')}%`;
    vals.push(like);
    const n = vals.length;
    where.push(`(t.subject ILIKE $${n} OR t.description ILIKE $${n} OR a.name ILIKE $${n} OR 'BL-' || lpad(t.id::text, 4, '0') ILIKE $${n})`);
  }
  // "urgency": unresolved first, then Critical > High > Medium > Low, then oldest first (waiting longest).
  const order = {
    urgency: `(t.status IN ('Resolved','Closed')) ASC,
      CASE t.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END ASC, t.created_at ASC`,
    newest: 't.created_at DESC',
    oldest: 't.created_at ASC',
  }[f.sort];
  vals.push(f.limit, f.offset);
  const { rows } = await query(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT $${vals.length - 1} OFFSET $${vals.length}`, vals);
  const { rows: [{ total }] } = await query(
    `SELECT count(*)::int AS total FROM tickets t JOIN authors a ON a.author_id = t.author_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`, vals.slice(0, -2));
  return { items: rows.map(toAdminRow), total };
}

export async function getAdminDetail(id) {
  const { rows: [r] } = await query(`${SELECT} WHERE t.id = $1`, [id]);
  if (!r) throw notFound('Ticket');
  const { rows: notes } = await query(
    `SELECT n.id, n.body, n.created_at, u.name AS admin_name FROM ticket_notes n LEFT JOIN users u ON u.id = n.admin_id WHERE n.ticket_id = $1 ORDER BY n.id`, [id]);
  return {
    ...toAdminRow(r),
    description: r.description,
    attachments: r.attachments,
    aiReason: r.ai_reason,
    author: { id: r.author_id, name: r.author_name, email: r.author_email, phone: r.author_phone, city: r.author_city },
    book: r.book_id ? await getBook(r.book_id) : null,
    draft: r.ai_draft ? { text: r.ai_draft, source: r.ai_draft_source, generatedAt: r.ai_draft_at } : null,
    messages: await messagesFor(id),
    notes: notes.map((n) => ({ id: n.id, body: n.body, adminName: n.admin_name, createdAt: n.created_at })),
  };
}

export async function updateTicket(id, patch, admin) {
  const sets = [];
  const vals = [id];
  const push = (v) => { vals.push(v); return `$${vals.length}`; };
  if (patch.status) {
    const p = push(patch.status);
    sets.push(`status = ${p}::text`, `resolved_at = CASE WHEN ${p}::text IN ('Resolved','Closed') THEN COALESCE(resolved_at, now()) ELSE NULL END`);
  }
  if (patch.category) sets.push(`category = ${push(patch.category)}::text`, `category_source = 'admin'`);
  if (patch.priority) sets.push(`priority = ${push(patch.priority)}::text`, `priority_source = 'admin'`);
  if ('assignedTo' in patch) {
    let target = patch.assignedTo === 'me' ? admin.id : patch.assignedTo;
    if (target !== null) {
      const { rows } = await query(`SELECT 1 FROM users WHERE id=$1 AND role='admin'`, [target]);
      if (!rows.length) throw new AppError(400, 'That user is not an admin.', 'INVALID_ASSIGNEE');
    }
    sets.push(`assigned_to = ${push(target)}::int`);
    // Picking a ticket up moves it out of "Open" unless the admin chose a status explicitly.
    if (target !== null && !patch.status) sets.push(`status = CASE WHEN status = 'Open' THEN 'In Progress' ELSE status END`);
  }
  const { rowCount } = await query(`UPDATE tickets SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
  if (!rowCount) throw notFound('Ticket');
}

export async function addAdminReply(id, admin, body, status) {
  await withTx(async (c) => {
    const { rows: [t] } = await c.query('SELECT status FROM tickets WHERE id=$1 FOR UPDATE', [id]);
    if (!t) throw notFound('Ticket');
    if (t.status === 'Closed' && !status) throw new AppError(409, 'This ticket is closed. Reopen it (change status) before replying.', 'TICKET_CLOSED');
    await c.query(`INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body) VALUES ($1,'admin',$2,$3)`, [id, admin.id, body]);
    const next = status || (t.status === 'Open' ? 'In Progress' : t.status);
    await c.query(
      `UPDATE tickets SET status = $2::text, assigned_to = COALESCE(assigned_to, $3::int),
         resolved_at = CASE WHEN $2::text IN ('Resolved','Closed') THEN COALESCE(resolved_at, now()) ELSE NULL END,
         ai_draft = NULL, ai_draft_source = NULL, updated_at = now() -- the sent draft is spent; the next one should see the new thread
       WHERE id = $1`, [id, next, admin.id]);
  });
}

export async function addNote(id, admin, body) {
  const { rows } = await query('SELECT 1 FROM tickets WHERE id=$1', [id]);
  if (!rows.length) throw notFound('Ticket');
  await query('INSERT INTO ticket_notes (ticket_id, admin_id, body) VALUES ($1,$2,$3)', [id, admin.id, body]);
}

export async function resetAiStatus(id) {
  const { rowCount } = await query(`UPDATE tickets SET ai_status = 'pending' WHERE id = $1`, [id]);
  if (!rowCount) throw notFound('Ticket');
}

export async function stats() {
  const { rows: [t] } = await query(`
    SELECT count(*) FILTER (WHERE status='Open')::int AS open,
           count(*) FILTER (WHERE status='In Progress')::int AS in_progress,
           count(*) FILTER (WHERE status='Resolved')::int AS resolved,
           count(*) FILTER (WHERE status IN ('Open','In Progress') AND priority='Critical')::int AS critical,
           count(*) FILTER (WHERE status IN ('Open','In Progress') AND assigned_to IS NULL)::int AS unassigned,
           count(*) FILTER (WHERE status IN ('Open','In Progress') AND created_at < now() - interval '48 hours')::int AS overdue
      FROM tickets`);
  const { rows: [a] } = await query(`
    SELECT count(*)::int AS calls, count(*) FILTER (WHERE NOT ok)::int AS failed,
           COALESCE(sum(prompt_tokens),0)::int AS prompt_tokens, COALESCE(sum(output_tokens),0)::int AS output_tokens FROM ai_calls`);
  return {
    tickets: { open: t.open, inProgress: t.in_progress, resolved: t.resolved, criticalOpen: t.critical, unassigned: t.unassigned, overdue: t.overdue },
    ai: { enabled: aiEnabled(), calls: a.calls, failedCalls: a.failed, promptTokens: a.prompt_tokens, outputTokens: a.output_tokens },
  };
}

export async function listAdmins() {
  const { rows } = await query(`SELECT id, name, email FROM users WHERE role='admin' ORDER BY name`);
  return rows;
}
