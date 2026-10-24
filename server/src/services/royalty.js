// Deterministic royalty maths. The LLM is never asked to calculate dates or amounts:
// we compute them here and hand the model verified facts (fewer hallucinations, fewer tokens).
import { ROYALTY_THRESHOLD, PAYOUT_WINDOW_DAYS, PRODUCTION_STAGES } from '../constants.js';
import { iso, fmtDate, inr } from '../utils/dates.js';

const DAY = 864e5;
const quarterEnd = (year, q) => new Date(Date.UTC(year, q * 3 + 3, 0)); // last day of quarter q (0-3), calendar quarters

/** Quarter-end + 45 days = payout deadline. Returns the first deadline that is still upcoming. */
export function nextPayoutWindow(now = new Date()) {
  const q = Math.floor(now.getUTCMonth() / 3);
  const y = now.getUTCFullYear();
  const candidates = [q === 0 ? quarterEnd(y - 1, 3) : quarterEnd(y, q - 1), quarterEnd(y, q)];
  for (const end of candidates) {
    const due = new Date(end.getTime() + PAYOUT_WINDOW_DAYS * DAY);
    if (iso(due) >= iso(now)) return { quarterEnd: iso(end), payoutBy: iso(due) };
  }
}

/** First payout is due 45 days after the end of the quarter in which the book was published. */
function firstPayoutDue(publicationDate) {
  const d = new Date(`${publicationDate}T00:00:00Z`);
  const end = quarterEnd(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3));
  return new Date(end.getTime() + PAYOUT_WINDOW_DAYS * DAY);
}

export const isLive = (b) => b.status === 'Published & Live';

export function productionStage(status) {
  const m = /^In Production\s*[-–]\s*(.+)$/i.exec(status || '');
  const name = m ? m[1].trim() : null;
  const index = name ? PRODUCTION_STAGES.findIndex((s) => s.toLowerCase() === name.toLowerCase()) : -1;
  return { name, index };
}

/**
 * Classifies a book's royalty situation into one state + a plain-language note.
 * authorPending = total pending across ALL the author's books (the ₹1,000 threshold applies to accumulated royalties).
 */
export function describeRoyalty(b, authorPending, now = new Date()) {
  const window = nextPayoutWindow(now);
  const base = { nextPayoutBy: window.payoutBy, quarterEnd: window.quarterEnd };
  if (!isLive(b)) return { ...base, state: 'in_production', note: 'Royalties begin once your book is published and selling.' };
  if (!b.copies_sold) return { ...base, state: 'no_sales', note: 'No copies sold yet. Royalties will appear after your first sale.' };
  if (b.royalty_pending === 0) {
    return { ...base, state: 'settled', note: `All royalties paid${b.last_payout_date ? ` (last payout ${fmtDate(b.last_payout_date)})` : ''}. New sales will be included in the next quarterly cycle.` };
  }
  if (authorPending < ROYALTY_THRESHOLD) {
    return { ...base, state: 'below_threshold', note: `${inr(b.royalty_pending)} pending is below the ${inr(ROYALTY_THRESHOLD)} minimum payout, so it rolls over to the next quarter.` };
  }
  if (b.royalty_paid === 0 && b.publication_date && iso(firstPayoutDue(b.publication_date)) < iso(now)) {
    return { ...base, state: 'overdue_review', note: `No payout recorded yet, although your first payout window has passed. This looks overdue, so raise a ticket and we will investigate.` };
  }
  return { ...base, state: 'pending', note: `${inr(b.royalty_pending)} will be included in the next payout, due by ${fmtDate(window.payoutBy)}.` };
}
