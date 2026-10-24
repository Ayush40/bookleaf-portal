export const CATEGORIES = [
  'Royalty & Payments',
  'ISBN & Metadata Issues',
  'Printing & Quality',
  'Distribution & Availability',
  'Book Status & Production Updates',
  'General Inquiry',
];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const PRODUCTION_STAGES = [
  'Manuscript Received', 'Editing', 'Cover Design', 'Typesetting', 'Proofreading',
  'ISBN Assignment', 'Printing', 'Distribution Setup', 'Published & Live',
];
export const ROYALTY_THRESHOLD = 1000; // INR, minimum payout
export const PAYOUT_WINDOW_DAYS = 45;  // days after quarter end

export const priorityRank = (p) => PRIORITIES.indexOf(p);
export const maxPriority = (a, b) => (priorityRank(a) >= priorityRank(b) ? a : b);
