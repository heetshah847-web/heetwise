import { prisma } from '../lib/prisma.js';
import { sendError } from '../utils/response.js';

// Runs before expense creation. Returns 400 (in the standard envelope) when the
// requested split is invalid, so the controller only ever sees valid input.
const VALID_SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENTAGE', 'WEIGHT'];

export async function validateSplit(req, res, next) {
  try {
    const { groupId } = req.params;
    const { amount, splitType, members } = req.body ?? {};

    if (!VALID_SPLIT_TYPES.includes(splitType)) {
      return sendError(
        res,
        400,
        `splitType must be one of: ${VALID_SPLIT_TYPES.join(', ')}`
      );
    }

    if (!Array.isArray(members) || members.length === 0) {
      return sendError(res, 400, 'members must be a non-empty array');
    }
    if (members.some((m) => !m || typeof m.userId !== 'string')) {
      return sendError(res, 400, 'every member must include a userId');
    }

    const userIds = members.map((m) => m.userId);
    if (new Set(userIds).size !== userIds.length) {
      return sendError(res, 400, 'members contains duplicate userIds');
    }

    // Every member must actually belong to this group.
    const found = await prisma.groupMember.findMany({
      where: { groupId, userId: { in: userIds } },
      select: { userId: true },
    });
    const foundSet = new Set(found.map((f) => f.userId));
    const missing = userIds.filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      return sendError(
        res,
        400,
        `These users are not members of the group: ${missing.join(', ')}`
      );
    }

    const totalAmount = Number(amount);
    if (!(totalAmount > 0)) {
      return sendError(res, 400, 'amount must be a positive number');
    }

    if (splitType === 'EXACT') {
      const sum = members.reduce((s, m) => s + Number(m.amount || 0), 0);
      if (Math.abs(sum - totalAmount) > 0.01) {
        return sendError(
          res,
          400,
          `Exact amounts must sum to ${totalAmount.toFixed(2)} ` +
            `(got ${sum.toFixed(2)})`
        );
      }
    } else if (splitType === 'PERCENTAGE') {
      const sum = members.reduce((s, m) => s + Number(m.percentage || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        return sendError(
          res,
          400,
          `Percentages must sum to exactly 100 (got ${sum})`
        );
      }
    } else if (splitType === 'WEIGHT') {
      if (members.some((m) => !(Number(m.weight) > 0))) {
        return sendError(res, 400, 'Every weight must be greater than zero');
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
}
