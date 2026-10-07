import { describe, it, expect } from 'vitest';
import { ofTheDay } from '../src/sim/state';

const base = { bold: 0.2, playful: -0.3, lazy: 0.5, curious: 0 };
const born = Date.UTC(2026, 0, 3, 10, 20, 30);

describe('a cat has its days', () => {
  it('all one day the same, whatever the hour', () => {
    expect(ofTheDay(base, born, new Date(2026, 9, 7, 8, 0))).toEqual(ofTheDay(base, born, new Date(2026, 9, 7, 23, 59)));
  });
  it('other days, otherwise; round its own nature, never far from it', () => {
    const days = Array.from({ length: 30 }, (_, i) => ofTheDay(base, born, new Date(2026, 9, 1 + i, 12)));
    const playful = days.map((d) => d.playful);
    expect(new Set(playful.map((x) => x.toFixed(3))).size).toBeGreaterThan(20);
    for (const d of days) {
      expect(Math.abs(d.bold - base.bold)).toBeLessThanOrEqual(0.12);
      expect(Math.abs(d.playful - base.playful)).toBeLessThanOrEqual(0.35);
      expect(Math.abs(d.lazy - base.lazy)).toBeLessThanOrEqual(0.35);
      expect(Math.abs(d.curious - base.curious)).toBeLessThanOrEqual(0.25);
    }
    // (some days livelier, some lazier: both ways)
    expect(Math.max(...playful)).toBeGreaterThan(base.playful + 0.1);
    expect(Math.min(...playful)).toBeLessThan(base.playful - 0.1);
  });
  it('another cat, other days', () => {
    const a = ofTheDay(base, born, new Date(2026, 9, 7)), b = ofTheDay(base, born + 86_400_000 * 3 + 12345, new Date(2026, 9, 7));
    expect(a).not.toEqual(b);
  });
  it('never out of its range', () => {
    for (let i = 0; i < 60; i++) {
      const d = ofTheDay({ bold: 1, playful: -1, lazy: 0.95, curious: -0.9 }, born, new Date(2026, 0, 1 + i));
      for (const v of Object.values(d)) expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});
