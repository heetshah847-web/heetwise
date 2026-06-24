import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';

// 404 handler for unmatched routes.
export function notFound(req, res) {
  return sendError(res, 404, `Route not found: ${req.method} ${req.path}`);
}

// Centralized error handler — keeps the consistent JSON envelope.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (!env.isProduction) {
    console.error(err);
  }
  const message = env.isProduction ? 'Internal server error' : err.message;
  return sendError(res, 500, message);
}
