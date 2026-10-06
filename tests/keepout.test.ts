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

describe('where to stand to reach a thing', () => {
  it('in a gap narrower than a cat is long, from out in the open; in the open, the way it comes', async () => {
    const THREE = await import('three');
    const { standTo } = await import('../src/pixel/behave');
    const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);
    const solids = [[V(-0.3, -0.15), 0.08], [V(-0.31, 0.4), 0.22]] as const;
    const c = { m: { solids: () => solids }, keepClear: (p: InstanceType<typeof THREE.Vector3>) => p } as never;
    const clear = (x: number, z: number) => solids.every(([o, R]) => Math.hypot(x - o.x, z - o.z) >= R + 0.075);
    for (const [thing, from] of [[V(-0.28, 0.07), V(0.25, 0.06)], [V(-0.3, 0.06), V(-0.7, 0.1)], [V(0.3, 0.1), V(0.6, 0.1)]] as const) {
      const s = standTo(c, thing, from, 0.15)!;
      expect(s).not.toBeNull();
      const fx = Math.sin(s.face), fz = Math.cos(s.face);
      expect(clear(s.to.x + fx * 0.11, s.to.z + fz * 0.11)).toBe(true);
      expect(clear(s.to.x - fx * 0.09, s.to.z - fz * 0.09)).toBe(true);
      // (facing it, and the reach from it)
      expect(Math.hypot(thing.x - s.to.x, thing.z - s.to.z)).toBeCloseTo(0.15, 5);
      const toThing = Math.atan2(thing.x - s.to.x, thing.z - s.to.z);
      expect(Math.abs(Math.atan2(Math.sin(toThing - s.face), Math.cos(toThing - s.face)))).toBeLessThan(1e-6);
    }
    // (in the open: straight from the way it comes)
    const open = standTo(c, V(0.3, 0.1), V(0.6, 0.1), 0.15)!;
    expect(open.to.x).toBeCloseTo(0.45, 5);
  });
});
