import { prisma } from '../lib/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────
// statsService — the ONLY file that runs aggregation queries.
//
// Hard rule: never pull raw expense/split rows into JS and sum them here. All
// summing/grouping/counting happens in the database via Prisma aggregate /
// groupBy / count, or via parameterized $queryRaw for date-bucketed and
// cross-table aggregations that groupBy cannot express (Prisma groupBy can't
// truncate a timestamp to a month). $queryRaw still does the math in Postgres
// and stays parameterized (no string concatenation of inputs).
// ─────────────────────────────────────────────────────────────────────────────

const centsToUsd = (cents) => Number(cents || 0) / 100;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;

// Chronological list of the last `n` months as { year, month } (month 1-12).
function lastNMonths(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

const monthKey = (year, month) => `${year}-${month}`;

// ── GET /stats/groups/:groupId ──────────────────────────────────────────────
export async function groupStats(groupId) {
  const [totals, expenseCount, largest, payerCounts, payerSums, currencySums] =
    await Promise.all([
      prisma.expense.aggregate({
        where: { groupId },
        _sum: { amountCents: true },
      }),
      prisma.expense.count({ where: { groupId } }),
      prisma.expense.findFirst({
        where: { groupId },
        orderBy: { amountCents: 'desc' },
        include: { paidBy: true },
      }),
      prisma.expense.groupBy({
        by: ['paidById'],
        where: { groupId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      prisma.expense.groupBy({
        by: ['paidById'],
        where: { groupId },
        _sum: { amountCents: true },
      }),
      prisma.expense.groupBy({
        by: ['currency'],
        where: { groupId },
        _sum: { originalAmount: true },
      }),
    ]);

  const totalCents = totals._sum.amountCents || 0;
  const total_spent = round2(centsToUsd(totalCents));
  const expense_count = expenseCount;
  const average_expense =
    expense_count > 0 ? round2(centsToUsd(totalCents) / expense_count) : 0;

  // Resolve names for everyone who appears as a payer (single lookup, no sums).
  const payerIds = [
    ...new Set([
      ...payerCounts.map((p) => p.paidById),
      ...payerSums.map((p) => p.paidById),
    ]),
  ];
  const users = payerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: payerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const largest_expense = largest
    ? {
        amount: round2(centsToUsd(largest.amountCents)),
        description: largest.description,
        paidBy: largest.paidBy
          ? { userId: largest.paidBy.id, name: largest.paidBy.name }
          : null,
      }
    : null;

  const most_active_payer = payerCounts[0]
    ? {
        userId: payerCounts[0].paidById,
        name: nameById.get(payerCounts[0].paidById) ?? null,
      }
    : null;

  const payer_breakdown = payerSums
    .map((p) => ({
      userId: p.paidById,
      name: nameById.get(p.paidById) ?? null,
      total_paid: round2(centsToUsd(p._sum.amountCents)),
    }))
    .sort((a, b) => b.total_paid - a.total_paid);

  const currency_breakdown = currencySums.map((c) => ({
    currency: c.currency,
    original_total: round2(Number(c._sum.originalAmount || 0)),
  }));

  // Monthly totals for the last 12 months — date bucketing via raw SQL.
  const rows = await prisma.$queryRaw`
    SELECT EXTRACT(YEAR FROM created_at)::int  AS year,
           EXTRACT(MONTH FROM created_at)::int AS month,
           COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
    FROM expenses
    WHERE group_id = ${groupId}::uuid
      AND created_at >= date_trunc('month', now()) - interval '11 months'
    GROUP BY year, month
    ORDER BY year, month
  `;
  const byMonth = new Map(
    rows.map((r) => [monthKey(Number(r.year), Number(r.month)), r])
  );
  const monthly_breakdown = lastNMonths(12).map(({ year, month }) => {
    const r = byMonth.get(monthKey(year, month));
    return { year, month, total: round2(centsToUsd(r ? Number(r.total_cents) : 0)) };
  });

  return {
    total_spent,
    expense_count,
    average_expense,
    largest_expense,
    most_active_payer,
    monthly_breakdown,
    payer_breakdown,
    currency_breakdown,
  };
}

// ── GET /stats/groups/:groupId/members/:memberId ────────────────────────────
export async function memberStats(groupId, memberId) {
  const [paidAgg, consumedAgg, groupAgg, topCategories] = await Promise.all([
    prisma.expense.aggregate({
      where: { groupId, paidById: memberId },
      _sum: { amountCents: true },
    }),
    prisma.split.aggregate({
      where: { userId: memberId, expense: { groupId } },
      _sum: { amountCents: true },
    }),
    prisma.expense.aggregate({
      where: { groupId },
      _sum: { amountCents: true },
    }),
    prisma.expense.groupBy({
      by: ['description'],
      where: { groupId, paidById: memberId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
  ]);

  const total_paid = round2(centsToUsd(paidAgg._sum.amountCents));
  const total_consumed = round2(centsToUsd(consumedAgg._sum.amountCents));
  const net_balance = round2(total_paid - total_consumed);
  const groupTotal = centsToUsd(groupAgg._sum.amountCents);
  const payment_share_percentage =
    groupTotal > 0 ? round1((total_paid / groupTotal) * 100) : 0;
  const consumption_share_percentage =
    groupTotal > 0 ? round1((total_consumed / groupTotal) * 100) : 0;

  const top_categories = topCategories.map((c) => ({
    description: c.description,
    count: c._count.id,
  }));

  // Net (paid - consumed) per month for the last 6 months.
  const [paidRows, consumedRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT EXTRACT(YEAR FROM created_at)::int AS year,
             EXTRACT(MONTH FROM created_at)::int AS month,
             COALESCE(SUM(amount_cents), 0)::bigint AS cents
      FROM expenses
      WHERE group_id = ${groupId}::uuid AND paid_by_id = ${memberId}::uuid
        AND created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY year, month
    `,
    prisma.$queryRaw`
      SELECT EXTRACT(YEAR FROM e.created_at)::int AS year,
             EXTRACT(MONTH FROM e.created_at)::int AS month,
             COALESCE(SUM(s.amount_cents), 0)::bigint AS cents
      FROM splits s JOIN expenses e ON e.id = s.expense_id
      WHERE e.group_id = ${groupId}::uuid AND s.user_id = ${memberId}::uuid
        AND e.created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY year, month
    `,
  ]);
  const paidByMonth = new Map(
    paidRows.map((r) => [monthKey(Number(r.year), Number(r.month)), Number(r.cents)])
  );
  const consumedByMonth = new Map(
    consumedRows.map((r) => [
      monthKey(Number(r.year), Number(r.month)),
      Number(r.cents),
    ])
  );
  const monthly_net_trend = lastNMonths(6).map(({ year, month }) => {
    const k = monthKey(year, month);
    const paid = paidByMonth.get(k) || 0;
    const consumed = consumedByMonth.get(k) || 0;
    return { year, month, net_balance: round2(centsToUsd(paid - consumed)) };
  });

  return {
    total_paid,
    total_consumed,
    net_balance,
    payment_share_percentage,
    consumption_share_percentage,
    monthly_net_trend,
    top_categories,
  };
}

// ── GET /stats/me ───────────────────────────────────────────────────────────
export async function meStats(userId) {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);

  const [paidThisMonth, consumedAll, paidAll, activeGroup] = await Promise.all([
    prisma.expense.aggregate({
      where: { paidById: userId, createdAt: { gte: startOfMonth } },
      _sum: { amountCents: true },
    }),
    prisma.split.aggregate({ where: { userId }, _sum: { amountCents: true } }),
    prisma.expense.aggregate({
      where: { paidById: userId },
      _sum: { amountCents: true },
    }),
    prisma.expense.groupBy({
      by: ['groupId'],
      where: { paidById: userId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    }),
  ]);

  const total_paid_this_month = round2(centsToUsd(paidThisMonth._sum.amountCents));
  // Positive = this user owes money overall (consumed more than they paid).
  const total_owed = round2(
    centsToUsd((consumedAll._sum.amountCents || 0) - (paidAll._sum.amountCents || 0))
  );

  let most_active_group = null;
  if (activeGroup[0]) {
    const g = await prisma.group.findUnique({
      where: { id: activeGroup[0].groupId },
      select: { id: true, name: true },
    });
    most_active_group = g
      ? { id: g.id, name: g.name, expense_count: activeGroup[0]._count.id }
      : null;
  }

  // Paid vs consumed per month across all groups, last 6 months.
  const [paidRows, consumedRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT EXTRACT(YEAR FROM created_at)::int AS year,
             EXTRACT(MONTH FROM created_at)::int AS month,
             COALESCE(SUM(amount_cents), 0)::bigint AS cents
      FROM expenses
      WHERE paid_by_id = ${userId}::uuid
        AND created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY year, month
    `,
    prisma.$queryRaw`
      SELECT EXTRACT(YEAR FROM e.created_at)::int AS year,
             EXTRACT(MONTH FROM e.created_at)::int AS month,
             COALESCE(SUM(s.amount_cents), 0)::bigint AS cents
      FROM splits s JOIN expenses e ON e.id = s.expense_id
      WHERE s.user_id = ${userId}::uuid
        AND e.created_at >= date_trunc('month', now()) - interval '5 months'
      GROUP BY year, month
    `,
  ]);
  const paidByMonth = new Map(
    paidRows.map((r) => [monthKey(Number(r.year), Number(r.month)), Number(r.cents)])
  );
  const consumedByMonth = new Map(
    consumedRows.map((r) => [
      monthKey(Number(r.year), Number(r.month)),
      Number(r.cents),
    ])
  );
  const six_month_trend = lastNMonths(6).map(({ year, month }) => {
    const k = monthKey(year, month);
    return {
      year,
      month,
      total_paid: round2(centsToUsd(paidByMonth.get(k) || 0)),
      total_consumed: round2(centsToUsd(consumedByMonth.get(k) || 0)),
    };
  });

  // Per-group totals + this user's net balance. All sums are DB-side aggregates.
  let group_breakdown = [];
  if (groupIds.length) {
    const [groupTotals, userPaid, groups, consumedPerGroup] = await Promise.all([
      prisma.expense.groupBy({
        by: ['groupId'],
        where: { groupId: { in: groupIds } },
        _sum: { amountCents: true },
      }),
      prisma.expense.groupBy({
        by: ['groupId'],
        where: { groupId: { in: groupIds }, paidById: userId },
        _sum: { amountCents: true },
      }),
      prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      }),
      Promise.all(
        groupIds.map((gid) =>
          prisma.split
            .aggregate({
              where: { userId, expense: { groupId: gid } },
              _sum: { amountCents: true },
            })
            .then((a) => [gid, a._sum.amountCents || 0])
        )
      ),
    ]);

    const totalByGroup = new Map(
      groupTotals.map((g) => [g.groupId, g._sum.amountCents || 0])
    );
    const paidByGroup = new Map(
      userPaid.map((g) => [g.groupId, g._sum.amountCents || 0])
    );
    const consumedByGroup = new Map(consumedPerGroup);

    group_breakdown = groups.map((g) => {
      const paid = paidByGroup.get(g.id) || 0;
      const consumed = consumedByGroup.get(g.id) || 0;
      return {
        groupId: g.id,
        name: g.name,
        total_spending: round2(centsToUsd(totalByGroup.get(g.id) || 0)),
        net_balance: round2(centsToUsd(paid - consumed)),
      };
    });
  }

  return {
    total_paid_this_month,
    total_owed,
    most_active_group,
    six_month_trend,
    group_breakdown,
  };
}
