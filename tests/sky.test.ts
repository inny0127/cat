import { describe, expect, it } from 'vitest';
import { cloudAt, moonLit, moonPhase } from '../src/cat3d/roomlight';

describe('the sky outside', () => {
  it('has the moon as it really is', () => {
    // a new moon on 11 January 2024 at 11:57 UTC, a full moon on 25 January 2024 at 17:54 UTC
    const nw = moonPhase(new Date(Date.UTC(2024, 0, 11, 11, 57)));
    expect(Math.min(nw, 1 - nw)).toBeLessThan(0.02);
    expect(Math.abs(moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54))) - 0.5)).toBeLessThan(0.02);
    expect(moonLit(new Date(Date.UTC(2024, 0, 25, 17, 54)))).toBeGreaterThan(0.98);
    expect(moonLit(new Date(Date.UTC(2024, 0, 11, 11, 57)))).toBeLessThan(0.02);
  });

  it('clouds over slowly, never quite clear or overcast unless it rains', () => {
    let last = cloudAt(new Date(Date.UTC(2026, 9, 3, 0, 0)));
    for (let m = 1; m < 60 * 24 * 7; m += 1) {
      const c = cloudAt(new Date(Date.UTC(2026, 9, 3, 0, m)));
      expect(c).toBeGreaterThanOrEqual(0.2);
      expect(c).toBeLessThanOrEqual(0.8);
      expect(Math.abs(c - last)).toBeLessThan(0.01);
      last = c;
    }
    expect(cloudAt(new Date(Date.UTC(2026, 9, 3, 12)), 1)).toBe(1);
  });
});
