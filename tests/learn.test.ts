import { describe, it, expect } from 'vitest';
import { newCat } from '../src/sim/state';
import { learn, learnt, lessons, worth } from '../src/sim/learn';

const DAY = 86_400_000;

describe('what it learns comes of what it does', () => {
  it('done before strokes or a game, done more; before a scolding, less; within bounds', () => {
    const now = Date.UTC(2026, 9, 6, 12);
    const s = newCat(now);
    expect(worth(s, 'window', now)).toBe(1);
    for (let i = 0; i < 6; i++) learn(s, 'window', 1, 1, now + i * 60_000);
    const keen = worth(s, 'window', now + 6 * 60_000);
    expect(keen).toBeGreaterThan(1.6);
    expect(keen).toBeLessThan(Math.E + 1e-9);
    // (a long while of it: never more than so much keener)
    for (let i = 0; i < 200; i++) learn(s, 'window', 1, 1, now);
    expect(learnt(s, 'window', now)).toBeLessThanOrEqual(1);
    for (let i = 0; i < 4; i++) learn(s, 'sill', -1, 1, now);
    expect(worth(s, 'sill', now)).toBeLessThan(0.75);
    for (let i = 0; i < 200; i++) learn(s, 'sill', -1, 1, now);
    expect(learnt(s, 'sill', now)).toBeGreaterThanOrEqual(-0.8);
    // (long after it, a little less sure of what it got for it: a third or so a fortnight on)
    expect(learnt(s, 'window', now + 15 * DAY)).toBeLessThan(0.4);
    expect(learnt(s, 'window', now + 15 * DAY)).toBeGreaterThan(0.25);
  });

  it('done long before the good thing came, it hardly counts', () => {
    const now = Date.UTC(2026, 9, 6, 12);
    const s = newCat(now);
    learn(s, 'ask', 1, 1, now);
    learn(s, 'groom', 1, Math.exp(-50 / 25), now);
    expect(learnt(s, 'ask', now)).toBeGreaterThan(4 * learnt(s, 'groom', now));
  });

  it('what it has learnt most about, for the window on its mind', () => {
    const now = Date.UTC(2026, 9, 6, 12);
    const s = newCat(now);
    learn(s, 'groom', 1, 0.5, now);
    for (let i = 0; i < 4; i++) learn(s, 'ask', 1, 1, now);
    for (let i = 0; i < 3; i++) learn(s, 'sill', -1, 1, now);
    const L = lessons(s, now);
    expect(L.map((l) => l.key)).toEqual(['ask', 'sill']);
    expect(L[0].by).toBeGreaterThan(0.4);
    expect(L[1].by).toBeLessThan(-0.25);
  });
});
