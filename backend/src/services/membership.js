import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../utils/errors.js';

// Access control for the smart-split domain is by group membership.
// Returns the membership, or throws NotFoundError so non-members can't even
// tell whether a group exists (don't leak existence).
export async function assertMembership(groupId, userId) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new NotFoundError('Group not found');
  }
  return membership;
}

// Set of user ids that belong to a group — used to validate that an expense's
// payer and participants are all members.
export async function getGroupMemberIds(groupId) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return new Set(members.map((m) => m.userId));
}
