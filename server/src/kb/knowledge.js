// BookLeaf Knowledge Base, split by topic so each draft call only carries the section it needs
// (about 1/5 of the full KB). Content mirrors the assignment brief exactly.

export const KB_COMMON = `ABOUT BOOKLEAF
- Self-publishing company operating in India and the US.
- Packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid; marketing and distribution add-ons).
- We handle cover design, typesetting, ISBN assignment, printing, distribution and royalty management.
- In-house printing facility and warehouse in Delhi. Print partners: Repro India and Epitome Books.`;

export const KB_TONE = `- Always empathetic and professional. Authors are our partners, not customers to be managed.
- Acknowledge the author's concern before jumping to solutions.
- Be specific: use actual numbers, dates and statuses instead of vague reassurance.
- If something is BookLeaf's fault (delayed royalties, ISBN error) own it directly. No corporate deflection.
- If escalation/investigation is needed, give a clear timeline ("Our team will look into this and get back to you within 48 hours"), never an open-ended promise.
- Always end with a clear next step for the author and/or the BookLeaf team.`;

export const KB_SECTIONS = {
  royalty: `ROYALTY POLICY
- 80/20 split: 80% of net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart) and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: ₹1,000. Below this, accumulated royalties roll over to the next quarter.
- Payouts are bank transfers to the account linked in the author's dashboard.
- Authors can see a detailed royalty breakdown (sales per platform) in their dashboard.`,
  isbn: `ISBN POLICY
- Every book gets a unique ISBN assigned by BookLeaf, registered under BookLeaf's publisher imprint.
- An ISBN under the author's own imprint must be obtained by the author independently.
- ISBN errors (duplicate, wrong book linked) are HIGH priority and escalated to the production team.`,
  printing: `PRINTING & QUALITY
- In-house printing handles most orders; overflow or special formats go to Repro India or Epitome Books.
- Standard print turnaround: 5-7 business days from order confirmation.
- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.`,
  distribution: `DISTRIBUTION & AVAILABILITY
- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.
- New listings typically go live 7-10 business days after publication is complete.
- A book showing as unavailable on a platform usually means a stock sync issue; BookLeaf can trigger a re-sync within 24-48 hours.`,
  production: `PRODUCTION STAGES
- Manuscript Received > Editing (if opted) > Cover Design > Typesetting > Proofreading > ISBN Assignment > Printing > Distribution Setup > Published & Live.
- Authors are emailed at each stage. Delays usually happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,
  general: `GENERAL
- Metadata updates (e.g. book description on Amazon) can be submitted through the dashboard or by emailing the BookLeaf team; changes typically reflect on platforms within 3-5 business days.`,
};

export const CATEGORY_SECTION = {
  'Royalty & Payments': 'royalty',
  'ISBN & Metadata Issues': 'isbn',
  'Printing & Quality': 'printing',
  'Distribution & Availability': 'distribution',
  'Book Status & Production Updates': 'production',
  'General Inquiry': 'general',
};

// Condensed from the brief's "Sample Query -> Response" table: how to handle each type.
export const CATEGORY_GUIDANCE = {
  'Royalty & Payments': `If no royalty received: acknowledge the frustration, explain the quarterly cycle and 45-day window, give the specific next payout date, say the team will verify the linked bank details, and if the payment is genuinely overdue escalate with a 48-hour resolution timeline. If the amount looks too low: explain net profit (MRP minus printing, platform commission, shipping), offer a detailed line-by-line breakdown, and don't be defensive.`,
  'ISBN & Metadata Issues': `Treat as high priority. Acknowledge this is a serious data issue, confirm you are escalating to the production team immediately, and give a 48-hour resolution timeline.`,
  'Printing & Quality': `Apologise sincerely. Ask the author to share photos of the defective copies. Confirm BookLeaf will arrange a free reprint once verified, and give a 5-7 business day timeline for the reprint.`,
  'Distribution & Availability': `Explain this is typically a stock sync issue. Confirm you are triggering a re-sync with the distribution team. Set expectation: 24-48 hours to go live again.`,
  'Book Status & Production Updates': `Use the actual production status from VERIFIED DATA. If delayed, be honest about why (e.g. waiting on author approval for proofs), give a specific updated timeline, never blame the author; frame it collaboratively.`,
  'General Inquiry': `Answer directly using the knowledge base. If the answer is not in the knowledge base, say our team will confirm and get back within 48 hours.`,
};
