import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupMember } from '../middleware/requireGroupMember.js';
import { sendSuccess, sendError } from '../utils/response.js';
import * as stats from '../services/statsService.js';
import * as cache from '../services/cacheService.js';

const router = Router();

// All stats endpoints require authentication.
router.use(requireAuth);

// GET /stats/me — personal cross-group stats (auth only; personal data).
router.get('/me', async (req, res, next) => {
  try {
    const key = `stats:me:user:${req.user.id}`;
    const hit = cache.get(key);
    if (hit) return sendSuccess(res, 200, hit);

    const data = await stats.meStats(req.user.id);
    cache.set(key, data);
    return sendSuccess(res, 200, data);
  } catch (err) {
    return next(err);
  }
});

// GET /stats/groups/:groupId — group-wide stats (members only → 403 otherwise).
router.get('/groups/:groupId', requireGroupMember, async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const key = `stats:group:${groupId}:user:${req.user.id}`;
    const hit = cache.get(key);
    if (hit) return sendSuccess(res, 200, hit);

    const data = await stats.groupStats(groupId);
    cache.set(key, data);
    return sendSuccess(res, 200, data);
  } catch (err) {
    return next(err);
  }
});

// GET /stats/groups/:groupId/members/:memberId — per-member stats.
// Requester must be the member being queried OR the group admin (creator).
router.get(
  '/groups/:groupId/members/:memberId',
  requireGroupMember,
  async (req, res, next) => {
    try {
      const { groupId, memberId } = req.params;

      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { createdById: true },
      });
      const isSelf = req.user.id === memberId;
      const isAdmin = group?.createdById === req.user.id;
      if (!isSelf && !isAdmin) {
        return sendError(
          res,
          403,
          'You may only view your own stats unless you are the group admin'
        );
      }

      const isMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: memberId } },
      });
      if (!isMember) {
        return sendError(res, 404, 'That member is not in this group');
      }

      const key = `stats:group:${groupId}:member:${memberId}:user:${req.user.id}`;
      const hit = cache.get(key);
      if (hit) return sendSuccess(res, 200, hit);

      const data = await stats.memberStats(groupId, memberId);
      cache.set(key, data);
      return sendSuccess(res, 200, data);
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
