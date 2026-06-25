import { prisma } from '../lib/prisma.js';
import { sendError } from '../utils/response.js';

// Group-membership authorization middleware for the stats endpoints.
// Unlike assertMembership (which returns 404 to avoid leaking existence), the
// stats spec explicitly requires 403 for non-members, so this is a separate,
// purpose-built guard.
export async function requireGroupMember(req, res, next) {
  try {
    const { groupId } = req.params;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user.id } },
    });
    if (!membership) {
      return sendError(res, 403, 'You are not a member of this group');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
