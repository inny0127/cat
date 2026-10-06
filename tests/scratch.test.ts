import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Contact } from '../src/input/pointer';
import type { Zone } from '../src/sim/zones';

/** a hand on a fond cat at its ease, where (zone), how (the hand's way, painting px/s at time t),
 *  so long: how it felt, and what it did */
function hand(zone: Zone | ((t: number) => Zone), way: (t: number) => [number, number], sec = 8, trust = 0.8) {
  let t = 0;
  const where = typeof zone === 'function' ? zone : () => zone;
  let r = 11;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = trust;
  s.lastTick = now;
  s.hunger = 0.1;
  s.thirst = 0.1;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  // (the fur there lies to the right on the screen)
  const b = new Brain(s, quiet({ inRoom: true }) as never, quiet({ play: () => 0.4 }) as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => where(t), grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
  b.toAwake('rest');
  for (; t < 2; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); }
  const c: Contact = { id: 4, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 0, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
  b.touchStart(c);
  let modes = 0, was = b.mode, most = 0;
  for (const end = t + sec; t < end; t += 0.05) {
    s.lastTick += 50;
    [c.vx, c.vy] = way(t);
    b.update(0.05, t, [c]);
    if (b.mode !== was) { modes++; was = b.mode; }
    most = Math.max(most, b.irritation);
  }
  b.touchEnd(c, false);
  Math.random = rnd;
  return { pleasure: b.pleasure, irritation: b.irritation, most, purr: b.purr, modes };
}

describe('a scratch, not a stroke', () => {
  it('fingertips worked back and forth on its head are a pleasure, whichever way the fur lies', () => {
    // (back and forth, four times a second, quick)
    const scratch = hand('head', (t) => [420 * Math.cos(t * Math.PI * 8), 0]);
    expect(scratch.most).toBeLessThan(0.1);
    expect(scratch.pleasure).toBeGreaterThan(0.6);
    // (round and round, a little slower)
    const round = hand('head', (t) => [160 * Math.cos(t * 9), 160 * Math.sin(t * 9)]);
    expect(round.most).toBeLessThan(0.1);
    expect(round.pleasure).toBeGreaterThan(0.6);
  });

  it('the roots of its ears scratched: liked; the same hand drawn one way over them, against the fur, is not', () => {
    const ears = hand('ear', (t) => [300 * Math.cos(t * Math.PI * 7), 80 * Math.sin(t * Math.PI * 7)]);
    expect(ears.most).toBeLessThan(0.1);
    expect(ears.pleasure).toBeGreaterThan(0.3);
    // (as quick, but one way, against the lie of the fur, stroke after stroke)
    const against = hand('ear', (t) => [(t % 1) < 0.7 ? -300 : 0, 0]);
    expect(against.most).toBeGreaterThan(0.3);
  });

  it('a stranger it does not trust gets no more for scratching than for stroking', () => {
    const stranger = hand('ear', (t) => [300 * Math.cos(t * Math.PI * 7), 0], 6, -0.3);
    expect(stranger.pleasure).toBeLessThan(0.1);
  });
});

describe('liking it and minding it', () => {
  it('a hand it half likes and half minds: it does not flick from the one to the other and back', () => {
    // (under its chin, and now and then its tail, by turns: liking it, and minding it more and more;
    // with nothing between the two, it was a dozen times one and the other in as many seconds)
    const mixed = hand((t) => (t % 2 < 1.45 ? 'chin' : 'tail'), () => [120, 0], 24);
    expect(mixed.most).toBeGreaterThan(0.42);
    expect(mixed.modes).toBeLessThanOrEqual(3);
  });
});
