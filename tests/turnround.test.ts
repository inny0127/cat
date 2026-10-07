import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';

/** a cat standing still facing `yaw`, sent to a point behind it with something solid beside it:
 *  which way it comes round, and how near its chest (13 cm ahead of it) ever gets to the thing */
function turnRound(yaw: number, solid: THREE.Vector3, R: number, goal: THREE.Vector3) {
  const m = new Motor();
  m.snap('stand');
  m.yaw = yaw;
  m.solids = () => [[solid, R]];
  m.obstacles = () => [];
  m.walkTo(goal, 0.3);
  let nearest = Infinity, turned = 0, last = m.yaw;
  for (let t = 0; t < 4 && m.goal; t += 1 / 60) {
    m.update(1 / 60);
    const d = Math.atan2(Math.sin(m.yaw - last), Math.cos(m.yaw - last));
    turned += d;
    last = m.yaw;
    const cx = m.pos.x + Math.sin(m.yaw) * 0.13, cz = m.pos.z + Math.cos(m.yaw) * 0.13;
    nearest = Math.min(nearest, Math.hypot(cx - solid.x, cz - solid.z) - R);
  }
  return { turned, nearest };
}

describe('coming round on the spot', () => {
  it('a thing beside it on the short way round: it goes round the other way, clear of it', () => {
    // (facing +x; the goal behind it and a little to -z, the short way round to the left, by -z;
    // the thing just off that shoulder, where the short way round would swing its chest)
    const r = turnRound(Math.PI / 2, new THREE.Vector3(0.1, 0, -0.12), 0.05, new THREE.Vector3(-0.6, 0, -0.15));
    expect(r.turned).toBeLessThan(0);
    expect(r.nearest).toBeGreaterThan(0.03);
  });
  it('nothing in the way: the short way round', () => {
    const r = turnRound(Math.PI / 2, new THREE.Vector3(2, 0, 2), 0.05, new THREE.Vector3(-0.6, 0, -0.15));
    expect(r.turned).toBeGreaterThan(0);
  });
});
