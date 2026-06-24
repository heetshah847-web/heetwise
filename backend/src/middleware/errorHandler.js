import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// 404 handler for unmatched routes.
export function notFound(req, res) {
  return sendError(res, 404, `Route not found: ${req.method} ${req.path}`);
}

// Defence-in-depth: if the exchange-rate API key ever ends up in an error
// message or stack, scrub it before it is logged or sent to the client.
function redactApiKey(text) {
  const key = process.env.EXCHANGE_RATE_API_KEY;
  if (!key || typeof text !== 'string') return text;
  return text.split(key).join('REDACTED');
}

// Centralized error handler — keeps the consistent JSON envelope.
// Maps typed AppErrors and known Prisma errors to the right status.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.status, redactApiKey(err.message));
  }
  // Prisma: unique constraint violation -> 409, record not found -> 404.
  if (err?.code === 'P2002') {
    return sendError(res, 409, 'Resource already exists');
  }
  if (err?.code === 'P2025') {
    return sendError(res, 404, 'Not found');
  }

  if (!env.isProduction) {
    console.error(redactApiKey(err?.stack) ?? redactApiKey(err?.message));
  }
  const message = env.isProduction
    ? 'Internal server error'
    : redactApiKey(err.message);
  return sendError(res, 500, message);
}
