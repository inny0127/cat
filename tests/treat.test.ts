import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { SitPretty, eatTreat, type Ctx, type Act } from '../src/pixel/behave';

const YOU = new THREE.Vector3(0, 1.4, 3);

/** an open floor, you out in front */
function setup(seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const m = new Motor();
  m.snap('stand');
  m.pos.set(0, 0, 0);
  const said: string[] = [], sounds: string[] = [];
  let ate = 0;
  const c = new Proxy({
    m, viewer: () => YOU.clone(), keepClear: (p: THREE.Vector3) => p, temper: { bold: 0, playful: 0, lazy: 0, curious: 0 },
    mood: { sleepy: 0.1 }, say: (k: string) => said.push(k), sound: (k: string) => sounds.push(k), eatTreat: () => { ate++; },
  } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => null) }) as unknown as Ctx;
  return { m, c, said, sounds, ate: () => ate, done: () => { Math.random = rnd; } };
}

function run(act: Act, c: Ctx, m: Motor, upTo = 30, each?: (t: number) => void) {
  const moments = new Set<string>();
  let t = 0, going = true;
  for (; t < upTo && going; t += 1 / 30) {
    going = act.update(1 / 30, c);
    m.update(1 / 30);
    if (m.moment) { moments.add(m.moment); m.moment = null; }
    each?.(t);
  }
  act.stop(c);
  return { t, going, moments };
}

describe('sitting pretty', () => {
  it('up on its haunches, forepaws off the floor and the chest up, facing you; down again after a few seconds', () => {
    const { m, c, done } = setup(4);
    try {
      const act = new SitPretty();
      let upright = 0, pawsUp = 0;
      const { t, going, moments } = run(act, c, m, 10, () => {
        const L = m.layer;
        if (L && L.w > 0.9 && (L.pose.chestPitch ?? 0) < -0.9) upright++;
        if (L && L.w > 0.9 && (L.pose.LF?.y ?? 0) > 0.17) pawsUp++;
      });
      expect(going).toBe(false);
      expect(t).toBeLessThan(4.5);
      expect(upright).toBeGreaterThan(20);
      expect(pawsUp).toBeGreaterThan(20);
      expect(moments.has('pretty')).toBe(true);
      expect(m.posture).toBe('sit');
      // (round to you)
      const face = Math.atan2(YOU.x - m.pos.x, YOU.z - m.pos.z);
      expect(Math.abs(Math.atan2(Math.sin(face - m.yaw), Math.cos(face - m.yaw)))).toBeLessThan(0.5);
    } finally { done(); }
  });

  it('the treat on its way: down off its haunches at once', () => {
    const { m, c, done } = setup(5);
    try {
      const act = new SitPretty(3);
      let t = 0, going = true;
      for (; t < 10 && going; t += 1 / 30) {
        if (Math.abs(t - 1.2) < 1 / 60) act.done();
        going = act.update(1 / 30, c);
        m.update(1 / 30);
      }
      expect(t).toBeLessThan(2.2);
    } finally { done(); }
  });
});

describe('a treat on the floor', () => {
  it('over to it, a sniff, crunched up in a few bites, eaten; then a lick of the lips and a sit looking at you', () => {
    for (const seed of [1, 2, 3]) {
      const { m, c, sounds, ate, done } = setup(seed);
      try {
        const at = new THREE.Vector3(0.4, 0, 0.3);
        let crouched = false, sawLick = false;
        const { going, moments } = run(eatTreat(c, at), c, m, 20, () => {
          if (m.posture === 'crouch' && Math.hypot(m.pos.x - at.x, m.pos.z - at.z) < 0.25) crouched = true;
          if (m.noseLicking) sawLick = true;
        });
        expect(going).toBe(false);
        expect(crouched).toBe(true);
        expect(ate()).toBe(1);
        expect(moments.has('treat')).toBe(true);
        const crunches = sounds.filter((s) => s === 'crunch').length;
        expect(crunches).toBeGreaterThanOrEqual(2);
        expect(crunches).toBeLessThanOrEqual(3);
        expect(sawLick).toBe(true);
        expect(m.posture).toBe('sit');
      } finally { done(); }
    }
  });
});
