import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';

describe('out of a thing it was in', () => {
  it('steps out of the box once it means to be out, at a walk, not in one jump', () => {
    const m = new Motor();
    m.snap('stand');
    // (a box round where it stands: it was in it on purpose)
    const box: (readonly [THREE.Vector3, number])[] = [[new THREE.Vector3(0.06, 0, 0), 0.12]];
    m.solids = () => box;
    m.ghost = true;
    const dt = 1 / 60;
    for (let t = 0; t < 0.5; t += dt) m.update(dt);
    const was = m.pos.clone();
    m.ghost = false;
    let most = 0;
    for (let t = 0; t < 2; t += dt) {
      const p = m.pos.clone();
      m.update(dt);
      most = Math.max(most, m.pos.distanceTo(p) / dt);
    }
    // (out of it in the end)
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    for (const k of [0.11, -0.09]) {
      expect(Math.hypot(m.pos.x + fx * k - 0.06, m.pos.z + fz * k)).toBeGreaterThan(0.12 + 0.075 - 0.002);
    }
    expect(m.pos.distanceTo(was)).toBeGreaterThan(0.05);
    // (and no quicker than a walk on the way)
    expect(most).toBeLessThan(0.32);
  });

  it('walked at, a thing is kept out of at any speed', () => {
    const m = new Motor();
    m.snap('stand');
    const post: (readonly [THREE.Vector3, number])[] = [[new THREE.Vector3(0, 0, 1), 0.06]];
    m.solids = () => post;
    m.zoom = 1;
    m.walkTo(new THREE.Vector3(0, 0, 2), 1.5, null, null, true);
    const dt = 1 / 60;
    let deepest = 0;
    for (let t = 0; t < 3; t += dt) {
      m.update(dt);
      const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
      for (const k of [0.11, -0.09]) deepest = Math.max(deepest, 0.06 + 0.075 - Math.hypot(m.pos.x + fx * k, m.pos.z + fz * k - 1));
    }
    expect(deepest).toBeLessThan(0.02);
  });
});
