import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Sulk, type Ctx } from '../src/pixel/behave';

/** the sulk in its corner, on the motor itself: where it goes, which way it sits, how it ends */
describe('sulking in a corner of the room', () => {
  const ctx = (m: Motor, mode: { now: string }) => ({
    m, mood: { ...NEUTRAL }, viewer: () => new THREE.Vector3(0, 0.6, 3),
    get mode() { return mode.now; },
  }) as unknown as Ctx;
  const corner = { to: new THREE.Vector3(-0.74, 0, -0.05), face: -2.3 };

  it('off to the corner, sat with its back to you, and there till the mind moves on; then round to you, and over', () => {
    const m = new Motor();
    m.snap('stand');
    const mode = { now: 'leaving' };
    const c = ctx(m, mode);
    let there = 0;
    const k = new Sulk(corner, () => { there++; mode.now = 'away'; });
    let t = 0;
    for (; t < 15 && k.phase === 'go'; t += 1 / 60) { expect(k.update(1 / 60, c)).toBe(true); m.update(1 / 60); }
    expect(there).toBe(1);
    expect(Math.hypot(m.pos.x - corner.to.x, m.pos.z - corner.to.z)).toBeLessThan(0.08);
    // (its back to you: you are along +z, it faces away from that)
    expect(Math.cos(m.yaw)).toBeLessThan(-0.4);
    for (let u = 0; u < 20; u += 1 / 60) { expect(k.update(1 / 60, c)).toBe(true); m.update(1 / 60); }
    expect(m.targetPosture).toBe('loaf');
    // a hand on it, a knock on the glass: still sulking
    k.rebuff();
    k.heard();
    for (let u = 0; u < 2; u += 1 / 60) { expect(k.update(1 / 60, c)).toBe(true); m.update(1 / 60); }
    // the sulk over, by the mind's say: round to you, sat, and done before long
    mode.now = 'rest';
    let over = -1;
    for (let u = 0; u < 8; u += 1 / 60) {
      if (!k.update(1 / 60, c)) { over = u; break; }
      m.update(1 / 60);
    }
    expect(k.phase).toBe('round');
    expect(over).toBeGreaterThan(0.5);
    expect(over).toBeLessThan(6);
    // (and facing you now)
    expect(Math.cos(m.yaw - Math.atan2(0 - m.pos.x, 3 - m.pos.z))).toBeGreaterThan(0.7);
    k.stop(c);
  });

  it('pestered: up and off to the other corner', () => {
    const m = new Motor();
    m.snap('stand');
    const mode = { now: 'away' };
    const c = ctx(m, mode);
    const k = new Sulk(corner);
    for (let t = 0; t < 12 && k.phase === 'go'; t += 1 / 60) { k.update(1 / 60, c); m.update(1 / 60); }
    const other = { to: new THREE.Vector3(0.7, 0, -0.05), face: 2.3 };
    k.moveTo(other);
    for (let t = 0; t < 15 && k.phase === 'go'; t += 1 / 60) { k.update(1 / 60, c); m.update(1 / 60); }
    expect(k.phase).toBe('sit');
    expect(Math.hypot(m.pos.x - other.to.x, m.pos.z - other.to.z)).toBeLessThan(0.08);
  });
});
