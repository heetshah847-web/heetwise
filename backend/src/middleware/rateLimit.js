import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/response.js';

// Rate limiter for /auth routes: max 10 requests per 15 minutes per IP.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
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
