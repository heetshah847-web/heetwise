import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { get as cacheGet, set as cacheSet } from '../services/cacheService.js';

// GET /balances/summary — a complete cross-group financial summary for the
// current user.
//
// For every OTHER user the current user shares at least one group with, we net
// out, across ALL shared groups combined:
//   + every expense split where the CURRENT user paid  (the other owes us)
//   - every expense split where the OTHER user paid AND the current user is in
//     the splits                                        (we owe the other)
//
// All math is done on the authoritative `amountCents` stored on each split
// (already converted to USD when the expense was created). We NEVER recompute
// using exchange rates here — mirroring utils/balance.js.
//
// The whole computation is fed by ONE database round-trip: a single findMany
// that pulls the current user's groups with their members and every expense +
// its splits, then reduces in memory.
export async function getBalancesSummary(req, res, next) {
  try {
    const userId = req.user.id;

    // Cached per user; invalidated on settlement (see settlementController).
    const cacheKey = `summary:user:${userId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return sendSuccess(res, 200, cached);

    const groups = await prisma.group.findMany({
      where: { members: { some: { userId } } },
      select: {
        id: true,
        name: true,
        members: {
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        expenses: {
          where: { deletedAt: null },
          select: {
            paidById: true,
            splits: {
              select: { userId: true, amountCents: true, isSettled: true },
            },
          },
        },
      },
    });

    // Directory of every OTHER user we share a group with (id -> profile).
    const others = new Map();
    // Per-other net in cents (positive => they owe us, negative => we owe them).
    const netByOther = new Map();
    // Per-other per-group contribution: otherId -> Map(groupId -> cents).
    const groupNetByOther = new Map();
    const groupNames = new Map();

    const addNet = (otherId, groupId, delta) => {
      if (delta === 0) return;
      netByOther.set(otherId, (netByOther.get(otherId) || 0) + delta);
      let byGroup = groupNetByOther.get(otherId);
      if (!byGroup) {
        byGroup = new Map();
        groupNetByOther.set(otherId, byGroup);
      }
      byGroup.set(groupId, (byGroup.get(groupId) || 0) + delta);
    };

    for (const group of groups) {
      groupNames.set(group.id, group.name);

      // Register every co-member (other than us) so we know their profile even
      // if the net turns out to be zero.
      for (const { user } of group.members) {
        if (user.id !== userId && !others.has(user.id)) {
          others.set(user.id, user);
        }
      }

      for (const expense of group.expenses) {
        if (expense.paidById === userId) {
          // We paid: every other participant's UNSETTLED share is owed to us.
          for (const split of expense.splits) {
            if (split.isSettled) continue;
            if (split.userId !== userId) {
              addNet(split.userId, group.id, split.amountCents);
            }
          }
        } else {
          // Someone else paid: our own UNSETTLED share is owed to them.
          for (const split of expense.splits) {
            if (split.isSettled) continue;
            if (split.userId === userId) {
              addNet(expense.paidById, group.id, -split.amountCents);
            }
          }
        }
      }
    }

    let totalOwedToMe = 0;
    let totalIOwe = 0;

    const balances = [];
    for (const [otherId, other] of others) {
      const netAmountCents = netByOther.get(otherId) || 0;

      const byGroup = groupNetByOther.get(otherId);
      const groupBreakdown = byGroup
        ? [...byGroup.entries()]
            .filter(([, cents]) => cents !== 0)
            .map(([groupId, cents]) => ({
              groupId,
              groupName: groupNames.get(groupId),
              netAmountCents: cents,
            }))
            .sort((a, b) => Math.abs(b.netAmountCents) - Math.abs(a.netAmountCents))
        : [];

      if (netAmountCents > 0) totalOwedToMe += netAmountCents;
      else if (netAmountCents < 0) totalIOwe += -netAmountCents;

      balances.push({
        otherUserId: otherId,
        otherUserName: other.name || other.email,
        otherUserEmail: other.email,
        netAmountCents,
        currency: 'USD',
        groupBreakdown,
      });
    }

    // Largest absolute balances first for a stable, useful ordering.
    balances.sort(
      (a, b) => Math.abs(b.netAmountCents) - Math.abs(a.netAmountCents)
    );

    const result = {
      balances,
      totalOwedToMe,
      totalIOwe,
      currency: 'USD',
      generatedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, result);
    return sendSuccess(res, 200, result);
  } catch (err) {
    return next(err);
  }
}
