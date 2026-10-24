// Idempotent seeding from the provided dataset. Safe to run on every boot:
// authors/books are upserted, users are created once, demo tickets only when the tickets table is empty.
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, query, withTx } from './db.js';
import { config } from './config.js';

export const AUTHOR_PASSWORD = 'Author@123';
export const ADMIN_PASSWORD = 'Admin@123';
const ADMINS = [
  { email: 'admin@bookleaf.com', name: 'Riya Mehta (Ops)' },
  { email: 'support@bookleaf.com', name: 'Karan Verma (Support)' },
];

const DEMO_TICKETS = [
  { author: 'AUTH003', book: 'BK005', daysAgo: 6, status: 'Open', category: 'Royalty & Payments', priority: 'Critical',
    subject: 'I have not received any royalty since my book was published',
    description: 'My book Between Two Temples has been live since July 2024 and I have not received a single royalty payment in over 6 months. My dashboard shows pending royalty but nothing has reached my bank account. Please tell me what is going on.' },
  { author: 'AUTH002', book: 'BK004', daysAgo: 3, status: 'In Progress', assignee: 0, category: 'ISBN & Metadata Issues', priority: 'High',
    subject: 'Different ISBN showing on Amazon US than on the physical copy',
    description: 'The ISBN printed on the back of my author copy of Startup Sutra does not match the one shown on the Amazon US listing. Readers are reporting that they cannot find it by ISBN. Please look into this.',
    messages: [{ role: 'admin', daysAgo: 2, body: 'Dear Rohit,\n\nThank you for flagging this. It is a serious data issue and we have escalated it to our production team. You will hear back with a resolution within 48 hours.\n\nWarm regards,\nBookLeaf Author Support Team' }] },
  { author: 'AUTH001', book: 'BK002', daysAgo: 1, status: 'Open', category: 'General Inquiry', priority: 'Low',
    subject: 'Can I update my author bio and book description?',
    description: 'Hi team, The Saffron Diaries is already live on Amazon India. Can I still update the book description and my author bio? If yes, how long does it take to show up?' },
  { author: 'AUTH009', book: 'BK016', daysAgo: 2, status: 'Open', category: 'Royalty & Payments', priority: 'Medium',
    subject: 'Royalty amount shows 850 but I have received nothing',
    description: 'I can see Rs 850 pending royalty for The Nagpur Notebooks but there has been no payment to my account so far. Is this normal? When will I be paid?' },
  { author: 'AUTH007', book: 'BK013', daysAgo: 4, status: 'Open', category: 'Book Status & Production Updates', priority: 'Medium',
    subject: 'Midnight in Mysore is stuck at cover design - when will it be done?',
    description: 'My thriller Midnight in Mysore has been in cover design for weeks. Can you tell me the status and when I can expect the book to be published?' },
  { author: 'AUTH007', book: 'BK012', daysAgo: 8, status: 'Resolved', assignee: 1, category: 'Distribution & Availability', priority: 'High',
    subject: 'Ctrl+Alt+Delete My Ex shows Currently Unavailable on Amazon',
    description: 'My book is published but Amazon India shows "Currently Unavailable" since yesterday. Please fix this as soon as possible.',
    messages: [
      { role: 'admin', daysAgo: 7, body: 'Dear Sneha,\n\nThank you for letting us know. This is typically a stock sync issue, and we have triggered a re-sync with our distribution team. It should be live again within 24-48 hours.\n\nWarm regards,\nBookLeaf Author Support Team' },
      { role: 'author', daysAgo: 5, body: 'It is showing as available again. Thank you for the quick help!' },
    ] },
];

