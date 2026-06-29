import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// 404 handler for unmatched routes.
export function notFound(req, res) {
  return sendError(res, 404, `Route not found: ${req.method} ${req.path}`);
}

// Defence-in-depth: scrub any secret value (rate-API key, JWT secret) out of a
// string before it is logged or returned to a client.
function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const secret of [
    process.env.EXCHANGE_RATE_API_KEY,
    process.env.JWT_SECRET,
  ]) {
    if (secret) out = out.split(secret).join('REDACTED');
  }
  return out;
}

// Centralized error handler — keeps the consistent { data, error, status }
// envelope, never leaks stack traces to clients, and redacts secrets from logs.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Disallowed CORS origin → 403 (rather than a generic 500).
  if (err?.message === 'Not allowed by CORS') {
    return sendError(res, 403, 'Origin not allowed');
  }

  if (err instanceof AppError) {
    return sendError(res, err.status, redactSecrets(err.message));
  }
  // Prisma: unique constraint violation -> 409, record not found -> 404.
  if (err?.code === 'P2002') {
    return sendError(res, 409, 'Resource already exists');
  }
  if (err?.code === 'P2025') {
    return sendError(res, 404, 'Not found');
  }

  // Log the sanitized error with a timestamp (stack in dev, message in prod).
  const logged = redactSecrets(env.isProduction ? err?.message : err?.stack) ?? '';
  console.error(`[${new Date().toISOString()}] ${logged}`);

  // Clients never see internal details/stack traces. Dev gets the sanitized
  // message; production gets a generic message.
  const message = env.isProduction
    ? 'Internal server error'
    : redactSecrets(err?.message) || 'Internal server error';
  return sendError(res, 500, message);
}
