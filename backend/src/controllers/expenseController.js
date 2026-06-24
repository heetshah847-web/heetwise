import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import {
  requireString,
  requireInt,
  requireUuid,
  requireArray,
  requireEnum,
} from '../utils/validation.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { assertMembership, getGroupMemberIds } from '../services/membership.js';
import { computeEqualSplits, buildExactSplits } from '../utils/split.js';

const SPLIT_TYPES = ['EQUAL', 'EXACT'];

function publicUser(user) {
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

function publicExpense(expense) {
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    amountCents: expense.amountCents,
    splitType: expense.splitType,
    paidBy: publicUser(expense.paidBy),
    createdById: expense.createdById,
    createdAt: expense.createdAt,
    splits: expense.splits?.map((s) => ({
      user: publicUser(s.user),
      amountCents: s.amountCents,
    })),
  };
}

// Validate inputs and resolve the per-participant split amounts.
// Returns { splitType, paidById, splits: [{ userId, amountCents }] }.
async function resolveExpenseInput(groupId, body, currentUserId) {
  const description = requireString(body?.description, 'description', { max: 200 });
  const amountCents = requireInt(body?.amountCents, 'amountCents', { min: 1 });
  const splitType = requireEnum(body?.splitType ?? 'EQUAL', 'splitType', SPLIT_TYPES);
  const paidById = body?.paidById
    ? requireUuid(body.paidById, 'paidById')
    : currentUserId;

  const memberIds = await getGroupMemberIds(groupId);
  if (!memberIds.has(paidById)) {
    throw new ValidationError('paidById must be a member of the group');
  }

  let splits;
  if (splitType === 'EQUAL') {
    const participantIds = requireArray(body?.participantIds, 'participantIds', {
      min: 1,
    });
    for (const id of participantIds) {
      requireUuid(id, 'participantIds[]');
      if (!memberIds.has(id)) {
        throw new ValidationError('All participants must be group members');
      }
    }
    splits = computeEqualSplits(amountCents, participantIds);
  } else {
    const raw = requireArray(body?.splits, 'splits', { min: 1 });
    const participants = raw.map((s) => ({
      userId: requireUuid(s?.userId, 'splits[].userId'),
      amountCents: requireInt(s?.amountCents, 'splits[].amountCents', { min: 0 }),
    }));
    for (const p of participants) {
      if (!memberIds.has(p.userId)) {
        throw new ValidationError('All participants must be group members');
      }
    }
    splits = buildExactSplits(amountCents, participants);
  }

  return { description, amountCents, splitType, paidById, splits };
}

// POST /groups/:groupId/expenses
export async function createExpense(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);
    const input = await resolveExpenseInput(groupId, req.body, req.user.id);

    const expense = await prisma.expense.create({
      data: {
        groupId,
        description: input.description,
        amountCents: input.amountCents,
        splitType: input.splitType,
        paidById: input.paidById,
        createdById: req.user.id,
        splits: { create: input.splits },
      },
      include: { paidBy: true, splits: { include: { user: true } } },
    });
    return sendSuccess(res, 201, { expense: publicExpense(expense) });
  } catch (err) {
    return next(err);
  }
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// GET /groups/:groupId/expenses?limit=&cursor=
// Cursor-based pagination — never an unbounded query. `limit` is clamped to
// [1, 100]; `cursor` is the id of the last expense from the previous page.
export async function listExpenses(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);

    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(parsedLimit)
      ? DEFAULT_PAGE_SIZE
      : Math.min(Math.max(parsedLimit, 1), MAX_PAGE_SIZE);

    const cursor = req.query.cursor
      ? requireUuid(req.query.cursor, 'cursor')
      : null;

    // Fetch one extra row to know whether there's a next page. Order by a
    // unique tiebreaker (id) so the cursor is stable.
    const rows = await prisma.expense.findMany({
      where: { groupId },
      include: { paidBy: true, splits: { include: { user: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return sendSuccess(res, 200, {
      expenses: page.map(publicExpense),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    return next(err);
  }
}

// Load an expense and confirm it belongs to the group (404 otherwise).
async function loadGroupExpense(groupId, expenseId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { paidBy: true, splits: { include: { user: true } } },
  });
  if (!expense || expense.groupId !== groupId) {
    throw new NotFoundError('Expense not found');
  }
  return expense;
}

// GET /groups/:groupId/expenses/:expenseId
export async function getExpense(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;
    await assertMembership(groupId, req.user.id);
    const expense = await loadGroupExpense(groupId, expenseId);
    return sendSuccess(res, 200, { expense: publicExpense(expense) });
  } catch (err) {
    return next(err);
  }
}

// PATCH /groups/:groupId/expenses/:expenseId — replaces the expense's splits.
export async function updateExpense(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;
    await assertMembership(groupId, req.user.id);
    await loadGroupExpense(groupId, expenseId); // 404 if not in group
    const input = await resolveExpenseInput(groupId, req.body, req.user.id);

    // Replace splits atomically with the updated set.
    const expense = await prisma.$transaction(async (tx) => {
      await tx.split.deleteMany({ where: { expenseId } });
      return tx.expense.update({
        where: { id: expenseId },
        data: {
          description: input.description,
          amountCents: input.amountCents,
          splitType: input.splitType,
          paidById: input.paidById,
          splits: { create: input.splits },
        },
        include: { paidBy: true, splits: { include: { user: true } } },
      });
    });
    return sendSuccess(res, 200, { expense: publicExpense(expense) });
  } catch (err) {
    return next(err);
  }
}

// DELETE /groups/:groupId/expenses/:expenseId
export async function deleteExpense(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;
    await assertMembership(groupId, req.user.id);
    await loadGroupExpense(groupId, expenseId); // 404 if not in group
    await prisma.expense.delete({ where: { id: expenseId } });
    return sendSuccess(res, 200, { id: expenseId });
  } catch (err) {
    return next(err);
  }
}