export async function seedAll() {
  const file = new URL('../data/bookleaf_sample_data.json', import.meta.url);
  const { authors } = JSON.parse(fs.readFileSync(fileURLToPath(file), 'utf8'));
  const authorHash = bcrypt.hashSync(AUTHOR_PASSWORD, 10);
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  await withTx(async (c) => {
    for (const a of authors) {
      await c.query(
        `INSERT INTO authors (author_id, name, email, phone, city, joined_date) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (author_id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone, city=EXCLUDED.city, joined_date=EXCLUDED.joined_date`,
        [a.author_id, a.name, a.email.toLowerCase(), a.phone, a.city, a.joined_date]);
      await c.query(
        `INSERT INTO users (email, password_hash, name, role, author_id) VALUES ($1,$2,$3,'author',$4) ON CONFLICT (email) DO NOTHING`,
        [a.email.toLowerCase(), authorHash, a.name, a.author_id]);
      for (const b of a.books) {
        await c.query(
          `INSERT INTO books (book_id, author_id, title, isbn, genre, publication_date, status, mrp, royalty_per_copy, copies_sold,
             royalty_earned, royalty_paid, royalty_pending, last_payout_date, print_partner, available_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (book_id) DO UPDATE SET title=EXCLUDED.title, isbn=EXCLUDED.isbn, genre=EXCLUDED.genre, publication_date=EXCLUDED.publication_date,
             status=EXCLUDED.status, mrp=EXCLUDED.mrp, royalty_per_copy=EXCLUDED.royalty_per_copy, copies_sold=EXCLUDED.copies_sold,
             royalty_earned=EXCLUDED.royalty_earned, royalty_paid=EXCLUDED.royalty_paid, royalty_pending=EXCLUDED.royalty_pending,
             last_payout_date=EXCLUDED.last_payout_date, print_partner=EXCLUDED.print_partner, available_on=EXCLUDED.available_on`,
          [b.book_id, a.author_id, b.title, b.isbn, b.genre, b.publication_date, b.status, b.mrp, b.author_royalty_per_copy,
           b.total_copies_sold ?? 0, b.total_royalty_earned ?? 0, b.royalty_paid ?? 0, b.royalty_pending ?? 0,
           b.last_royalty_payout_date, b.print_partner, b.available_on || []]);
      }
    }
    for (const ad of ADMINS) {
      await c.query(`INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,'admin') ON CONFLICT (email) DO NOTHING`, [ad.email, adminHash, ad.name]);
    }
  });

  if (config.seedDemoTickets) {
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM tickets');
    if (n === 0) await seedDemoTickets();
  }
}

async function seedDemoTickets() {
  const { rows: admins } = await query(`SELECT id, email FROM users WHERE role='admin' ORDER BY id`);
  const adminId = (i) => admins.find((a) => a.email === ADMINS[i].email)?.id ?? null;
  await withTx(async (c) => {
    for (const t of DEMO_TICKETS) {
      const { rows: [ins] } = await c.query(
        `INSERT INTO tickets (author_id, book_id, subject, description, status, category, priority, ai_status, assigned_to, created_at, updated_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'skipped',$8, now() - make_interval(days => $9::int), now() - make_interval(days => $9::int),
                 CASE WHEN $5 = 'Resolved' THEN now() - interval '4 days' ELSE NULL END) RETURNING id`,
        [t.author, t.book, t.subject, t.description, t.status, t.category, t.priority, t.assignee != null ? adminId(t.assignee) : null, t.daysAgo]);
      for (const m of t.messages || []) {
        const sender = m.role === 'admin' ? adminId(t.assignee ?? 0) : (await c.query('SELECT id FROM users WHERE author_id=$1', [t.author])).rows[0]?.id;
        await c.query(
          `INSERT INTO ticket_messages (ticket_id, sender_role, sender_id, body, created_at) VALUES ($1,$2,$3,$4, now() - make_interval(days => $5::int))`,
          [ins.id, m.role, sender, m.body, m.daysAgo]);
      }
    }
  });
  console.log(`Seeded ${DEMO_TICKETS.length} demo tickets`);
}

// `npm run seed`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedAll().then(() => { console.log('Seed complete'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
