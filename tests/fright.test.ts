import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';

/** a near clap of thunder for a cat resting, and what it does over the next while: when (s after
 *  the clap) it puts its coat to rights, if it does, and how afraid it still was then */
function fright(seed: number, busyFor = 0) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = 0.5;
  s.lastTick = now;
  s.hunger = 0.1;
  s.thirst = 0.1;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  let t = 0, at = 0;
  const tidied: { t: number; fear: number; where: string }[] = [];
  let b: Brain;
  const anim = quiet({
    inRoom: true,
    // (busy with something of its own for a while after: it cannot yet)
    tidy: (where: string) => { if (t - at < busyFor) return false; tidied.push({ t: t - at, fear: b.fear, where }); return true; },
  });
  b = new Brain(s, anim as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
  const step = (sec: number) => { for (const end = t + sec; t < end; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); } };
  b.toAwake('rest');
  step(2);
  at = t;
  b.thunder(0.95);
  step(40);
  Math.random = rnd;
  return tidied;
}

describe('getting over a fright', () => {
  it('as often as not, a few licks of its coat once it has got over it, not while it is still afraid', () => {
    let did = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const T = fright(seed);
      expect(T.length).toBeLessThanOrEqual(1);
      if (!T.length) continue;
      did++;
      expect(T[0].t).toBeGreaterThan(3);
      expect(T[0].fear).toBeLessThan(0.13);
      expect(['flank', 'chest']).toContain(T[0].where);
    }
    expect(did).toBeGreaterThanOrEqual(4);
    expect(did).toBeLessThanOrEqual(11);
  });

  it('busy at first, it does it when it is free', () => {
    let did = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const T = fright(seed, 20);
      if (T.length) { did++; expect(T[0].t).toBeGreaterThanOrEqual(20); }
    }
    expect(did).toBeGreaterThanOrEqual(4);
  });
});
