import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response.js';
import { env } from '../config/env.js';

// Factory so tests can build a limiter with a tiny budget. Defaults come from
// env (10 requests / 15 minutes / IP per the spec).
export function createAuthRateLimiter({
  max = env.authRateLimitMax,
  windowMs = env.authRateLimitWindowMs,
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      sendError(
        res,
        429,
        'Too many authentication attempts. Please try again later.'
      );
    },
  });
}

// Default limiter applied to all /auth routes.
export const authRateLimiter = createAuthRateLimiter();
