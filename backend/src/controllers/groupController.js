import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { requireString, optionalString } from '../utils/validation.js';
import { ForbiddenError } from '../utils/errors.js';
import { assertMembership } from '../services/membership.js';
import {
  computeBalances,
  simplifyDebts,
  withoutSettledSplits,
} from '../utils/balance.js';

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function publicGroup(group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    createdById: group.createdById,
    createdAt: group.createdAt,
    members: group.members?.map((m) => publicUser(m.user)),
  };
}

// POST /groups — create a group; the creator is added as the first member.
export async function createGroup(req, res, next) {
  try {
    const name = requireString(req.body?.name, 'name', { max: 120 });
    const description = optionalString(req.body?.description, 'description', {
      max: 500,
    });
    const group = await prisma.group.create({
      data: {
        name,
        description,
        createdById: req.user.id,
        members: { create: { userId: req.user.id } },
      },
      include: { members: { include: { user: true } } },
    });
    return sendSuccess(res, 201, { group: publicGroup(group) });
  } catch (err) {
    return next(err);
  }
}

// GET /groups — list groups the current user belongs to.
export async function listGroups(req, res, next) {
  try {
    const groups = await prisma.group.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: { members: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return sendSuccess(res, 200, { groups: groups.map(publicGroup) });
  } catch (err) {
    return next(err);
  }
}

// GET /groups/:groupId — fetch one group (members only; 404 otherwise).
export async function getGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { include: { user: true } } },
    });
    return sendSuccess(res, 200, { group: publicGroup(group) });
  } catch (err) {
    return next(err);
  }
}

// PATCH /groups/:groupId — rename (members only).
export async function updateGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);
    const name = requireString(req.body?.name, 'name', { max: 120 });
    const group = await prisma.group.update({
      where: { id: groupId },
      data: { name },
      include: { members: { include: { user: true } } },
    });
    return sendSuccess(res, 200, { group: publicGroup(group) });
  } catch (err) {
    return next(err);
  }
}

// DELETE /groups/:groupId — only the creator may delete the group.
export async function deleteGroup(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (group.createdById !== req.user.id) {
      // Member but not the creator — they can see it, so 403 is honest here.
      throw new ForbiddenError('Only the group creator can delete this group');
    }
    await prisma.group.delete({ where: { id: groupId } });
    return sendSuccess(res, 200, { id: groupId });
  } catch (err) {
    return next(err);
  }
}

// NOTE: adding a member by email is now handled by the invitation flow
// (see controllers/invitationController.js — createInvitation). A user only
// joins a group after accepting their invitation, so there is no longer a
// "direct add" here.

// GET /groups/:groupId/balances — net balances + simplified settlements.
export async function getBalances(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);

    const rawExpenses = await prisma.expense.findMany({
      where: { groupId },
      select: {
        paidById: true,
        amountCents: true,
        splits: { select: { userId: true, amountCents: true, isSettled: true } },
      },
    });

    // Exclude already-settled splits so a settled debt shows as zero.
    const expenses = withoutSettledSplits(rawExpenses);
    const balances = computeBalances(expenses);
    const settlements = simplifyDebts(balances);

    // Attach user info for display.
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
    });
    const userById = new Map(members.map((m) => [m.userId, publicUser(m.user)]));
    // Ensure members with zero activity still appear.
    for (const m of members) {
      if (!balances.find((b) => b.userId === m.userId)) {
        balances.push({ userId: m.userId, netCents: 0 });
      }
    }

    return sendSuccess(res, 200, {
      balances: balances.map((b) => ({
        user: userById.get(b.userId) ?? { id: b.userId },
        netCents: b.netCents,
      })),
      settlements: settlements.map((t) => ({
        from: userById.get(t.from) ?? { id: t.from },
        to: userById.get(t.to) ?? { id: t.to },
        amountCents: t.amountCents,
      })),
    });
  } catch (err) {
    return next(err);
  }
}
