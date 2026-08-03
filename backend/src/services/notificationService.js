import webpush from 'web-push';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { computeBalances, simplifyDebts, withoutSettledSplits } from '../utils/balance.js';

// ─────────────────────────────────────────────────────────────────────────────
// notificationService — the ONLY file that talks to the Web Push (VAPID)
// transport. Like pusherService, it is OPTIONAL: if the VAPID_* env vars are not
// all set the transport is never configured and sendPushNotification becomes a
// safe no-op, so local dev / tests / deploys without push keys keep working.
// ─────────────────────────────────────────────────────────────────────────────

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;

const isConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isConfigured) {
  // web-push wants a "mailto:" (or https) subject; accept a bare email too.
  const subject = (VAPID_EMAIL || 'admin@heetwise.app').startsWith('mailto:')
    ? VAPID_EMAIL
    : `mailto:${VAPID_EMAIL || 'admin@heetwise.app'}`;
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export const pushConfigured = isConfigured;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const centsToUsd = (cents) => (cents / 100).toFixed(2);
const pairKey = (a, b) => [a, b].sort().join(':');

// Send a Web Push notification to every device a user has subscribed. Never
// throws — a failed push must never break the request that triggered it. A push
// that fails with 404/410 (subscription gone) is pruned so it isn't retried.
//
// notification: { title, body, icon?, url? }
export async function sendPushNotification(userId, notification) {
  if (!isConfigured || !userId) return 0;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  if (subscriptions.length === 0) return 0;

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon || '/icon.png',
    url: notification.url || `${env.frontendUrl}/summary`,
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent += 1;
      } catch (err) {
        // 404/410 mean the browser dropped the subscription — clean it up.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          console.error(`[push] failed to notify ${userId}: ${err.message}`);
        }
      }
    })
  );
  return sent;
}

// Query every unsettled debt (older than 7 days) across all groups, group them
// by the debtor, and push each debtor a "you owe NAME $AMOUNT" reminder linking
// straight to their summary page. Returns the number of notifications sent.
// Safe to run from a cron job — it never throws for an individual failure.
export async function scheduleDebtReminders() {
  const now = Date.now();
  const cutoff = new Date(now - SEVEN_DAYS_MS);

  const groups = await prisma.group.findMany({
    include: { members: { include: { user: true } } },
  });

  // debtorId -> [{ creditorName, amountCents, groupName }]
  const remindersByDebtor = new Map();

  for (const group of groups) {
    const rawExpenses = await prisma.expense.findMany({
      where: { groupId: group.id },
      select: {
        paidById: true,
        amountCents: true,
        createdAt: true,
        splits: { select: { userId: true, amountCents: true, isSettled: true } },
      },
    });
    if (rawExpenses.length === 0) continue;

    // Only debts whose oldest contributing expense is older than 7 days qualify.
    const oldest = rawExpenses.reduce(
      (min, e) => (e.createdAt < min ? e.createdAt : min),
      rawExpenses[0].createdAt
    );
    if (oldest >= cutoff) continue;

    const expenses = withoutSettledSplits(rawExpenses);
    const balances = computeBalances(expenses);
    const plan = simplifyDebts(balances);
    if (plan.length === 0) continue;

    // A settlement between the pair in the last 7 days silences the reminder.
    const recentSettlements = await prisma.settlement.findMany({
      where: { groupId: group.id, settledAt: { gte: cutoff } },
      select: { fromUserId: true, toUserId: true },
    });
    const settledPairs = new Set(
      recentSettlements.map((s) => pairKey(s.fromUserId, s.toUserId))
    );

    const userById = new Map(group.members.map((m) => [m.userId, m.user]));

    for (const leg of plan) {
      if (settledPairs.has(pairKey(leg.from, leg.to))) continue;
      const creditor = userById.get(leg.to);
      const list = remindersByDebtor.get(leg.from) || [];
      list.push({
        creditorName: creditor ? creditor.name || creditor.email : 'someone',
        amountCents: leg.amountCents,
        groupName: group.name,
      });
      remindersByDebtor.set(leg.from, list);
    }
  }

  let sent = 0;
  for (const [debtorId, debts] of remindersByDebtor) {
    for (const debt of debts) {
      sent += await sendPushNotification(debtorId, {
        title: 'Unsettled expense',
        body: `You owe ${debt.creditorName} $${centsToUsd(
          debt.amountCents
        )} — tap to settle up`,
        url: `${env.frontendUrl}/summary`,
      });
    }
  }
  return sent;
}
