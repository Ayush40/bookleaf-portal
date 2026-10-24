import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

/** Verifies the Bearer token and attaches req.user = { id, role, authorId, name }. */
export function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'Authentication required', 'UNAUTHENTICATED'));
  try {
    const p = jwt.verify(token, config.jwtSecret);
    req.user = { id: Number(p.sub), role: p.role, authorId: p.authorId || null, name: p.name };
    next();
  } catch {
    next(new AppError(401, 'Your session has expired. Please log in again.', 'INVALID_TOKEN'));
  }
}

/** Role-based access control: requireRole('admin') / requireRole('author'). */
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : next(new AppError(403, 'You do not have access to this resource', 'FORBIDDEN'));

export function signToken(user) {
  return jwt.sign(
    { role: user.role, authorId: user.author_id || null, name: user.name },
    config.jwtSecret,
    { subject: String(user.id), expiresIn: config.jwtExpiresIn },
  );
}
