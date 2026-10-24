import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { config } from '../config.js';
import { authenticate, requireRole, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, notFound, wrap } from '../utils/errors.js';
import * as v from '../validators.js';
import * as tickets from '../services/tickets.js';
import * as triage from '../services/triage.js';
import { listBooks, getBook } from '../services/books.js';
import { aiEnabled } from '../services/ai.js';

const router = Router();

// ------------------------------------------------------------------------------------------ public
router.get('/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok', ai: aiEnabled() ? 'configured' : 'not configured', model: { classify: config.ai.classifyModel, draft: config.ai.draftModel } });
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Please try again in a few minutes.' } },
});
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // equalises timing when the email doesn't exist

router.post('/auth/login', loginLimiter, validate(v.loginSchema), wrap(async (req, res) => {
  const { email, password } = req.body;
  const { rows: [u] } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  res.json({ token: signToken(u), user: { id: u.id, name: u.name, email: u.email, role: u.role, authorId: u.author_id } });
}));

// ------------------------------------------------------------------------------- everything below needs a valid token
router.use(authenticate);

router.get('/auth/me', wrap(async (req, res) => {
  const { rows: [u] } = await query('SELECT id, name, email, role, author_id FROM users WHERE id = $1', [req.user.id]);
  if (!u) throw new AppError(401, 'Account no longer exists', 'INVALID_TOKEN');
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, authorId: u.author_id } });
}));

// ------------------------------------------------------------------------------------------ books
// Authors: always scoped to their own authorId taken from the token (never from the request).
// Admins: can see everything, optionally filtered with ?authorId=
router.get('/books', wrap(async (req, res) => {
  const authorId = req.user.role === 'author' ? req.user.authorId : (req.query.authorId || undefined);
  res.json({ items: await listBooks({ authorId }) });
}));

router.get('/books/:bookId', validate(v.bookIdParams, 'params'), wrap(async (req, res) => {
  const book = await getBook(req.params.bookId, { authorId: req.user.role === 'author' ? req.user.authorId : undefined });
  if (!book) throw notFound('Book');
  res.json({ book });
}));

// ------------------------------------------------------------------------------------------ author tickets
const author = requireRole('author');
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `u${req.user.id}`, // per author, protects AI spend from spam
  message: { error: { code: 'RATE_LIMITED', message: 'You have submitted a lot of tickets this hour. Please wait a bit, or reply on an existing ticket.' } },
});

router.post('/tickets', author, createLimiter, validate(v.createTicketSchema), wrap(async (req, res) => {
  const id = await tickets.createTicket({ authorId: req.user.authorId, ...req.body });
  triage.classifyInBackground(id); // not awaited: ticket creation never waits on (or fails because of) the AI
  res.status(201).json({ ticket: await tickets.getForAuthor(req.user.authorId, id) });
}));

router.get('/tickets', author, wrap(async (req, res) => {
  res.json({ items: await tickets.listForAuthor(req.user.authorId) });
}));

router.get('/tickets/:id', author, validate(v.idParams, 'params'), wrap(async (req, res) => {
  res.json({ ticket: await tickets.getForAuthor(req.user.authorId, req.params.id) });
}));

router.post('/tickets/:id/messages', author, validate(v.idParams, 'params'), validate(v.messageSchema), wrap(async (req, res) => {
  await tickets.addAuthorMessage(req.user.authorId, req.user, req.params.id, req.body.body);
  res.status(201).json({ ticket: await tickets.getForAuthor(req.user.authorId, req.params.id) });
}));

// ------------------------------------------------------------------------------------------ admin
const admin = Router();
admin.use(requireRole('admin'));

admin.get('/stats', wrap(async (_req, res) => res.json(await tickets.stats())));
admin.get('/admins', wrap(async (_req, res) => res.json({ items: await tickets.listAdmins() })));

admin.get('/tickets', validate(v.adminListQuery, 'query'), wrap(async (req, res) => {
  res.json(await tickets.listForAdmin(req.query, req.user.id));
}));
admin.get('/tickets/:id', validate(v.idParams, 'params'), wrap(async (req, res) => {
  res.json({ ticket: await tickets.getAdminDetail(req.params.id) });
}));
admin.patch('/tickets/:id', validate(v.idParams, 'params'), validate(v.patchTicketSchema), wrap(async (req, res) => {
  await tickets.updateTicket(req.params.id, req.body, req.user);
  res.json({ ticket: await tickets.getAdminDetail(req.params.id) });
}));
admin.post('/tickets/:id/reply', validate(v.idParams, 'params'), validate(v.replySchema), wrap(async (req, res) => {
  await tickets.addAdminReply(req.params.id, req.user, req.body.body, req.body.status);
  res.status(201).json({ ticket: await tickets.getAdminDetail(req.params.id) });
}));
admin.post('/tickets/:id/notes', validate(v.idParams, 'params'), validate(v.noteSchema), wrap(async (req, res) => {
  await tickets.addNote(req.params.id, req.user, req.body.body);
  res.status(201).json({ ticket: await tickets.getAdminDetail(req.params.id) });
}));
// Generates (or regenerates) the AI draft. Never fails because of the AI: falls back to a template.
admin.post('/tickets/:id/draft', validate(v.idParams, 'params'), wrap(async (req, res) => {
  await tickets.getAdminDetail(req.params.id); // 404 if missing
  res.json(await triage.generateDraft(req.params.id));
}));
// Re-run AI classification (e.g. after an outage). Does not overwrite admin overrides.
admin.post('/tickets/:id/reclassify', validate(v.idParams, 'params'), wrap(async (req, res) => {
  await tickets.resetAiStatus(req.params.id);
  await triage.classifyTicket(req.params.id);
  res.json({ ticket: await tickets.getAdminDetail(req.params.id) });
}));

router.use('/admin', admin);

router.use((_req, _res, next) => next(new AppError(404, 'Endpoint not found', 'NOT_FOUND')));
export default router;
