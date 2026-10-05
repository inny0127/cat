import { describe, it, expect } from 'vitest';
import { SlowWatch } from '../src/pixel/pace';

const run = (w: SlowWatch, gapMs: number, secs: number) => {
  let tripped = false;
  for (let t = 0; t < secs * 1000; t += gapMs) tripped = w.frame(gapMs) || tripped;
  return tripped;
};

describe('whether the phone keeps up', () => {
  it('60 or 120 frames a second, or held to 30 to save the battery: keeping up', () => {
    for (const gap of [8.3, 16.7, 33.3, 35]) {
      const w = new SlowWatch();
      expect(run(w, gap, 60)).toBe(false);
      expect(w.tripped).toBe(false);
    }
  });
  it('well under 25 frames a second for a few seconds: not, said once', () => {
    const w = new SlowWatch();
    expect(run(w, 55, 3)).toBe(false);
    expect(run(w, 55, 6)).toBe(true);
    expect(w.frame(55)).toBe(false);
    expect(w.tripped).toBe(true);
  });
  it('a stutter now and then among good frames is not slow; nor is a page back from the background', () => {
    const w = new SlowWatch();
    for (let k = 0; k < 600; k++) w.frame(k % 10 === 0 ? 120 : 16.7);
    expect(w.tripped).toBe(false);
    for (let k = 0; k < 20; k++) w.frame(5000);
    expect(w.tripped).toBe(false);
  });
  it('the page\'s busy first moments are not held against it', () => {
    const w = new SlowWatch();
    expect(run(w, 80, 2.5)).toBe(false);
    expect(run(w, 16.7, 30)).toBe(false);
  });
});
