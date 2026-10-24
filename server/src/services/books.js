import { query } from '../db.js';
import { describeRoyalty, isLive, productionStage } from './royalty.js';

const COLS = `book_id, author_id, title, isbn, genre, publication_date, status, mrp, royalty_per_copy, copies_sold,
  royalty_earned, royalty_paid, royalty_pending, last_payout_date, print_partner, available_on`;

export function serializeBook(r, authorPending, now = new Date()) {
  const live = isLive(r);
  const stage = live ? { name: null, index: -1 } : productionStage(r.status);
  return {
    bookId: r.book_id,
    authorId: r.author_id,
    title: r.title,
    isbn: r.isbn,
    genre: r.genre,
    publicationDate: r.publication_date,
    status: r.status,
    isLive: live,
    productionStage: stage.name,
    productionStageIndex: stage.index,
    mrp: r.mrp,
    royaltyPerCopy: r.royalty_per_copy,
    copiesSold: r.copies_sold,
    royaltyEarned: r.royalty_earned,
    royaltyPaid: r.royalty_paid,
    royaltyPending: r.royalty_pending,
    lastPayoutDate: r.last_payout_date,
    printPartner: r.print_partner,
    availableOn: r.available_on || [],
    royalty: describeRoyalty(r, authorPending, now),
  };
}

function serializeMany(rows) {
  const pendingByAuthor = {};
  for (const r of rows) pendingByAuthor[r.author_id] = (pendingByAuthor[r.author_id] || 0) + r.royalty_pending;
  return rows.map((r) => serializeBook(r, pendingByAuthor[r.author_id]));
}

export async function listBooks({ authorId } = {}) {
  const { rows } = await query(
    `SELECT ${COLS} FROM books ${authorId ? 'WHERE author_id = $1' : ''}
     ORDER BY author_id, publication_date DESC NULLS FIRST, book_id`,
    authorId ? [authorId] : [],
  );
  return serializeMany(rows);
}

export async function getBook(bookId, { authorId } = {}) {
  const { rows } = await query(`SELECT ${COLS} FROM books WHERE book_id = $1 ${authorId ? 'AND author_id = $2' : ''}`, authorId ? [bookId, authorId] : [bookId]);
  if (!rows[0]) return null;
  const { rows: [{ total }] } = await query('SELECT COALESCE(SUM(royalty_pending),0)::int AS total FROM books WHERE author_id = $1', [rows[0].author_id]);
  return serializeBook(rows[0], total);
}
