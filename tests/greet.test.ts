import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Greet, type Ctx } from '../src/pixel/behave';

/** a cat (its motor) lying in its bed, with only what a hello needs of a room */
function room() {
  const m = new Motor();
  m.snap('loaf');
  const blinks: boolean[] = [];
  const c = {
    m, home: new THREE.Vector3(), window: new THREE.Vector3(0, 0, 0.2),
    room: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, mode: 'rest', mood: { ...NEUTRAL, trust: 0.8 }, kneading: false,
    bed: () => ({ to: new THREE.Vector3(), yaw: 0 }), sound: () => {}, say: () => {},
    viewer: () => new THREE.Vector3(0, 1.4, 3), perch: () => {}, hold: () => {}, bump: () => {},
    blink: (slow: boolean) => blinks.push(slow),
  } as unknown as Ctx;
  return { c, m, blinks };
}

describe('a hello when you come back', () => {
  it('up to the glass, sat there looking at you, a slow blink, and in a while about its business', () => {
    const { c, m, blinks } = room();
    m.pos.set(0.05, 0, -0.1);
    const act = new Greet(0.3), seen = new Set<string>();
    let t = 0, going = true;
    for (; t < 40 && going; t += 0.02) {
      going = act.update(0.02, c);
      m.update(0.02);
      seen.add(act.phase);
    }
    expect(seen.has('come')).toBe(true);
    expect(seen.has('stay')).toBe(true);
    // (sat down at the glass, facing you)
    expect(Math.hypot(m.pos.x - 0, m.pos.z - 0.2)).toBeLessThan(0.08);
    expect(m.targetPosture).toBe('sit');
    expect(blinks[0]).toBe(true);
    expect(going).toBe(false);
  });

  it('fond of you: a head pushed at the glass, a cheek along it', () => {
    const { c, m } = room();
    m.pos.set(0, 0, 0.18);
    // (as glad as can be: it nearly always does)
    let bumped = 0;
    for (let k = 0; k < 6; k++) {
      const act = new Greet(1), seen = new Set<string>();
      for (let t = 0; t < 12; t += 0.02) {
        act.update(0.02, c);
        m.update(0.02);
        seen.add(act.phase);
      }
      if (seen.has('bump')) bumped++;
    }
    expect(bumped).toBeGreaterThan(2);
  });
});
