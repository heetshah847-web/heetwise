import { ValidationError } from '../utils/errors.js';

// Smart-split calculator. Returns the final per-member share for an expense.
//
// Although the public interface speaks dollars (totalAmount as a number, each
// returned `amount` rounded to 2 decimals), ALL math is done in integer cents
// internally. That is the only reliable way to guarantee the returned amounts
// sum *exactly* to totalAmount — floating-point dollars cannot promise that.
//
// Returns: [{ userId, amount }] where amount is a 2-decimal number and
// sum(amount) === totalAmount exactly.

const VALID_SPLIT_TYPES = ['EQUAL', 'EXACT', 'PERCENTAGE', 'WEIGHT'];

// Index of the member with the largest value of `selector(member)`.
function indexOfMax(members, selector) {
  let idx = 0;
  for (let i = 1; i < members.length; i += 1) {
    if (Number(selector(members[i])) > Number(selector(members[idx]))) idx = i;
  }
  return idx;
}

export function calculateSplits(totalAmount, splitType, members) {
  if (!VALID_SPLIT_TYPES.includes(splitType)) {
    throw new ValidationError(
      `splitType must be one of: ${VALID_SPLIT_TYPES.join(', ')}`
    );
  }
  if (!Array.isArray(members) || members.length === 0) {
    throw new ValidationError('At least one member is required');
  }

  const totalCents = Math.round(Number(totalAmount) * 100);
  const sumCents = (arr) => arr.reduce((s, c) => s + c, 0);

  let cents; // integer cents, aligned with `members`

  if (splitType === 'EQUAL') {
    const n = members.length;
    const base = Math.floor(totalCents / n);
    const remainder = totalCents - base * n;
    // Leftover remainder cent(s) go to the first member.
    cents = members.map((_, i) => (i === 0 ? base + remainder : base));
  } else if (splitType === 'EXACT') {
    const sum = members.reduce((s, m) => s + Number(m.amount || 0), 0);
    if (Math.abs(sum - Number(totalAmount)) > 0.01) {
      throw new ValidationError(
        `Exact amounts must sum to ${Number(totalAmount).toFixed(2)} ` +
          `but got ${sum.toFixed(2)}`
      );
    }
    cents = members.map((m) => Math.round(Number(m.amount) * 100));
    // Snap any sub-cent rounding drift onto the largest share.
    const diff = totalCents - sumCents(cents);
    if (diff !== 0) cents[indexOfMax(members, (m) => m.amount)] += diff;
  } else if (splitType === 'PERCENTAGE') {
    const sum = members.reduce((s, m) => s + Number(m.percentage || 0), 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new ValidationError(
        `Percentages must sum to exactly 100 but got ${sum}`
      );
    }
    cents = members.map((m) =>
      Math.round((Number(m.percentage) / 100) * totalCents)
    );
    // Rounding remainder goes to the member with the highest percentage.
    const diff = totalCents - sumCents(cents);
    if (diff !== 0) cents[indexOfMax(members, (m) => m.percentage)] += diff;
  } else {
    // WEIGHT
    for (const m of members) {
      if (!(Number(m.weight) > 0)) {
        throw new ValidationError(
          'Every weight must be greater than zero'
        );
      }
    }
    const totalWeight = members.reduce((s, m) => s + Number(m.weight), 0);
    cents = members.map((m) =>
      Math.round((Number(m.weight) / totalWeight) * totalCents)
    );
    // Rounding remainder goes to the member with the highest weight.
    const diff = totalCents - sumCents(cents);
    if (diff !== 0) cents[indexOfMax(members, (m) => m.weight)] += diff;
  }

  return members.map((m, i) => ({ userId: m.userId, amount: cents[i] / 100 }));
}
