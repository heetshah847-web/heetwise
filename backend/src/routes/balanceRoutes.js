import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getBalancesSummary } from '../controllers/balanceController.js';

const router = Router();

// All balance routes require authentication.
router.use(requireAuth);

// GET /balances/summary — cross-group net balances for the current user.
router.get('/summary', getBalancesSummary);

export default router;
