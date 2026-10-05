import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Trap, type Ctx } from '../src/pixel/behave';
import type { Contact } from '../src/input/pointer';
import * as THREE from 'three';

/** awake and at its ease, a finger put on its belly and left there a while: how annoyed it gets
 *  in the first two and a half seconds and in the three after, whether it hisses, and how often it
 *  springs its trap (trap: whether its belly is offered) */
function bellyTouched(trap: boolean, seed: number) {
  let s = seed;
  const rnd = Math.random;
  Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  try {
    const now = Date.now();
    const st = newCat(now - 30 * 864e5);
    st.trust = 0.8;
    st.lastTick = now;
    const quiet = (own: Record<string, unknown> = {}) =>
      new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
    let traps = 0, hisses = 0;
    const anim = quiet({ bellyTrap: () => { traps++; return trap; }, hiss: () => { hisses++; } });
    const senses = quiet({ zoneAt: () => 'belly', grainAt: () => [1, 0], headScreen: () => ({ x: 0, y: 0 }) });
    const b = new Brain(st, anim as never, quiet({ play: () => 0.5 }) as never, quiet() as never, quiet() as never, senses as never);
    b.wake(0, false, 0);
    let t = 0;
    for (; t < 5; t += 0.05) b.update(0.05, t, []);
    const c: Contact = { id: 1, sx: 100, sy: 100, x0: 100, y0: 100, px: 100, py: 100, vx: 0, vy: 0, t0: t, last: t, onCat: true, startedOnCat: true, travel: 0, press: 0.4, maxSpeed: 0 };
    b.touchStart(c);
    let held = 0, after = 0;
    for (let k = 0; k < 110; k++) {
      t += 0.05;
      b.update(0.05, t, [c]);
      if (k < 50) held = Math.max(held, b.irritation);
      else after = Math.max(after, b.irritation);
    }
    return { held, after, hisses, traps };
  } finally {
    Math.random = rnd;
  }
}

describe('the belly trap: the brain', () => {
  it('its belly offered, a hand on it is its game while it has it; left there after, it minds', () => {
    for (const seed of [7, 77, 777]) {
      const r = bellyTouched(true, seed);
      expect(r.traps).toBe(1);
      expect(r.held).toBeLessThan(0.15);
      expect(r.after).toBeGreaterThan(r.held + 0.05);
    }
  });
  it('its belly not offered, a hand on it annoys it at once, as it always has', () => {
    const offered = bellyTouched(true, 7), not = bellyTouched(false, 7);
    expect(not.held).toBeGreaterThan(offered.held + 0.1);
  });
});

describe('the belly trap: the body', () => {
  const ctx = (m: Motor) => ({
    m, mood: { ...NEUTRAL }, viewer: () => new THREE.Vector3(0, 0.5, 3),
  }) as unknown as Ctx;
  for (const [kind, sd] of [['flop', 1], ['flop', -1], ['side', 1], ['back', 0]] as const) {
    it(`${kind}${sd < 0 ? ' (on its left)' : ''}: the paws round the hand, kick after kick and a bite or two; let go when the hand goes, and over`, () => {
      const m = new Motor();
      m.snap(kind === 'back' ? 'back' : kind === 'side' ? 'side' : 'crouch');
      const c = ctx(m), trap = new Trap(kind, sd);
      let kicks = 0, bites = 0, t = 0, zMin = 9, zMax = -9;
      const hind = kind === 'back' ? 'LH' : sd > 0 ? 'LH' : 'RH';
      for (; t < 2; t += 1 / 60) {
        expect(trap.update(1 / 60, c)).toBe(true);
        m.update(1 / 60);
        if (m.kicked) { kicks++; m.kicked = false; }
        if (m.nibbled) { bites++; m.nibbled = false; }
        if (t > 0.5) { zMin = Math.min(zMin, m.pose[hind].z); zMax = Math.max(zMax, m.pose[hind].z); }
        // (nothing gone wrong in the pose)
        expect(Number.isFinite(m.pose.hipRoll) && Number.isFinite(m.pose.neckPitch)).toBe(true);
      }
      expect(kicks).toBeGreaterThanOrEqual(5);
      expect(bites).toBeGreaterThanOrEqual(1);
      // (the hind feet raking: a good way up and down the body)
      expect(zMax - zMin).toBeGreaterThan(0.1);
      trap.release();
      expect(trap.phase).toBe('let');
      let over = -1;
      for (let u = 0; u < 3; u += 1 / 60) {
        if (!trap.update(1 / 60, c)) { over = u; break; }
        m.update(1 / 60);
        if (m.kicked) kicks = -100;
      }
      // (let go: no more kicks, and before long it is over)
      expect(kicks).toBeGreaterThan(0);
      expect(over).toBeGreaterThan(0.5);
      expect(over).toBeLessThan(1.8);
      trap.stop(c);
      expect(m.layer).toBe(null);
    });
  }
  it('held on to a good while, it lets go of itself', () => {
    const m = new Motor();
    m.snap('crouch');
    const c = ctx(m), trap = new Trap('flop', 1);
    let t = 0;
    for (; t < 8 && trap.update(1 / 60, c); t += 1 / 60) m.update(1 / 60);
    expect(t).toBeGreaterThan(2.2);
    expect(t).toBeLessThan(4.5);
  });
});
