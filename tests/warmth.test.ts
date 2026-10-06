import { describe, it, expect, vi } from 'vitest';
import { roomWarmth } from '../src/pixel/season';
import { feel, restingPose } from '../src/pixel/behave';
import { NEUTRAL } from '../src/cat3d/mood';

const at = (iso: string) => new Date(iso);

describe('the room\'s warmth', () => {
  it('cold in midwinter, hot on a summer afternoon, mild in spring and autumn', () => {
    const jan = roomWarmth(at('2027-01-22T05:00:00'));
    const jul = roomWarmth(at('2026-07-28T15:00:00'));
    const may = roomWarmth(at('2026-05-10T12:00:00'));
    const oct = roomWarmth(at('2026-10-06T12:00:00'));
    expect(feel(jan).cold).toBeGreaterThan(0.4);
    expect(feel(jan).hot).toBe(0);
    expect(feel(jul).hot).toBeGreaterThan(0.8);
    expect(feel(jul).cold).toBe(0);
    for (const w of [may, oct]) {
      expect(feel(w).cold).toBe(0);
      expect(feel(w).hot).toBeLessThan(0.3);
    }
  });

  it('the afternoon warmer than the small hours; the heating on takes the edge off winter', () => {
    expect(roomWarmth(at('2026-07-28T15:00:00'))).toBeGreaterThan(roomWarmth(at('2026-07-28T04:00:00')));
    // (the day the heating comes on is warmer indoors than the day before)
    expect(roomWarmth(at('2026-10-25T12:00:00'))).toBeGreaterThan(roomWarmth(at('2026-10-24T12:00:00')));
  });

  it('resting on a hot day it lies flat out more, on a cold one in a loaf more', () => {
    const mood = { ...NEUTRAL, trust: 0.6, pleasure: 0.5 };
    const count = (warmth: number) => {
      let r = 3;
      const rnd = vi.spyOn(Math, 'random').mockImplementation(() => ((r = (r * 16807) % 2147483647) / 2147483647));
      const n: Record<string, number> = {};
      for (let i = 0; i < 2000; i++) { const p = restingPose(mood, 'rest', warmth); n[p] = (n[p] ?? 0) + 1; }
      rnd.mockRestore();
      return n;
    };
    const hot = count(0.95), mild = count(0.5), cold = count(0.1);
    expect(hot.side).toBeGreaterThan(1.5 * mild.side);
    expect(cold.loaf).toBeGreaterThan(1.5 * mild.loaf);
    expect(cold.side ?? 0).toBeLessThan(mild.side);
  });
});
