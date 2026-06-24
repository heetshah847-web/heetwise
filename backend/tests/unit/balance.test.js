import { describe, it, expect } from 'vitest';
import { computeBalances, simplifyDebts } from '../../src/utils/balance.js';

describe('computeBalances', () => {
  it('credits the payer and debits each participant', () => {
    const expenses = [
      {
        paidById: 'a',
        amountCents: 1000,
        splits: [
          { userId: 'a', amountCents: 500 },
          { userId: 'b', amountCents: 500 },
        ],
      },
    ];
    const balances = computeBalances(expenses);
    const byUser = Object.fromEntries(balances.map((b) => [b.userId, b.netCents]));
    expect(byUser.a).toBe(500); // paid 1000, owes 500 -> +500
    expect(byUser.b).toBe(-500); // owes 500 -> -500
  });

  it('always nets to zero across users', () => {
    const expenses = [
      {
        paidById: 'a',
        amountCents: 900,
        splits: [
          { userId: 'a', amountCents: 300 },
          { userId: 'b', amountCents: 300 },
          { userId: 'c', amountCents: 300 },
        ],
      },
      {
        paidById: 'b',
        amountCents: 600,
        splits: [
          { userId: 'b', amountCents: 300 },
          { userId: 'c', amountCents: 300 },
        ],
      },
    ];
    const total = computeBalances(expenses).reduce((s, b) => s + b.netCents, 0);
    expect(total).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('produces transactions that settle every balance', () => {
    const balances = [
      { userId: 'a', netCents: 500 },
      { userId: 'b', netCents: -200 },
      { userId: 'c', netCents: -300 },
    ];
    const txns = simplifyDebts(balances);
    // Everyone who owes pays exactly what they owe.
    const paid = {};
    for (const t of txns) {
      paid[t.from] = (paid[t.from] || 0) + t.amountCents;
    }
    expect(paid.b).toBe(200);
    expect(paid.c).toBe(300);
    // Creditor receives the full amount owed.
    const received = txns
      .filter((t) => t.to === 'a')
      .reduce((s, t) => s + t.amountCents, 0);
    expect(received).toBe(500);
  });

  it('returns no transactions when everyone is settled', () => {
    expect(simplifyDebts([{ userId: 'a', netCents: 0 }])).toEqual([]);
  });
});
