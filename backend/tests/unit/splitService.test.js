import { describe, it, expect } from 'vitest';
import { calculateSplits } from '../../src/services/splitService.js';

const sum = (splits) => splits.reduce((s, x) => s + x.amount, 0);

describe('calculateSplits', () => {
  describe('EQUAL', () => {
    it('divides evenly when divisible', () => {
      const out = calculateSplits(10, 'EQUAL', [{ userId: 'a' }, { userId: 'b' }]);
      expect(out).toEqual([
        { userId: 'a', amount: 5 },
        { userId: 'b', amount: 5 },
      ]);
    });

    it('gives the leftover remainder cent to the first member', () => {
      const out = calculateSplits(10, 'EQUAL', [
        { userId: 'a' },
        { userId: 'b' },
        { userId: 'c' },
      ]);
      expect(out.map((s) => s.amount)).toEqual([3.34, 3.33, 3.33]);
      expect(sum(out)).toBeCloseTo(10, 10);
    });
  });

  describe('EXACT', () => {
    it('accepts amounts within tolerance and sums exactly to total', () => {
      const out = calculateSplits(10, 'EXACT', [
        { userId: 'a', amount: 7 },
        { userId: 'b', amount: 3 },
      ]);
      expect(sum(out)).toBe(10);
    });

    it('throws when amounts do not sum to the total', () => {
      expect(() =>
        calculateSplits(10, 'EXACT', [
          { userId: 'a', amount: 7 },
          { userId: 'b', amount: 2 },
        ])
      ).toThrow();
    });
  });

  describe('PERCENTAGE', () => {
    it('splits by percentage and assigns remainder to the highest percentage', () => {
      const out = calculateSplits(100, 'PERCENTAGE', [
        { userId: 'a', percentage: 33.33 },
        { userId: 'b', percentage: 33.33 },
        { userId: 'c', percentage: 33.34 },
      ]);
      expect(sum(out)).toBeCloseTo(100, 10);
      // Highest percentage (c) absorbs the rounding remainder.
      const c = out.find((s) => s.userId === 'c');
      expect(c.amount).toBeGreaterThanOrEqual(33.34);
    });

    it('throws when percentages do not sum to 100', () => {
      expect(() =>
        calculateSplits(100, 'PERCENTAGE', [
          { userId: 'a', percentage: 90 },
          { userId: 'b', percentage: 5 },
        ])
      ).toThrow();
    });
  });

  describe('WEIGHT', () => {
    it('splits proportionally to weights and sums exactly to total', () => {
      const out = calculateSplits(90, 'WEIGHT', [
        { userId: 'a', weight: 2 },
        { userId: 'b', weight: 1 },
      ]);
      expect(sum(out)).toBe(90);
      expect(out.find((s) => s.userId === 'a').amount).toBe(60);
      expect(out.find((s) => s.userId === 'b').amount).toBe(30);
    });

    it('throws on a zero or negative weight', () => {
      expect(() =>
        calculateSplits(90, 'WEIGHT', [
          { userId: 'a', weight: 0 },
          { userId: 'b', weight: 1 },
        ])
      ).toThrow();
    });

    it('never produces a sum that drifts from the total', () => {
      const out = calculateSplits(100, 'WEIGHT', [
        { userId: 'a', weight: 1 },
        { userId: 'b', weight: 1 },
        { userId: 'c', weight: 1 },
      ]);
      expect(sum(out)).toBeCloseTo(100, 10);
    });
  });

  it('throws on an invalid split type', () => {
    expect(() => calculateSplits(10, 'NONSENSE', [{ userId: 'a' }])).toThrow();
  });
});
