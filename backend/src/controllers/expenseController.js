import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import {
  requireString,
  requireInt,
  requireUuid,
  requireArray,
  requireEnum,
} from '../utils/validation.js';
import {
  ValidationError,
  NotFoundError,
  ServiceUnavailableError,
} from '../utils/errors.js';
import { assertMembership, getGroupMemberIds } from '../services/membership.js';
import { computeEqualSplits, buildExactSplits } from '../utils/split.js';
import { calculateSplits } from '../services/splitService.js';
import { getRate } from '../services/rateService.js';
import { invalidateGroupStats } from '../services/cacheService.js';

// EQUAL/EXACT are the legacy two; PERCENTAGE/WEIGHT were added in the smart
// split phase. The full set is enforced by validateSplit + splitService.
const SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENTAGE', 'WEIGHT'];
const LEGACY_SPLIT_TYPES = ['EQUAL', 'EXACT'];

function publicUser(user) {
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

function publicExpense(expense) {
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    amountCents: expense.amountCents,
    currency: expense.currency,
    originalAmount: expense.originalAmount,
    exchangeRate: expense.exchangeRate,
    splitType: expense.splitType,
    paidBy: publicUser(expense.paidBy),
    createdById: expense.createdById,
    createdAt: expense.createdAt,
    splits: expense.splits?.map((s) => ({
      user: publicUser(s.user),
      amountCents: s.amountCents,
      percentage: s.percentage,
      weight: s.weight,
    })),
  };
}

// Legacy input resolver used by PATCH (update) only. Handles EQUAL/EXACT with
// the older `participantIds` / `splits[amountCents]` body shape. The smart
// create path below uses splitService instead. (PATCH support for
// PERCENTAGE/WEIGHT is a follow-up — see NEXT.md.)
// Returns { splitType, paidById, splits: [{ userId, amountCents }] }.
async function resolveExpenseInput(groupId, body, currentUserId) {
  const description = requireString(body?.description, 'description', { max: 200 });
  const amountCents = requireInt(body?.amountCents, 'amountCents', { min: 1 });
  const splitType = requireEnum(
    body?.splitType ?? 'EQUAL',
    'splitType',
    LEGACY_SPLIT_TYPES
  );
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
// Body: { description, amount (number, dollars), currency?, paidBy (uuid),
//         splitType, members: [{ userId, amount?|percentage?|weight? }] }
// validateSplit middleware has already verified the split is well-formed and
// every member belongs to the group. Here we compute the final shares with
// splitService and persist the expense + all splits in one transaction.
export async function createExpense(req, res, next) {
  try {
    const { groupId } = req.params;
    await assertMembership(groupId, req.user.id);

    const {
      description,
      amount,
      currency = 'USD',
      paidBy,
      splitType,
      members,
    } = req.body ?? {};

    const desc = requireString(description, 'description', { max: 200 });
    requireEnum(splitType, 'splitType', SPLIT_TYPES);
    const cur = requireString(currency ?? 'USD', 'currency', {
      min: 3,
      max: 3,
    }).toUpperCase();
    const originalAmount = Number(amount); // user-entered value, in `cur`
    if (!(originalAmount > 0)) {
      throw new ValidationError('amount must be a positive number');
    }
    const paidById = requireUuid(paidBy, 'paidBy');

    // The payer must also be a member (validateSplit only checks split members).
    const memberIds = await getGroupMemberIds(groupId);
    if (!memberIds.has(paidById)) {
      throw new ValidationError('paidBy must be a member of the group');
    }

    // ── Currency conversion (BEFORE the transaction) ──
    // USD passes through untouched; any other currency is converted to USD via
    // the cached rate. If no rate is cached, surface a clear 503 (not a 500).
    let exchangeRate = 1;
    let usdAmount = originalAmount;
    if (cur !== 'USD') {
      try {
        exchangeRate = await getRate(cur, 'USD');
      } catch {
        throw new ServiceUnavailableError(
          'Exchange rates are not available yet. Please try again shortly ' +
            '(an administrator may need to run the rate sync).'
        );
      }
      usdAmount = originalAmount * exchangeRate;
    }
    const amountCents = Math.round(usdAmount * 100);

    // Split the USD amount so balances stay in USD. For EXACT in a non-USD
    // currency the per-member amounts were entered in `cur`, so convert them
    // too before computing shares.
    const membersForSplit =
      splitType === 'EXACT' && cur !== 'USD'
        ? members.map((m) => ({ ...m, amount: Number(m.amount) * exchangeRate }))
        : members;
    const shares = calculateSplits(usdAmount, splitType, membersForSplit);
    const metaByUser = new Map(members.map((m) => [m.userId, m]));

    // Single transaction: expense + every split, all-or-nothing.
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          groupId,
          description: desc,
          amountCents,
          currency: cur,
          originalAmount,
          exchangeRate,
          splitType,
          paidById,
          createdById: req.user.id,
        },
      });

      await tx.split.createMany({
        data: shares.map((s) => {
          const meta = metaByUser.get(s.userId);
          return {
            expenseId: created.id,
            userId: s.userId,
            amountCents: Math.round(s.amount * 100),
            percentage:
              splitType === 'PERCENTAGE' ? Number(meta?.percentage) : null,
            weight: splitType === 'WEIGHT' ? Number(meta?.weight) : null,
          };
        }),
      });

      return tx.expense.findUnique({
        where: { id: created.id },
        include: { paidBy: true, splits: { include: { user: true } } },
      });
    });

    // A new expense changes every group stat — drop the cached entries.
    // (The future settlement endpoint must call invalidateGroupStats too.)
    invalidateGroupStats(groupId);

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
