import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sunbathe, type Ctx } from '../src/pixel/behave';

/** a room with one thing on the floor (the books with the mug on them) and a sunny spot */
const room = (spot: THREE.Vector3, thing: THREE.Vector3, r: number) => ({
  sun: () => spot.clone(),
  clear: (p: THREE.Vector3, rr: number) => Math.hypot(p.x - thing.x, p.z - thing.z) >= r + rr,
  sunlit: () => true,
  bed: () => ({ to: new THREE.Vector3(), yaw: 0 }),
  // (lying down "facing" a way: here simply that heading)
  lieAt: (_p: string, at: THREE.Vector3, face: number) => ({ to: at.clone(), yaw: face }),
}) as unknown as Ctx;

const firstLeg = (c: Ctx) => {
  const act = sunbathe(c);
  if (!act) return null;
  return (act as unknown as { legs: { posture: string; face: number }[] }).legs[0];
};

describe('lying in the sun', () => {
  it('lies so that its head and its tail are both clear of the things on the floor', () => {
    // the sunny spot just behind the books, as on an October morning
    const spot = new THREE.Vector3(0.42, 0, 0.05), books = new THREE.Vector3(0.42, 0, 0.43);
    const c = room(spot, books, 0.14);
    let lay = 0;
    for (let i = 0; i < 200; i++) {
      const leg = firstLeg(c);
      if (!leg) continue;
      lay++;
      const half = leg.posture === 'side' ? 0.25 : 0.14;
      for (const d of [half, -half]) {
        const end = new THREE.Vector3(spot.x + Math.sin(leg.face) * d, 0, spot.z + Math.cos(leg.face) * d);
        expect(Math.hypot(end.x - books.x, end.z - books.z)).toBeGreaterThanOrEqual(0.14 + 0.06 - 1e-9);
      }
    }
    expect(lay).toBe(200);
  });

  it('flat out on its side, more often than not, where there is room to', () => {
    const c = room(new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 5), 0.1);
    let side = 0;
    for (let i = 0; i < 300; i++) if (firstLeg(c)?.posture === 'side') side++;
    expect(side / 300).toBeGreaterThan(0.45);
  });

  it('side on to you as it lies, never face on', () => {
    const c = room(new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 0, 5), 0.1);
    for (let i = 0; i < 100; i++) expect(Math.abs(Math.sin(firstLeg(c)!.face))).toBeGreaterThan(0.5);
  });
});
