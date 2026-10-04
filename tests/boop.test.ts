import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { boop, type Ctx } from '../src/pixel/behave';

describe('a boop on the nose', () => {
  it('the eyes squeezed shut and the whiskers back a moment, then a lick and a shake, and over', () => {
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
      licked = Math.max(licked, (p.jaw ?? 0) * L.w);
      shook = Math.max(shook, Math.abs(p.headRoll ?? 0) * L.w);
    }
    expect(shut).toBeLessThan(0.2);
    expect(back).toBeLessThan(-0.5);
    expect(licked).toBeGreaterThan(0.08);
    expect(shook).toBeGreaterThan(0.1);
    expect(going).toBe(false);
    expect(t).toBeLessThan(2);
  });
});
