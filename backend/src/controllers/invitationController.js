import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { requireEmail, requireUuid } from '../utils/validation.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../utils/errors.js';
import { triggerEvent, userChannel } from '../services/pusherService.js';
import { sendPushNotification } from '../services/notificationService.js';
import { env } from '../config/env.js';

// Invitations expire 7 days after they are created.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function publicUser(user) {
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

// Shape returned to the invitee's "Requests" tab.
function publicInvitation(inv) {
  return {
    id: inv.id,
    groupId: inv.groupId,
    groupName: inv.group?.name ?? null,
    groupDescription: inv.group?.description ?? null,
    ownerName: inv.group?.createdBy
      ? inv.group.createdBy.name || inv.group.createdBy.email
      : null,
    invitedEmail: inv.invitedEmail,
    invitedBy: publicUser(inv.invitedBy),
    invitedByName: inv.invitedBy ? inv.invitedBy.name || inv.invitedBy.email : null,
    status: inv.status,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
  };
}

const withRelations = {
  group: { include: { createdBy: true } },
  invitedBy: true,
};

// Core: create a PENDING invitation for `email` to join `groupId`. Used by BOTH
// POST /groups/:groupId/invitations and the (repointed) POST
// /groups/:groupId/members flow — adding a member now means inviting them.
// The caller's membership is already enforced by requireGroupMember (403).
export async function createInvitation(req, res, next) {
  try {
    const { groupId } = req.params;
    const email = requireEmail(req.body?.email ?? req.body?.invitedEmail);

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundError('Group not found');

    // The invited email may or may not already belong to a registered user.
    const invitedUser = await prisma.user.findUnique({ where: { email } });

    if (invitedUser) {
      const alreadyMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: invitedUser.id } },
      });
      if (alreadyMember) {
        throw new ConflictError('User is already a member of this group');
      }
    }

    // Don't stack duplicate pending invitations for the same person/group.
    const pending = await prisma.groupInvitation.findFirst({
      where: { groupId, invitedEmail: email, status: 'PENDING' },
    });
    if (pending) {
      throw new ConflictError('An invitation is already pending for this email');
    }

    const created = await prisma.groupInvitation.create({
      data: {
        groupId,
        invitedEmail: email,
        invitedUserId: invitedUser?.id ?? null,
        invitedById: req.user.id,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      include: withRelations,
    });

    // Notify the invitee in real time if they already have an account.
    if (invitedUser) {
      await triggerEvent(userChannel(invitedUser.id), 'invitation-received', {
        invitation: publicInvitation(created),
      });
      const inviterName = req.user.name || req.user.email || 'Someone';
      await sendPushNotification(invitedUser.id, {
        title: `Group invitation`,
        body: `${inviterName} invited you to join ${group.name} — tap to accept`,
        url: `${env.frontendUrl}/requests`,
      });
    }

    return sendSuccess(res, 201, { invitation: publicInvitation(created) });
  } catch (err) {
    return next(err);
  }
}

// GET /invitations/pending — pending, non-expired invitations addressed to the
// current user's email.
export async function getPendingInvitations(req, res, next) {
  try {
    const invitations = await prisma.groupInvitation.findMany({
      where: {
        invitedEmail: req.user.email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: withRelations,
      orderBy: { createdAt: 'desc' },
    });
    return sendSuccess(res, 200, {
      invitations: invitations.map(publicInvitation),
    });
  } catch (err) {
    return next(err);
  }
}

// Load an invitation and confirm it is addressed to the current user (by email
// or by resolved user id). 404 if it isn't theirs — don't leak existence.
async function loadOwnInvitation(invitationId, user) {
  const id = requireUuid(invitationId, 'invitationId');
  const inv = await prisma.groupInvitation.findUnique({
    where: { id },
    include: withRelations,
  });
  const belongsToUser =
    inv &&
    (inv.invitedUserId === user.id ||
      inv.invitedEmail.toLowerCase() === user.email.toLowerCase());
  if (!belongsToUser) {
    throw new NotFoundError('Invitation not found');
  }
  return inv;
}

// POST /invitations/:invitationId/accept — join the group, mark ACCEPTED.
export async function acceptInvitation(req, res, next) {
  try {
    const inv = await loadOwnInvitation(req.params.invitationId, req.user);
    if (inv.status !== 'PENDING') {
      throw new ValidationError(`Invitation already ${inv.status.toLowerCase()}`);
    }
    if (inv.expiresAt < new Date()) {
      throw new ValidationError('Invitation has expired');
    }

    await prisma.$transaction(async (tx) => {
      // Idempotent membership: safe even if they were added by another path.
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: inv.groupId, userId: req.user.id } },
        update: {},
        create: { groupId: inv.groupId, userId: req.user.id },
      });
      await tx.groupInvitation.update({
        where: { id: inv.id },
        data: { status: 'ACCEPTED', invitedUserId: req.user.id },
      });
    });

    const group = await prisma.group.findUnique({
      where: { id: inv.groupId },
      include: { members: { include: { user: true } } },
    });

    return sendSuccess(res, 200, {
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        createdById: group.createdById,
        members: group.members.map((m) => publicUser(m.user)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

// POST /invitations/:invitationId/decline — mark DECLINED.
export async function declineInvitation(req, res, next) {
  try {
    const inv = await loadOwnInvitation(req.params.invitationId, req.user);
    if (inv.status !== 'PENDING') {
      throw new ValidationError(`Invitation already ${inv.status.toLowerCase()}`);
    }
    const updated = await prisma.groupInvitation.update({
      where: { id: inv.id },
      data: { status: 'DECLINED' },
      include: withRelations,
    });
    return sendSuccess(res, 200, { invitation: publicInvitation(updated) });
  } catch (err) {
    return next(err);
  }
}
