import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

// Rate limit all auth routes: max 10 requests / 15 min / IP.
router.use(authRateLimiter);

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected: reads JWT from the httpOnly cookie.
router.get('/me', requireAuth, me);

export default router;
