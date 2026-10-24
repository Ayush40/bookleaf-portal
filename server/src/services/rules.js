// Keyword-based triage. Used (1) instantly at ticket creation so every ticket has a sensible
// category/priority even if the AI is slow or down, and (2) as a priority FLOOR the AI cannot go below
// for cases the knowledge base says must be high priority (e.g. ISBN errors).
import { maxPriority } from '../constants.js';

const CATEGORY_RULES = [
  { category: 'ISBN & Metadata Issues', weight: 3, re: /\bisbn\b|barcode|wrong book (linked|showing)|duplicate (isbn|listing)|different (title|author|cover)/gi },
  { category: 'Royalty & Payments', weight: 2, re: /royalt|payout|payment|\bpaid\b|bank (transfer|detail|account)|earning|commission|₹|\brs\.?\s?\d|rupee/gi },
  { category: 'Printing & Quality', weight: 2, re: /print|misprint|binding|blurry|misalign|colou?r|paper|damaged|defect|author cop(y|ies)|reprint|pages? (are|were|is)/gi },
  { category: 'Distribution & Availability', weight: 2, re: /unavailable|out of stock|not (showing|listed|available)|listing|\bstock\b|\bsync\b|flipkart|amazon|bookleaf store|can'?t (find|buy|order)/gi },
  { category: 'Book Status & Production Updates', weight: 2, re: /status|stage|typesett|proofread|cover design|editing|when will|how long|timeline|delay|manuscript|\bproofs?\b/gi },
];

const CRITICAL_RE = /legal action|lawyer|lawsuit|\bsue\b|fraud|scam|cheat|plagiari|copyright infring|police|consumer court|defam|data (leak|breach)/i;
const NOT_RECEIVED_RE = /(not|n't|never|no|still)\b.{0,40}(receiv|paid|payment|royalt)|(receiv|paid|payment|royalt).{0,40}(not|never|missing|pending|delayed)/i;
const LONG_WAIT_RE = /\b(6|six|7|seven|8|eight|9|nine|10|ten|11|eleven|12|twelve|\d{2,})\s*\+?\s*(months?|years?)|since (last year|publication|launch)|over (half a|a) year/i;
const URGENT_RE = /\burgent|asap|immediately|deadline|launch event|emergency/i;
const DEFECT_RE = /terrible|blurry|misalign|misprint|damaged|torn|binding|defect|missing pages|wrong pages/i;
const UNAVAILABLE_RE = /unavailable|out of stock|not (showing|listed|available)|can'?t (find|buy|order)/i;

/** @returns {{category: string, priority: string, floor: string}} */
export function ruleTriage(text) {
  let best = { category: 'General Inquiry', score: 0 };
  for (const r of CATEGORY_RULES) {
    const score = (text.match(r.re) || []).length * r.weight;
    if (score > best.score) best = { category: r.category, score };
  }
  const category = best.category;

  // floor = policy-mandated minimum, independent of the model
  let floor = 'Low';
  if (CRITICAL_RE.test(text)) floor = 'Critical';
  else if (category === 'ISBN & Metadata Issues') floor = 'High'; // KB: ISBN errors are high priority
  else if (category === 'Royalty & Payments' && NOT_RECEIVED_RE.test(text)) floor = LONG_WAIT_RE.test(text) ? 'Critical' : 'High';

  // heuristic priority = what we use when AI is unavailable
  let priority = { 'Royalty & Payments': 'Medium', 'ISBN & Metadata Issues': 'High', 'Printing & Quality': 'Medium',
    'Distribution & Availability': 'Medium', 'Book Status & Production Updates': 'Medium', 'General Inquiry': 'Low' }[category];
  if (category === 'Printing & Quality' && DEFECT_RE.test(text)) priority = 'High';
  if (category === 'Distribution & Availability' && UNAVAILABLE_RE.test(text)) priority = 'High';
  if (URGENT_RE.test(text) && priority !== 'Low') priority = maxPriority(priority, 'High');
  priority = maxPriority(priority, floor);
  return { category, priority, floor };
}
