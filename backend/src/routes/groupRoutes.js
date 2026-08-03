import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  getBalances,
} from '../controllers/groupController.js';
import {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
} from '../controllers/expenseController.js';
import { createInvitation } from '../controllers/invitationController.js';
import {
  createSettlement,
  listSettlements,
} from '../controllers/settlementController.js';
import { validateSplit } from '../middleware/validateSplit.js';
import { requireGroupMember } from '../middleware/requireGroupMember.js';
import { requireExpenseOwnership } from '../middleware/requireExpenseOwnership.js';
import { handleValidationErrors } from '../middleware/handleValidationErrors.js';
import {
  groupCreateValidators,
  expenseCreateValidators,
} from '../middleware/validators.js';

const router = Router();

// Every group/expense route requires authentication.
router.use(requireAuth);

// Groups
// Reads keep the existing 404-for-non-members behavior (controllers); writes
// get an explicit 403 membership guard (requireGroupMember) per the security
// decision "403 on mutations, 404 on reads".
router.post('/', groupCreateValidators, handleValidationErrors, createGroup);
router.get('/', listGroups);
router.get('/:groupId', getGroup);
router.patch('/:groupId', requireGroupMember, updateGroup);
router.delete('/:groupId', requireGroupMember, deleteGroup);

// Membership: adding a member now creates an INVITATION rather than joining the
// user directly — they appear in the group only after they accept. Both the
// legacy /members path and the explicit /invitations path create an invitation.
router.post('/:groupId/members', requireGroupMember, createInvitation);
router.post('/:groupId/invitations', requireGroupMember, createInvitation);

// Balances + settlements (read → 404 via controller)
router.get('/:groupId/balances', getBalances);
router.get('/:groupId/settlements', listSettlements);
router.post('/:groupId/settlements', requireGroupMember, createSettlement);

// Expenses (nested under a group)
router.post(
  '/:groupId/expenses',
  requireGroupMember,
  expenseCreateValidators,
  handleValidationErrors,
  validateSplit,
  createExpense
);
router.get('/:groupId/expenses', listExpenses);
router.get('/:groupId/expenses/:expenseId', getExpense);
router.patch(
  '/:groupId/expenses/:expenseId',
  requireGroupMember,
  requireExpenseOwnership,
  updateExpense
);
router.delete(
  '/:groupId/expenses/:expenseId',
  requireGroupMember,
  requireExpenseOwnership,
  deleteExpense
);

export default router;
