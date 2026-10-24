// Rule-based draft used when the LLM is unavailable (down, rate-limited, no key).
// Still uses real data so the admin gets a useful starting point rather than a blank box.
import { fmtDate, inr } from '../utils/dates.js';

export function templateDraft({ author, book, category }) {
  const first = author.name.split(' ')[0];
  const t = book?.title ? `"${book.title}"` : 'your account';
  const bodies = {
    'Royalty & Payments': () => {
      if (!book) return 'Royalties are calculated quarterly and paid by bank transfer within 45 days of the quarter ending. The minimum payout is ₹1,000; anything below rolls over to the next quarter.';
      const r = book.royalty;
      const status = book.isLive ? `${t} has ${book.copiesSold} copies sold, ${inr(book.royaltyEarned)} earned, ${inr(book.royaltyPaid)} paid and ${inr(book.royaltyPending)} pending. ${r.note}` : `${t} is still in production, so no royalties have accrued yet.`;
      const ask = r.state === 'overdue_review'
        ? 'On review this payout looks overdue on our side, and I am sorry about that. I have escalated it to our finance team and will confirm the payment date within 48 hours.'
        : `Royalties are calculated quarterly and paid within 45 days of quarter end; the next payout is due by ${fmtDate(r.nextPayoutBy)}. Our team will also verify that your bank details are linked.`;
      return `${status}\n\n${ask}`;
    },
    'ISBN & Metadata Issues': () => `This is a serious data issue and we are treating it as high priority. I have escalated ${t} to our production team right now, and you will hear back with a resolution within 48 hours.`,
    'Printing & Quality': () => `I am sorry about the quality of your copies. Could you share a few photos of the defective pages or binding? Once we verify them, we will arrange a free reprint, which takes 5-7 business days.`,
    'Distribution & Availability': () => `This is usually a stock sync issue. I have asked our distribution team to trigger a re-sync for ${t}, and it should be live again within 24-48 hours.`,
    'Book Status & Production Updates': () => (book && !book.isLive
      ? `${t} is currently at the ${book.productionStage || 'production'} stage. I will check with the production team for the exact next milestone and confirm an updated timeline within 48 hours.`
      : 'I will check the latest status with our production team and confirm an updated timeline within 48 hours.'),
    'General Inquiry': () => 'Our team will look into this and get back to you within 48 hours.',
  };
  const body = (bodies[category] || bodies['General Inquiry'])();
  return `Dear ${first},\n\nThank you for reaching out, and I understand why this matters to you.\n\n${body}\n\nIf anything changes on your side in the meantime, just reply here and we will pick it up straight away.\n\nWarm regards,\nBookLeaf Author Support Team`;
}
