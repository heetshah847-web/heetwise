import { ValidationError } from './errors.js';

// Pure split math. Kept side-effect free so it can be unit tested without a DB.
// All amounts are integer cents.

// Split a total equally among participants. The remainder cents (when the
// total doesn't divide evenly) are distributed one-per-person to the first
// few participants, so the splits always sum exactly to the total.
export function computeEqualSplits(amountCents, userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationError('At least one participant is required');
  }
  const n = userIds.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;
  return userIds.map((userId, i) => ({
    userId,
    amountCents: base + (i < remainder ? 1 : 0),
  }));
}

// Validate caller-provided exact splits and confirm they sum to the total.
export function buildExactSplits(amountCents, participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new ValidationError('At least one participant is required');
  }
  const sum = participants.reduce((acc, p) => acc + p.amountCents, 0);
  if (sum !== amountCents) {
    throw new ValidationError(
      `Split amounts (${sum}) must add up to the total (${amountCents})`
    );
  }
  return participants.map((p) => ({
    userId: p.userId,
    amountCents: p.amountCents,
  }));
}
