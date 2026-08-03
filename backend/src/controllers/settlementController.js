import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { requireUuid, requireInt, requireString } from '../utils/validation.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { assertMembership } from '../services/membership.js';
import {
  invalidateGroupStats,
  invalidateSummaries,
} from '../services/cacheService.js';
import {
  triggerEvent,
  groupChannel,
  userChannel,
} from '../services/pusherService.js';
import { sendPushNotification } from '../services/notificationService.js';

function publicUser(user) {
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

function publicSettlement(s) {
  return {
    id: s.id,
    groupId: s.groupId,
    from: publicUser(s.fromUser),
    to: publicUser(s.toUser),
    fromUserId: s.fromUserId,
    toUserId: s.toUserId,
    amountCents: s.amountCents,
    currency: s.currency,
    settledAt: s.settledAt,
    createdAt: s.createdAt,
  };
}

const centsToUsd = (cents) => (cents / 100).toFixed(2);

// POST /groups/:groupId/settlements — record that `fromUserId` paid `toUserId`
// to settle their debt in this group. requireGroupMember (403) already proved
// the caller is a member; everything else runs in ONE transaction so either the
// whole settle-up succeeds or nothing changes.
export async function createSettlement(req, res, next) {
  try {
    const { groupId } = req.params;
    const fromUserId = requireUuid(req.body?.fromUserId, 'fromUserId');
    const toUserId = requireUuid(req.body?.toUserId, 'toUserId');
    const amountCents = requireInt(req.body?.amountCents, 'amountCents', {
      min: 1,
    });
    const currency = requireString(req.body?.currency ?? 'USD', 'currency', {
      min: 3,
      max: 3,
    }).toUpperCase();

    if (fromUserId === toUserId) {
      throw new ValidationError('fromUserId and toUserId must be different');
    }

    const settlement = await prisma.$transaction(async (tx) => {
      // 1. The caller must be a member of the group. (Defense in depth: the
      //    route guard already enforces this, but the spec wants it inside the
      //    transaction so the whole operation is self-contained.)
      const callerMember = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: req.user.id } },
      });
      if (!callerMember) throw new NotFoundError('Group not found');

      // Both parties must be members too.
      const members = await tx.groupMember.findMany({
        where: { groupId, userId: { in: [fromUserId, toUserId] } },
        select: { userId: true },
      });
      if (members.length !== 2) {
        throw new NotFoundError('Both users must be members of the group');
      }

      // 2. There must be an actual outstanding debt where fromUser owes toUser.
      //    fromUser's debt = their unsettled shares on expenses toUser paid,
      //    minus toUser's unsettled shares on expenses fromUser paid.
      const [owed, reverse] = await Promise.all([
        tx.split.aggregate({
          where: {
            userId: fromUserId,
            isSettled: false,
            expense: { groupId, paidById: toUserId },
          },
          _sum: { amountCents: true },
        }),
        tx.split.aggregate({
          where: {
            userId: toUserId,
            isSettled: false,
            expense: { groupId, paidById: fromUserId },
          },
          _sum: { amountCents: true },
        }),
      ]);
      const outstanding =
        (owed._sum.amountCents || 0) - (reverse._sum.amountCents || 0);
      if (outstanding <= 0) {
        throw new ValidationError(
          'There is no outstanding balance to settle between these users'
        );
      }

      // 3. Record the settlement.
      const created = await tx.settlement.create({
        data: { groupId, fromUserId, toUserId, amountCents, currency },
        include: { fromUser: true, toUser: true },
      });

      // 4. Mark every split representing debt BETWEEN these two users (in either
      //    direction, in this group) as settled — this is a full settle-up, so
      //    the pairwise balance drops to exactly zero.
      await Promise.all([
        tx.split.updateMany({
          where: {
            userId: fromUserId,
            isSettled: false,
            expense: { groupId, paidById: toUserId },
          },
          data: { isSettled: true },
        }),
        tx.split.updateMany({
          where: {
            userId: toUserId,
            isSettled: false,
            expense: { groupId, paidById: fromUserId },
          },
          data: { isSettled: true },
        }),
      ]);

      return created;
    });

    // 5. Invalidate cached stats + summary for this group (balances/stats are
    //    derived data). node-cache entries for group stats embed the groupId;
    //    the summary endpoint is per-user, so drop both parties' summary keys.
    invalidateGroupStats(groupId);
    invalidateSummaries([fromUserId, toUserId]);

    const shaped = publicSettlement(settlement);

    // Real-time cascade (all best-effort; no-ops when Pusher is unconfigured).
    await Promise.all([
      triggerEvent(groupChannel(groupId), 'settlement-created', {
        fromUserId,
        toUserId,
        amountCents,
        settlement: shaped,
      }),
      triggerEvent(userChannel(fromUserId), 'balance-updated', {
        groupId,
        withUserId: toUserId,
      }),
      triggerEvent(userChannel(toUserId), 'balance-updated', {
        groupId,
        withUserId: fromUserId,
      }),
    ]);

    // Push the person who was owed a "settled with you" notification.
    const payerName =
      settlement.fromUser.name || settlement.fromUser.email || 'Someone';
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    });
    await sendPushNotification(toUserId, {
      title: 'Debt settled',
      body: `${payerName} settled $${centsToUsd(amountCents)} with you in ${
        group?.name ?? 'your group'
      }`,
    });

    // Return the created settlement and the (now zero) balance between the pair.
    return sendSuccess(res, 201, {
      settlement: shaped,
      balance: { fromUserId, toUserId, netAmountCents: 0 },
    });
  } catch (err) {
    return next(err);
  }
}

// GET /groups/:groupId/settlements — full settlement history for the group,
// most recent first. Membership is enforced by the route guard.
export async function listSettlements(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id); // 404 for non-members
    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: { fromUser: true, toUser: true },
      orderBy: { settledAt: 'desc' },
    });
    return sendSuccess(res, 200, {
      settlements: settlements.map(publicSettlement),
    });
  } catch (err) {
    return next(err);
  }
}
