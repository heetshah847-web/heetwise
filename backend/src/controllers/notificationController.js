import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { computeBalances, simplifyDebts } from '../utils/balance.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Stable, order-independent key for a pair of users.
const pairKey = (a, b) => [a, b].sort().join(':');

// GET /notifications — for the current user, surface every debt (in a group
// they belong to) that is still outstanding AND whose oldest contributing
// expense is more than 7 days old, unless a settlement between the two parties
// has been recorded within the last 7 days.
//
// A "debt" here is one leg of the simplified settlement plan for a group that
// involves the current user (either as payer or payee).
export async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const now = Date.now();
    const cutoff = new Date(now - SEVEN_DAYS_MS);

    const groups = await prisma.group.findMany({
      where: { members: { some: { userId } } },
      include: { members: { include: { user: true } } },
    });

    const notifications = [];

    for (const group of groups) {
      const expenses = await prisma.expense.findMany({
        where: { groupId: group.id },
        select: {
          amountCents: true,
          paidById: true,
          createdAt: true,
          splits: { select: { userId: true, amountCents: true } },
        },
      });
      if (expenses.length === 0) continue;

      // Only debts whose oldest expense is older than 7 days qualify.
      const oldest = expenses.reduce(
        (min, e) => (e.createdAt < min ? e.createdAt : min),
        expenses[0].createdAt
      );
      if (oldest >= cutoff) continue;

      const balances = computeBalances(expenses);
      const plan = simplifyDebts(balances);
      const myDebts = plan.filter((t) => t.from === userId || t.to === userId);
      if (myDebts.length === 0) continue;

      // Recently-recorded settlements for this group involving the user.
      const recentSettlements = await prisma.settlement.findMany({
        where: {
          groupId: group.id,
          settledAt: { gte: cutoff },
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        select: { fromUserId: true, toUserId: true },
      });
      const settledPairs = new Set(
        recentSettlements.map((s) => pairKey(s.fromUserId, s.toUserId))
      );

      const userById = new Map(
        group.members.map((m) => [m.userId, m.user])
      );

      for (const t of myDebts) {
        const otherId = t.from === userId ? t.to : t.from;
        if (settledPairs.has(pairKey(userId, otherId))) continue; // just settled
        const other = userById.get(otherId);
        notifications.push({
          type: 'UNSETTLED_DEBT',
          direction: t.from === userId ? 'you_owe' : 'owes_you',
          groupId: group.id,
          groupName: group.name,
          otherPersonId: otherId,
          otherPersonName: other ? other.name || other.email : 'Someone',
          amountCents: t.amountCents,
          currency: 'USD',
        });
      }
    }

    // Biggest debts first.
    notifications.sort((a, b) => b.amountCents - a.amountCents);

    return sendSuccess(res, 200, {
      notifications,
      count: notifications.length,
    });
  } catch (err) {
    return next(err);
  }
}
