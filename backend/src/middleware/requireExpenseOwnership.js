import { prisma } from '../lib/prisma.js';
import { sendError } from '../utils/response.js';

// Ownership guard for expense mutations (PATCH/DELETE). Runs AFTER the group
// membership check. Confirms the expense belongs to the group in the URL and
// that the requester either paid for it or is the group creator. Returns 403
// otherwise. Additive — the controllers keep their own group/expense checks.
export async function requireExpenseOwnership(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        groupId: true,
        paidById: true,
        group: { select: { createdById: true } },
      },
    });

    if (!expense || expense.groupId !== groupId) {
      return sendError(res, 403, 'You are not allowed to modify this expense');
    }

    const isPayer = expense.paidById === req.user.id;
    const isCreator = expense.group?.createdById === req.user.id;
    if (!isPayer && !isCreator) {
      return sendError(
        res,
        403,
        'Only the person who paid or the group creator can modify this expense'
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
}
