import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Stepper } from '../src/cat3d/stepper';
import { LEGS, type Leg } from '../src/cat3d/pose';

/** where each paw stands under a cat at ease (its own frame: +x its left, +z ahead) */
const HOME: Record<Leg, [number, number, number]> = {
  LF: [0.036, 0.012, 0.104], RF: [-0.036, 0.012, 0.104], LH: [0.041, 0.013, -0.158], RH: [-0.041, 0.013, -0.158],
};
const SIDE: Record<Leg, number> = { LF: 1, LH: 1, RF: -1, RH: -1 };

/** a cat turned round on the spot `rate` rad/s for `secs`, then held still as long: how far any
 *  paw on the floor ever got across under its body (m, past the middle), and how far from its
 *  place each is at the end */
function turn(rate: number, secs: number) {
  const st = new Stepper();
  const home = { LF: new THREE.Vector3(), RF: new THREE.Vector3(), LH: new THREE.Vector3(), RH: new THREE.Vector3() };
  const planted = { LF: 1, RF: 1, LH: 1, RH: 1 };
  const centre = new THREE.Vector3(), vel = new THREE.Vector3();
  let h = 0;
  const place = () => {
    for (const l of LEGS) {
      const [x, y, z] = HOME[l];
      home[l].set(x * Math.cos(h) + z * Math.sin(h), y, -x * Math.sin(h) + z * Math.cos(h));
    }
  };
  place();
  st.reset(home);
  let across = -1;
  const dt = 1 / 60;
  for (let t = 0; t < 2 * secs; t += dt) {
    const r = t < secs ? rate : 0;
    h += r * dt;
    place();
    st.update(dt, home, planted, vel, r, centre, h, 0);
    for (const l of LEGS) {
      const F = st.feet[l];
      if (F.stepping) continue;
      // (the paw in the cat's own frame: its side of the middle)
      const p = F.pos;
      const x = p.x * Math.cos(h) - p.z * Math.sin(h);
      across = Math.max(across, -x * SIDE[l]);
    }
  }
  const off = Math.max(...LEGS.map((l) => Math.hypot(st.feet[l].pos.x - home[l].x, st.feet[l].pos.z - home[l].z)));
  return { across, off };
}

describe('turning on the spot, the paws step round with it', () => {
  it('squared round to something in a crouch (as before a pounce): no paw ever across under the body', () => {
    const r = turn(1.7, 1.5);
    expect(r.across).toBeLessThan(0.0);
    expect(r.off).toBeLessThan(0.03);
  });
  it('round and round after its own tail: quick short steps, never a leg across under it', () => {
    for (const rate of [5, -5]) {
      const r = turn(rate, 1.2);
      expect(r.across).toBeLessThan(0.02);
      expect(r.off).toBeLessThan(0.03);
    }
  });
});
