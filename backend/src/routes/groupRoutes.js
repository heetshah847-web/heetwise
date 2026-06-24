import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addMember,
  getBalances,
} from '../controllers/groupController.js';
import {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenseController.js';
import { validateSplit } from '../middleware/validateSplit.js';

const router = Router();

// Every group/expense route requires authentication.
router.use(requireAuth);

// Groups
router.post('/', createGroup);
router.get('/', listGroups);
router.get('/:groupId', getGroup);
router.patch('/:groupId', updateGroup);
router.delete('/:groupId', deleteGroup);

// Membership
router.post('/:groupId/members', addMember);

// Balances + settlements
router.get('/:groupId/balances', getBalances);

// Expenses (nested under a group)
// validateSplit runs first so createExpense only ever sees a valid split.
router.post('/:groupId/expenses', validateSplit, createExpense);
router.get('/:groupId/expenses', listExpenses);
router.get('/:groupId/expenses/:expenseId', getExpense);
router.patch('/:groupId/expenses/:expenseId', updateExpense);
router.delete('/:groupId/expenses/:expenseId', deleteExpense);

export default router;
