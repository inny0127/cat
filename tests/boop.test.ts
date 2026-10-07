import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { boop, type Ctx } from '../src/pixel/behave';

/** a boop on the nose, frame by frame (the same dice for the same seed) */
function booped(seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const m = new Motor();
    m.snap('sit');
    const c = { m, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx;
    const act = boop();
    let shut = 1, back = 0, licked = 0, shook = 0, t = 0, going = true;
    for (; t < 3 && going; t += 1 / 60) {
      going = act.update(1 / 60, c);
      const L = m.layer;
      if (!L) continue;
      const p = L.pose as Record<string, number>;
      shut = Math.min(shut, (p.eyeOpen ?? 1) * L.w + (1 - L.w));
      back = Math.min(back, (p.whisker ?? 0) * L.w);
      licked = Math.max(licked, (p.tongue ?? 0) * L.w);
      shook = Math.max(shook, Math.abs(p.headRoll ?? 0) * L.w);
    }
    return { shut, back, licked, shook, t, going };
  } finally { Math.random = rnd; }
}

describe('a boop on the nose', () => {
  it('the eyes squeezed shut and the whiskers back a moment, then a lick of the nose, as a rule a shake, and over', () => {
    let shakes = 0;
    const lens = new Set<number>();
    for (let s = 1; s <= 8; s++) {
      const b = booped(s);
      expect(b.shut).toBeLessThan(0.2);
      expect(b.back).toBeLessThan(-0.5);
      expect(b.licked).toBeGreaterThan(0.6);
      expect(b.going).toBe(false);
      expect(b.t).toBeLessThan(2);
      if (b.shook > 0.1) shakes++;
      lens.add(Math.round(b.t * 10));
    }
    // (a shake of the head after it, mostly; and not the one length every time)
    expect(shakes).toBeGreaterThanOrEqual(4);
    expect(lens.size).toBeGreaterThan(2);
  });
});
