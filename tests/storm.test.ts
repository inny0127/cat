import { describe, expect, it } from 'vitest';
import { thunder } from '../src/audio/synth';
import { stormAt } from '../src/cat3d/roomlight';

describe('a thunderstorm', () => {
  it('rolls: a few seconds of sound, never clipping', () => {
    for (const near of [false, true]) {
      const d = thunder(22050, near);
      expect(d.length / 22050).toBeGreaterThan(4);
      expect(d.length / 22050).toBeLessThan(8);
      let peak = 0;
      for (const v of d) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
      expect(peak).toBeLessThanOrEqual(0.9001);
      expect(peak).toBeGreaterThan(0.5);
    }
  });

  it('comes only with rain, and mostly in summer', () => {
    let summer = 0, winter = 0;
    for (let day = 0; day < 60; day++) for (let h = 0; h < 24; h += 3) {
      expect(stormAt(new Date(2026, 6, 1 + day, h), 0)).toBe(0);
      if (stormAt(new Date(2026, 6, 1 + day, h), 1) > 0) summer++;
      if (stormAt(new Date(2026, 0, 1 + day, h), 1) > 0) winter++;
    }
    expect(summer).toBeGreaterThan(winter * 3);
    expect(summer).toBeGreaterThan(0);
  });
});
