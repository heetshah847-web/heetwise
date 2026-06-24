// Pure balance + settlement math. No DB, fully unit-testable.
// Input expenses shape: [{ paidById, amountCents, splits: [{ userId, amountCents }] }]
//
// IMPORTANT — DO NOT MODIFY WHEN ADDING SPLIT TYPES.
// This service reads each member's FINAL share directly from expense_splits
// (split.amountCents). How that share was derived — EQUAL, EXACT, PERCENTAGE,
// WEIGHT, or any future split type — is irrelevant here, because splitService
// has already resolved every split to a concrete amount before it was stored.
// Adding a new split type therefore requires NO changes to this file.

// Net balance per user in cents.
//   positive = the group owes this user (they are owed money)
//   negative = this user owes the group
// The sum of all balances is always zero.
export function computeBalances(expenses) {
  const net = new Map();
  const add = (userId, delta) => net.set(userId, (net.get(userId) || 0) + delta);

  for (const expense of expenses) {
    // The payer fronted the whole amount.
    add(expense.paidById, expense.amountCents);
    // Each participant owes their share.
    for (const split of expense.splits) {
      add(split.userId, -split.amountCents);
    }
  }

  return [...net.entries()].map(([userId, netCents]) => ({ userId, netCents }));
}

// Greedy debt simplification: minimize the number of transactions needed to
// settle up. Returns [{ from, to, amountCents }]. This is the "smart" in
// smart split — instead of everyone paying everyone, debts net out.
export function simplifyDebts(balances) {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ userId: b.userId, amount: -b.netCents }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ userId: b.userId, amount: b.netCents }))
    .sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    if (pay > 0) {
      transactions.push({
        from: debtors[i].userId,
        to: creditors[j].userId,
        amountCents: pay,
      });
    }
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i += 1;
    if (creditors[j].amount === 0) j += 1;
  }
  return transactions;
}
