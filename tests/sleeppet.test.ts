import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Contact } from '../src/input/pointer';

/** asleep in its bed, stroked down its back a few seconds: what mode, how deep, how much purr */
function stroked(trust: number, seed: number) {
  let s = seed;
  const rnd = Math.random;
  Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const st = newCat(now - 30 * 864e5);
    st.trust = trust;
    st.lastTick = now;
    const quiet = (own: Record<string, unknown> = {}) =>
      new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    let jolts = 0;
    const anim = quiet({ jolt: () => { jolts++; } });
    // (the back under the finger, the fur lying the way it moves)
    const senses = quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) });
    const b = new Brain(st, anim as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, senses as never);
    b.wake(0, false, 0);
    b.toSleep(0.95);
    let t = 0;
    for (; t < 30; t += 0.05) b.update(0.05, t, []);
    const c: Contact = { id: 1, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 120, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 120 };
    const before = b.mode;
    b.touchStart(c);
    let minDepth = 1, maxPurr = 0;
    const modes = new Set<string>();
    for (let k = 0; k < 160; k++) {
      t += 0.05;
      // (the hand along its back and up and along again)
      const on = k % 40 < 34;
      b.update(0.05, t, on ? [c] : []);
      if (k % 40 === 33) b.touchEnd(c, false);
      if (k % 40 === 39) b.touchStart(c);
      modes.add(b.mode);
      minDepth = Math.min(minDepth, (b as unknown as { sleepDepth: number }).sleepDepth);
      maxPurr = Math.max(maxPurr, b.purr);
    }
    return { before, modes: [...modes], minDepth, maxPurr, jolts };
  } finally {
    Math.random = rnd;
  }
}

describe('stroked in its sleep', () => {
  it('a cat quite sure of you sleeps on under the hand, more lightly, and purrs in its sleep', () => {
    for (const seed of [11, 202, 3003]) {
      const r = stroked(0.85, seed);
      expect(r.before).toBe('sleep');
      expect(r.modes.every((m) => m === 'doze' || m === 'sleep')).toBe(true);
      expect(r.minDepth).toBeGreaterThanOrEqual(0.5);
      expect(r.maxPurr).toBeGreaterThan(0.35);
      expect(r.jolts).toBe(0);
    }
  });
  it('one not yet sure of you wakes with a start', () => {
    const r = stroked(0.2, 11);
    expect(r.modes.some((m) => m !== 'doze' && m !== 'sleep')).toBe(true);
    expect(r.jolts).toBeGreaterThan(0);
  });
});

describe('a love bite', () => {
  it('a good long while under a hand it likes: the mouth on the finger once, gently, and it settles', () => {
    let s = 4242;
    const rnd = Math.random;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    try {
      const now = Date.now();
      const st = newCat(now - 30 * 864e5);
      st.trust = 0.8;
      st.lastTick = now;
      st.personality.tolerance = 1;
      const quiet = (own: Record<string, unknown> = {}) =>
        new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
      const bites: number[] = [];
      let t = 0;
      const anim = quiet({ loveBite: () => { bites.push(t); return true; } });
      const senses = quiet({ zoneAt: () => 'head', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) });
      const b = new Brain(st, anim as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, senses as never);
      b.wake(0, false, 0);
      for (; t < 5; t += 0.05) b.update(0.05, t, []);
      (b as unknown as { toAwake: (m: string) => void }).toAwake('rest');
      const c: Contact = { id: 1, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 120, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 120 };
      b.touchStart(c);
      const start = t;
      let enjoyed = false;
      for (; t < start + 110; t += 0.05) { b.update(0.05, t, [c]); if (b.mode === 'enjoy') enjoyed = true; }
      expect(enjoyed, `mode ${b.mode} pleasure ${b.pleasure}`).toBe(true);
      expect(bites.length).toBe(1);
      // (not straight away: after a good long while of it)
      expect(bites[0] - start).toBeGreaterThan(40);
    } finally {
      Math.random = rnd;
    }
  });
});
