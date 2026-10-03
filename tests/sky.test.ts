import { describe, expect, it } from 'vitest';
import { cloudAt, dayLight, fogAt, moonLit, moonPhase } from '../src/cat3d/roomlight';

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

  it('has a mist on some mornings, gone by late morning and never in the rain', () => {
    let misty = 0;
    for (let day = 0; day < 365; day++) {
      const at = (h: number) => new Date(2026, 0, 1 + day, Math.floor(h), Math.round((h % 1) * 60));
      const dawn = fogAt(at(6.5));
      expect(dawn).toBeGreaterThanOrEqual(0);
      expect(dawn).toBeLessThanOrEqual(1);
      if (dawn > 0) misty++;
      expect(fogAt(at(11))).toBe(0);
      expect(fogAt(at(15))).toBe(0);
      expect(fogAt(at(6.5), 1)).toBe(0);
    }
    // (some mornings, not most)
    expect(misty).toBeGreaterThan(25);
    expect(misty).toBeLessThan(120);
  });

  it('has the lamp lit from sunset, and out in the small hours (the fairy lights left on)', () => {
    expect(dayLight(14).lamp).toBe(0);
    expect(dayLight(20).lamp).toBeGreaterThan(1.5);
    expect(dayLight(23.5).lamp).toBeGreaterThan(1.5);
    for (const h of [1.5, 3, 5]) {
      expect(dayLight(h).lamp).toBeLessThan(0.01);
      expect(dayLight(h).fairy).toBeGreaterThan(0.3);
    }
    // (up again before the sun, for an hour or so)
    expect(dayLight(6.2).lamp).toBeGreaterThan(1.5);
  });
});
