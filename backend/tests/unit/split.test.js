import { describe, it, expect } from 'vitest';
import { computeEqualSplits, buildExactSplits } from '../../src/utils/split.js';

describe('computeEqualSplits', () => {
  it('splits evenly when divisible', () => {
    const splits = computeEqualSplits(1000, ['a', 'b']);
    expect(splits).toEqual([
      { userId: 'a', amountCents: 500 },
      { userId: 'b', amountCents: 500 },
    ]);
  });

  it('distributes remainder cents to the first participants', () => {
    const splits = computeEqualSplits(1000, ['a', 'b', 'c']);
    expect(splits.map((s) => s.amountCents)).toEqual([334, 333, 333]);
  });

  it('always sums exactly to the total', () => {
    const splits = computeEqualSplits(10001, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const sum = splits.reduce((acc, s) => acc + s.amountCents, 0);
    expect(sum).toBe(10001);
  });

  it('throws when there are no participants', () => {
    expect(() => computeEqualSplits(100, [])).toThrow();
  });
});

describe('buildExactSplits', () => {
  it('accepts amounts that sum to the total', () => {
    const splits = buildExactSplits(1000, [
      { userId: 'a', amountCents: 700 },
      { userId: 'b', amountCents: 300 },
    ]);
    expect(splits).toHaveLength(2);
  });

  it('rejects amounts that do not sum to the total', () => {
    expect(() =>
      buildExactSplits(1000, [
        { userId: 'a', amountCents: 700 },
        { userId: 'b', amountCents: 200 },
      ])
    ).toThrow();
  });
});
