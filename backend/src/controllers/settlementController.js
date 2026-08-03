import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { requireUuid, requireInt, requireString } from '../utils/validation.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { getGroupMemberIds } from '../services/membership.js';
import { invalidateGroupStats } from '../services/cacheService.js';
import { triggerEvent, groupChannel } from '../services/pusherService.js';

function publicUser(user) {
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

function publicSettlement(s) {
  return {
    id: s.id,
    groupId: s.groupId,
    from: publicUser(s.fromUser),
    to: publicUser(s.toUser),
    amountCents: s.amountCents,
    currency: s.currency,
    settledAt: s.settledAt,
    createdAt: s.createdAt,
  };
}

// POST /groups/:groupId/settlements — record a payment from one member to
// another. Membership of the caller is enforced by requireGroupMember (403);
// both parties must also be members of the group.
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

    const memberIds = await getGroupMemberIds(groupId);
    if (!memberIds.has(fromUserId) || !memberIds.has(toUserId)) {
      throw new NotFoundError('Both users must be members of the group');
    }

    const settlement = await prisma.settlement.create({
      data: { groupId, fromUserId, toUserId, amountCents, currency },
      include: { fromUser: true, toUser: true },
    });

    // Stats derived from group activity may change; drop cached entries.
    invalidateGroupStats(groupId);

    await triggerEvent(groupChannel(groupId), 'expense-settled', {
      settlement: publicSettlement(settlement),
    });

    return sendSuccess(res, 201, { settlement: publicSettlement(settlement) });
  } catch (err) {
    return next(err);
  }
}
