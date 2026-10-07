import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { Walk, type Ctx } from '../src/pixel/behave';

/** a cat walking a metre and a bit across an empty floor, and what catches its eye on the way
 *  (`glimpse(t)`): how long it stood still on the way, and where its head was turned meanwhile */
function walk(glimpse: (t: number) => { at: THREE.Vector3; k: number } | null) {
  const m = new Motor();
  m.snap('stand');
  let t = 0;
  const c = { m, glimpse: () => glimpse(t) } as unknown as Ctx;
  const act = new Walk('wander', [{ to: new THREE.Vector3(0, 0, 1.2), face: 0, stay: 0.5, posture: 'stand' }]);
  let stood = 0, lookedAt: THREE.Vector3 | null = null, arrived = -1;
  for (; t < 12; t += 1 / 60) {
    if (!act.update(1 / 60, c)) break;
    m.update(1 / 60);
    const left = 1.2 - m.pos.z;
    if (left > 0.08 && m.speed < 0.02 && t > 0.5) { stood += 1 / 60; lookedAt = m.lookTarget?.clone() ?? lookedAt; }
    if (arrived < 0 && left < 0.05) arrived = t;
  }
  return { stood, lookedAt, arrived };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('on its way somewhere', () => {
  it('nothing catching its eye: straight there', () => {
    const r = walk(() => null);
    expect(r.stood).toBeLessThan(0.1);
    expect(r.arrived).toBeGreaterThan(0);
  });
  it('a thing moving off to its side on the way: it stops, looks at it a moment, and goes on', () => {
    // (the same dice every run: three times in four it stops for it, and that is no test)
    let seed = 777;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    let stops = 0;
    for (let k = 0; k < 8; k++) {
      const thing = new THREE.Vector3(0.8, 0.1, 0.5);
      const r = walk((t) => (t > 1 && t < 2.5 ? { at: thing, k: 1 } : null));
      if (r.stood > 0.4) {
        stops++;
        expect(r.lookedAt && r.lookedAt.distanceTo(thing) < 0.05).toBe(true);
      }
      expect(r.arrived).toBeGreaterThan(0);
    }
    expect(stops).toBeGreaterThan(3);
  });
});
