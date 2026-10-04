import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Sill, type Ctx } from '../src/pixel/behave';

/** a cat (its motor) sat up on the windowsill facing the glass, the mug of tea by its side and the
 *  pencil (if any) by its paws, with only what the sill needs of a room */
function sill(withPencil = false) {
  const m = new Motor();
  m.snap('sit');
  const spot = { launch: new THREE.Vector3(0, 0, 0.44), seat: new THREE.Vector3(0, 0, 0.08), land: new THREE.Vector3(0.03, 0, 0.46), height: 0.36 };
  m.pos.copy(spot.seat);
  m.yaw = Math.PI;
  const edge = 0.245;
  const mug = { at: new THREE.Vector3(-0.105, 0.36, 0.13), onSill: true };
  const pencil = { at: new THREE.Vector3(0.12, 0.36, 0.17), onSill: true };
  const pushes: { what: string; dz: number }[] = [];
  const looks: string[] = [];
  const viewer = new THREE.Vector3(0, 1.4, 3);
  const c = {
    m, home: new THREE.Vector3(), window: new THREE.Vector3(0, 0, 0.3),
    room: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, mode: 'rest', mood: { ...NEUTRAL }, kneading: false,
    night: 0, rain: 0, snow: false,
    keepClear: (p: THREE.Vector3) => p, sound: () => {}, say: () => {}, chirp: () => {}, birds: () => null, drop: () => {},
    perch: () => {}, hold: () => {}, bed: () => ({ to: new THREE.Vector3(0, 0, 0.6), yaw: 0 }),
    viewer: () => { looks.push('you'); return viewer; },
    mug: () => mug,
    pushMug: (dz: number, dx: number) => { pushes.push({ what: 'mug', dz }); mug.at.z += dz; mug.at.x += dx; if (mug.at.z >= edge) mug.onSill = false; },
    pencil: () => (withPencil ? pencil : null),
    pushPencil: (dz: number) => { pushes.push({ what: 'pencil', dz }); pencil.at.z += dz; if (pencil.at.z >= edge) pencil.onSill = false; },
  } as unknown as Ctx;
  return { c, m, spot, mug, pushes, looks };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('up on the sill', () => {
  it('turned round to the room with the mug of tea by it: a look at it, a look at you, a pat or two, and over it goes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { c, m, spot, mug, pushes, looks } = sill();
    const act = new Sill(spot);
    act.phase = 'about';
    const steps: string[] = [];
    let wentAt = -1;
    for (let t = 0; t < 25; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      const k = (act as unknown as { knock: { step: string } }).knock.step;
      if (act.phase === 'knock' && steps[steps.length - 1] !== k) steps.push(k);
      if (!mug.onSill && wentAt < 0) wentAt = t;
      if (act.phase === 'look') break;
    }
    // (stepped over to it first, so that it stood before a paw)
    expect(steps[0]).toBe('to');
    expect(steps).toContain('you');
    expect(looks.length).toBeGreaterThan(0);
    // pushed along, a little at a time and then a shove, until over the edge; watched going
    expect(pushes.every((p) => p.what === 'mug')).toBe(true);
    expect(pushes.length).toBeGreaterThanOrEqual(2);
    expect(mug.onSill).toBe(false);
    expect(steps).toContain('watch');
    expect(wentAt).toBeGreaterThan(0);
  });

  it('the pencil by its paws as well: one or the other, never both at once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { c, m, spot, pushes } = sill(true);
    const act = new Sill(spot);
    act.phase = 'about';
    for (let t = 0; t < 25 && act.phase !== 'look'; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
    }
    expect(pushes.length).toBeGreaterThan(0);
    expect(new Set(pushes.map((p) => p.what)).size).toBe(1);
    expect(c.pencil()?.onSill).toBe(true);
  });
});
