import { prisma } from '../lib/prisma.js';
import { sendSuccess } from '../utils/response.js';
import { requireString } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import {
  computeBalances,
  simplifyDebts,
  withoutSettledSplits,
} from '../utils/balance.js';
import { scheduleDebtReminders } from '../services/notificationService.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Stable, order-independent key for a pair of users.
const pairKey = (a, b) => [a, b].sort().join(':');

// GET /notifications — for the current user, surface every debt (in a group
// they belong to) that is still outstanding AND whose oldest contributing
// expense is more than 7 days old, unless a settlement between the two parties
// has been recorded within the last 7 days.
//
// A "debt" here is one leg of the simplified settlement plan for a group that
// involves the current user (either as payer or payee).
export async function getNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const now = Date.now();
    const cutoff = new Date(now - SEVEN_DAYS_MS);

    const groups = await prisma.group.findMany({
      where: { members: { some: { userId } } },
      include: { members: { include: { user: true } } },
    });

    const notifications = [];

    for (const group of groups) {
      const rawExpenses = await prisma.expense.findMany({
        where: { groupId: group.id },
        select: {
          amountCents: true,
          paidById: true,
          createdAt: true,
          splits: { select: { userId: true, amountCents: true, isSettled: true } },
        },
      });
      if (rawExpenses.length === 0) continue;

      // Only debts whose oldest expense is older than 7 days qualify.
      const oldest = rawExpenses.reduce(
        (min, e) => (e.createdAt < min ? e.createdAt : min),
        rawExpenses[0].createdAt
      );
      if (oldest >= cutoff) continue;

      // Exclude already-settled splits so paid-off debts stop notifying.
      const expenses = withoutSettledSplits(rawExpenses);
      const balances = computeBalances(expenses);
      const plan = simplifyDebts(balances);
      const myDebts = plan.filter((t) => t.from === userId || t.to === userId);
      if (myDebts.length === 0) continue;

      // Recently-recorded settlements for this group involving the user.
      const recentSettlements = await prisma.settlement.findMany({
        where: {
          groupId: group.id,
          settledAt: { gte: cutoff },
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        select: { fromUserId: true, toUserId: true },
      });
      const settledPairs = new Set(
        recentSettlements.map((s) => pairKey(s.fromUserId, s.toUserId))
      );

      const userById = new Map(
        group.members.map((m) => [m.userId, m.user])
      );

      for (const t of myDebts) {
        const otherId = t.from === userId ? t.to : t.from;
        if (settledPairs.has(pairKey(userId, otherId))) continue; // just settled
        const other = userById.get(otherId);
        notifications.push({
          type: 'UNSETTLED_DEBT',
          direction: t.from === userId ? 'you_owe' : 'owes_you',
          groupId: group.id,
          groupName: group.name,
          otherPersonId: otherId,
          otherPersonName: other ? other.name || other.email : 'Someone',
          amountCents: t.amountCents,
          currency: 'USD',
        });
      }
    }

    // Biggest debts first.
    notifications.sort((a, b) => b.amountCents - a.amountCents);

    return sendSuccess(res, 200, {
      notifications,
      count: notifications.length,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /notifications/subscribe — save (or refresh) the current user's browser
// Web Push subscription. Body is the PushSubscription JSON the browser produced:
//   { endpoint, keys: { p256dh, auth } }
// Keyed by the globally-unique endpoint so re-subscribing the same browser (or a
// subscription that moved to another account) upserts cleanly.
export async function subscribePush(req, res, next) {
  try {
    const endpoint = requireString(req.body?.endpoint, 'endpoint', {
      max: 2000,
    });
    const keys = req.body?.keys ?? {};
    const p256dh = requireString(keys.p256dh, 'keys.p256dh', { max: 500 });
    const auth = requireString(keys.auth, 'keys.auth', { max: 500 });

    if (!/^https?:\/\//.test(endpoint)) {
      throw new ValidationError('endpoint must be a valid push service URL');
    }

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.user.id, p256dh, auth },
      create: { userId: req.user.id, endpoint, p256dh, auth },
    });

    return sendSuccess(res, 201, { subscribed: true, id: subscription.id });
  } catch (err) {
    return next(err);
  }
}

// GET /notifications/send-reminders — trigger the daily unsettled-debt reminder
// sweep. Called by the Vercel cron (see vercel.json). Returns how many push
// notifications were sent. Intentionally unauthenticated so the platform cron
// can reach it; it only sends reminders and exposes no user data.
export async function sendReminders(req, res, next) {
  try {
    const sent = await scheduleDebtReminders();
    return sendSuccess(res, 200, { sent });
  } catch (err) {
    return next(err);
  }
}
