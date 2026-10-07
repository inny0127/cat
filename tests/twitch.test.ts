import { describe, it, expect } from 'vitest';
import { twitch } from '../src/util/math';

describe('a twitch, not a pendulum', () => {
  it('about as quick as asked, but never quite in time, and in bursts', () => {
    const f = 9, dt = 1 / 120;
    const crossings: number[] = [];
    const peaks: number[] = [];
    let prev = twitch(0, f), top = 0;
    for (let t = dt; t < 30; t += dt) {
      const v = twitch(t, f);
      top = Math.max(top, Math.abs(v));
      if ((prev < 0) !== (v < 0)) { crossings.push(t); peaks.push(top); top = 0; }
      prev = v;
    }
    const gaps = crossings.slice(1).map((c, i) => c - crossings[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    // (half a swing about pi/f on the whole)
    expect(mean).toBeGreaterThan((0.7 * Math.PI) / f);
    expect(mean).toBeLessThan((1.4 * Math.PI) / f);
    // (but not every one the same: a pendulum's would vary not at all)
    expect(sd / mean).toBeGreaterThan(0.12);
    // (now hard, now hardly at all)
    expect(Math.min(...peaks)).toBeLessThan(0.4);
    expect(Math.max(...peaks)).toBeGreaterThan(0.9);
    // (and two at once, each its own)
    let same = 0;
    for (let t = 0; t < 10; t += 0.05) if (Math.sign(twitch(t, 9)) === Math.sign(twitch(t, 11))) same++;
    expect(same / 200).toBeLessThan(0.75);
  });
});
