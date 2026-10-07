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

describe('a shift of the feet begun standing still, and the body sets off round meanwhile', () => {
  it('the paw comes down where it is wanted now, not across under the body where it was', () => {
    for (const rate of [2.4, -2.4]) {
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
      st.update(1 / 60, home, planted, vel, 0, centre, h, 0);
      // (the paw on the inside of the coming turn a little out of its place: a shift of it, still)
      const inner: Leg = rate > 0 ? 'LF' : 'RF';
      st.feet[inner].pos.x += 0.05 * SIDE[inner];
      const dt = 1 / 60;
      let worst = -1, landed = false;
      for (let t = 0; t < 1.5; t += dt) {
        // (it sets off round a moment after the shift begins)
        const r = t > 0.03 ? rate : 0;
        h += r * dt;
        place();
        const was = st.feet[inner].stepping;
        st.update(dt, home, planted, vel, r, centre, h, 0);
        if (was && !st.feet[inner].stepping) landed = true;
        if (landed && !st.feet[inner].stepping) {
          const p = st.feet[inner].pos;
          const x = p.x * Math.cos(h) - p.z * Math.sin(h);
          worst = Math.max(worst, -x * SIDE[inner]);
        }
        if (landed) break;
      }
      expect(landed).toBe(true);
      expect(worst).toBeLessThan(0.01);
    }
  });
});


describe('a paw in the air on its way to its place goes round the outside of its own shoulder or hip', () => {
  /** spun round after its tail, the shoulders and hips where the body has them (as the cat tells
   *  the stepper after its legs are set); how far any paw in the air ever got across under the
   *  middle of the body (m, past the middle) */
  function spin(rate: number) {
    const st = new Stepper();
    const home = { LF: new THREE.Vector3(), RF: new THREE.Vector3(), LH: new THREE.Vector3(), RH: new THREE.Vector3() };
    const planted = { LF: 1, RF: 1, LH: 1, RH: 1 };
    const centre = new THREE.Vector3(), vel = new THREE.Vector3();
    let h = 0;
    const place = () => {
      for (const l of LEGS) {
        const [x, y, z] = HOME[l];
        home[l].set(x * Math.cos(h) + z * Math.sin(h), y, -x * Math.sin(h) + z * Math.cos(h));
        const G = st.girdle[l], gx = 0.035 * SIDE[l], gz = l[1] === 'F' ? 0.1 : -0.15;
        G.at.set(gx * Math.cos(h) + gz * Math.sin(h), 0.15, -gx * Math.sin(h) + gz * Math.cos(h));
        G.out.set(SIDE[l] * Math.cos(h), 0, -SIDE[l] * Math.sin(h));
        G.ok = true;
      }
    };
    place();
    st.reset(home);
    let across = -1;
    const dt = 1 / 60;
    for (let t = 0; t < 2; t += dt) {
      h += rate * dt;
      place();
      st.update(dt, home, planted, vel, rate, centre, h, 0);
      for (const l of LEGS) {
        const F = st.feet[l];
        if (!F.stepping || F.s < 0.1 || F.s > 0.9) continue;
        const x = F.pos.x * Math.cos(h) - F.pos.z * Math.sin(h);
        across = Math.max(across, -x * SIDE[l]);
      }
    }
    return across;
  }
  it('round and round after its tail as fast as it goes: no paw swung through under the middle of it', () => {
    for (const rate of [4.2, -4.2]) expect(spin(rate)).toBeLessThan(0);
  });
});

describe('at a run, a hard turn one way and then the other', () => {
  /** a cat running along, its turns as given (secs, m/s, rad/s): how far any forepaw on the floor
   *  is ever across under its chest (m, past its shoulder's own side) */
  function run(legs: { secs: number; speed: number; rate: number }[]) {
    const st = new Stepper();
    const home = { LF: new THREE.Vector3(), RF: new THREE.Vector3(), LH: new THREE.Vector3(), RH: new THREE.Vector3() };
    const planted = { LF: 1, RF: 1, LH: 1, RH: 1 };
    const pos = new THREE.Vector3(), vel = new THREE.Vector3();
    let h = 0;
    const place = () => {
      for (const l of LEGS) {
        const [x, y, z] = HOME[l];
        home[l].set(pos.x + x * Math.cos(h) + z * Math.sin(h), y, pos.z - x * Math.sin(h) + z * Math.cos(h));
        // (the shoulder or hip over it, and out to its side)
        const G = st.girdle[l], gx = 0.6 * x;
        G.at.set(pos.x + gx * Math.cos(h) + z * Math.sin(h), 0, pos.z - gx * Math.sin(h) + z * Math.cos(h));
        G.out.set(SIDE[l] * Math.cos(h), 0, -SIDE[l] * Math.sin(h));
        G.ok = true;
      }
    };
    place();
    st.reset(home);
    let across = -1;
    const dt = 1 / 60;
    let speed = 0;
    for (const L of legs) {
      for (let t = 0; t < L.secs; t += dt) {
        speed += (L.speed - speed) * Math.min(1, dt * 6);
        h += L.rate * dt;
        vel.set(Math.sin(h) * speed, 0, Math.cos(h) * speed);
        pos.addScaledVector(vel, dt);
        place();
        st.update(dt, home, planted, vel, L.rate, pos, h, speed);
        for (const l of ['LF', 'RF'] as const) {
          const F = st.feet[l], G = st.girdle[l];
          if (F.stepping) continue;
          across = Math.max(across, -((F.pos.x - G.at.x) * G.out.x + (F.pos.z - G.at.z) * G.out.z));
        }
      }
    }
    return across;
  }
  it('no forepaw is put down across under the chest when the turn goes over the other way all at once', () => {
    for (const r of [4.5, -4.5]) {
      const a = run([{ secs: 0.8, speed: 1.3, rate: 0 }, { secs: 0.5, speed: 1.3, rate: r }, { secs: 0.6, speed: 1.0, rate: -0.3 * r }]);
      expect(a).toBeLessThan(0.03);
    }
  });
});
