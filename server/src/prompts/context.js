// Turns DB rows into the compact "VERIFIED DATA" block that grounds the draft.
import { fmtDate, inr, iso } from '../utils/dates.js';
import { PRODUCTION_STAGES, ROYALTY_THRESHOLD } from '../constants.js';

export function bookFacts(b) {
  const lines = [`Title: ${b.title}`, `ISBN: ${b.isbn || 'not assigned yet'}`, `Genre: ${b.genre}`, `Status: ${b.status}`];
  if (!b.isLive) {
    const n = PRODUCTION_STAGES.length;
    lines.push(b.productionStageIndex >= 0
      ? `Production stage: ${b.productionStage} (stage ${b.productionStageIndex + 1} of ${n})`
      : 'Production stage: not specified');
    lines.push('Publication date: not yet published; MRP not set; no sales or royalties yet');
    return lines;
  }
  lines.push(`Published: ${fmtDate(b.publicationDate)}`, `MRP: ${inr(b.mrp)}`, `Author royalty per copy: ${inr(b.royaltyPerCopy)}`,
    `Copies sold: ${b.copiesSold}`, `Royalty earned: ${inr(b.royaltyEarned)}`, `Royalty paid: ${inr(b.royaltyPaid)}`,
    `Royalty pending: ${inr(b.royaltyPending)}`,
    `Last payout: ${b.lastPayoutDate ? fmtDate(b.lastPayoutDate) : 'no payout made yet'}`,
    `Print partner: ${b.printPartner}`, `Available on: ${b.availableOn.join(', ') || 'none'}`,
    `Royalty situation: ${b.royalty.state} - ${b.royalty.note}`,
    `Next payout window: quarter ending ${fmtDate(b.royalty.quarterEnd)}, payable by ${fmtDate(b.royalty.nextPayoutBy)}`,
    `Minimum payout threshold: ${inr(ROYALTY_THRESHOLD)}`);
  return lines;
}

export function authorBooksSummary(books) {
  if (!books.length) return ['The author has no books on file.'];
  return books.slice(0, 6).map((b) => b.isLive
    ? `- ${b.title}: ${b.status}, ${b.copiesSold} sold, paid ${inr(b.royaltyPaid)}, pending ${inr(b.royaltyPending)}`
    : `- ${b.title}: ${b.status}`);
}

export const today = () => iso(new Date());
