import { z } from 'zod';
import { CATEGORIES, PRIORITIES, STATUSES } from './constants.js';

const text = (label, min, max) =>
  z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

export const idParams = z.object({ id: z.coerce.number({ invalid_type_error: 'Invalid ticket id' }).int('Invalid ticket id').positive('Invalid ticket id') });
export const bookIdParams = z.object({ bookId: z.string().regex(/^BK\d+$/, 'Invalid book id') });

export const loginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address'),
  password: text('Password', 1, 200),
});

export const createTicketSchema = z.object({
  // null / missing / "general" => General / Account Level
  bookId: z.union([z.string().regex(/^BK\d+$/, 'Invalid book'), z.literal('general'), z.null()]).optional()
    .transform((v) => (v && v !== 'general' ? v : null)),
  subject: text('Subject', 5, 150),
  description: text('Description', 20, 5000),
  attachments: z.array(z.string().trim().min(1).max(200)).max(5, 'You can attach up to 5 files').optional().default([]),
});

export const messageSchema = z.object({ body: text('Message', 1, 5000) });

export const adminListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigned: z.string().regex(/^(me|unassigned|\d+)$/).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  sort: z.enum(['urgency', 'newest', 'oldest']).optional().default('urgency'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const patchTicketSchema = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.union([z.literal('me'), z.number().int().positive(), z.null()]).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const replySchema = z.object({
  body: text('Reply', 1, 5000),
  status: z.enum(STATUSES).optional(),
});
export const noteSchema = z.object({ body: text('Note', 1, 2000) });
