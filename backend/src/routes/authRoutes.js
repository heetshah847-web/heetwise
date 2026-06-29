import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { handleValidationErrors } from '../middleware/handleValidationErrors.js';
import { registerValidators, loginValidators } from '../middleware/validators.js';

const router = Router();

// Brute-force protection: max 10 requests / 15 min / IP on all auth routes
// (covers POST /login and POST /register).
router.use(authRateLimiter);

router.post('/register', registerValidators, handleValidationErrors, register);
router.post('/login', loginValidators, handleValidationErrors, login);
router.post('/logout', logout);

// Protected: reads JWT from the httpOnly cookie.
router.get('/me', requireAuth, me);

export default router;
