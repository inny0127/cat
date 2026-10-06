import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import { bodyFor, eyesFor, moodFromBrain, NEUTRAL } from '../src/cat3d/mood';

/** a cat at its ease, a clap of thunder (and maybe another, so long after): what it is like over the
 *  next while (every 0.05 s: how afraid, how much on edge, its mode) */
function storm(first: number, second = 0, after = 40, sec = 400) {
  let r = 13;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const now = Date.now();
  const s = newCat(now - 30 * 864e5);
  s.trust = 0.5;
  s.lastTick = now;
  s.hunger = 0.1;
  s.thirst = 0.1;
  s.personality.bold = 0;
  const quiet = (own: object = {}) =>
    new Proxy(own as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const b = new Brain(s, quiet({ inRoom: true }) as never, quiet({ play: () => 0.4 }) as never, quiet() as never, quiet() as never, quiet({ zoneAt: () => 'back', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) }) as never);
  b.toAwake('rest');
  const out: { t: number; fear: number; shaken: number }[] = [];
  let t = 0, peak2 = 0;
  for (; t < 2; t += 0.05) { s.lastTick += 50; b.update(0.05, t, []); }
  const t0 = t;
  if (first) b.thunder(first);
  for (; t < t0 + sec; t += 0.05) {
    s.lastTick += 50;
    // (kept from nodding off, to see it awake all through)
    (b as unknown as { wantSleepIn: number }).wantSleepIn = 1e6;
    if (second && t - t0 >= after && t - t0 < after + 0.05) b.thunder(second);
    b.update(0.05, t, []);
    if (second && t - t0 >= after && t - t0 < after + 3) peak2 = Math.max(peak2, b.fear);
    out.push({ t: t - t0, fear: b.fear, shaken: b.shaken });
  }
  Math.random = rnd;
  return { out, peak2, at: (x: number) => out.find((o) => o.t >= x)! };
}

describe('on edge after a fright', () => {
  it('the fear is soon over, but it stays wary a few minutes, wearing off', () => {
    const S = storm(0.95);
    expect(S.at(3).shaken).toBeGreaterThan(0.5);
    expect(S.at(40).fear).toBeLessThan(0.05);
    expect(S.at(60).shaken).toBeGreaterThan(0.3);
    expect(S.at(360).shaken).toBeLessThan(0.15);
  });

  it('a second clap while it is still on edge frightens it more than the same would a calm cat', () => {
    const shaken = storm(0.95, 0.5, 40);
    const calm = storm(0, 0.5, 40);
    expect(shaken.at(39).fear).toBeLessThan(0.05);
    expect(shaken.peak2).toBeGreaterThan(calm.peak2 + 0.08);
  });

  it('shows awake, not asleep: wide eyes, a little low, the tail low, the ears busy', () => {
    const awake = moodFromBrain({ mode: 'rest', pleasure: 0, irritation: 0, fear: 0, arousal: 0, sleepDepth: 0, shaken: 0.8 }, 0, 0.5, 0);
    const asleep = moodFromBrain({ mode: 'sleep', pleasure: 0, irritation: 0, fear: 0, arousal: 0, sleepDepth: 0.9, shaken: 0.8 }, 0, 0.5, 0);
    expect(awake.wary).toBeCloseTo(0.8, 5);
    expect(asleep.wary).toBe(0);
    const at = { ...NEUTRAL, trust: 0.5 }, w = { ...at, wary: 0.8 };
    expect(bodyFor(w).low).toBeGreaterThan(bodyFor(at).low + 0.2);
    expect(bodyFor(w).tailLift).toBeLessThan(bodyFor(at).tailLift - 0.2);
    expect(bodyFor(w).earFlicks).toBeGreaterThan(bodyFor(at).earFlicks * 2);
    // (but no fur on end: that was the fright itself)
    expect(bodyFor(w).puff).toBe(bodyFor(at).puff);
    expect(eyesFor(w).pupil).toBeGreaterThan(eyesFor(at).pupil + 0.03);
    expect(eyesFor(w).open).toBeGreaterThanOrEqual(eyesFor(at).open);
  });
});

describe('what it does with itself, on edge', () => {
  it('no games, and the box, by you, an eye out and a nose in the air more', async () => {
    const THREE = await import('three');
    const { idleOptions } = await import('../src/pixel/behave');
    const { Motor } = await import('../src/cat3d/motor');
    const room = (wary: number) => {
      const m = new Motor();
      m.snap('loaf');
      const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
      return {
        m, mode: 'rest', mood: { ...NEUTRAL, arousal: 0.3, trust: 0.6, wary }, temper: { bold: 0, playful: 0, lazy: 0, curious: 0 }, home: V(0, 0), window: V(0, 0.3), night: 0, rain: 0,
        bed: () => ({ to: V(0, 0), yaw: 0 }), posts: () => [], scratcher: () => null, pompom: () => null, sun: () => V(0.4, 0.2),
        warm: () => null, yarn: () => V(0.3, 0.3), lure: () => null, mouse: () => null, finger: () => null, box: () => null,
        sill: () => null, visitor: () => null, keepClear: (p: unknown) => p,
      } as never;
    };
    const w = (wary: number, key: string) => idleOptions(room(wary), true, 'loaf').find((o) => o.key === key)?.w ?? 0;
    expect(w(0, 'play')).toBeGreaterThan(0);
    expect(w(0.8, 'play')).toBeLessThan(w(0, 'play') * 0.5);
    expect(w(0.8, 'stare')).toBeGreaterThan(w(0, 'stare') * 1.5);
    expect(w(0.8, 'scent')).toBeGreaterThan(w(0, 'scent') * 1.5);
  });
});
