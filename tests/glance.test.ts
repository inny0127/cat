import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { canGlance, groomFlank, scratchEar, type Ctx } from '../src/pixel/behave';

const ctx = (m: Motor) => ({ m, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx);

/** how long the act goes on, looked up from (for s) at 1.5 s in or not */
function lasts(make: () => ReturnType<typeof groomFlank>, look: number) {
  const m = new Motor();
  m.snap('sit');
  const c = ctx(m);
  const act = make();
  let t = 0, during = 1, before = 0;
  for (; t < 30; t += 1 / 60) {
    if (Math.abs(t - 1.5) < 1e-6 || (t > 1.5 && t - 1 / 60 < 1.5)) {
      before = m.layer?.w ?? 0;
      if (look && canGlance(act)) act.glance(look);
    }
    if (!act.update(1 / 60, c)) break;
    if (look && t > 1.5 + 0.4 && t < 1.5 + look - 0.1) during = Math.min(during, (m.layer?.w ?? 0) / Math.max(1e-6, before));
  }
  return { t, during };
}

describe('looking up from its coat', () => {
  it('a wash of the flank lets go while it looks, stops its own time, and carries on after', () => {
    const r = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const plain = lasts(groomFlank, 0);
    const looked = lasts(groomFlank, 1.5);
    r.mockRestore();
    expect(looked.during).toBeLessThan(0.35);
    // (and goes on about as much longer as it looked up for)
    expect(looked.t - plain.t).toBeGreaterThan(1.2);
    expect(looked.t - plain.t).toBeLessThan(2.2);
  });

  it('a scratch keeps the foot up while it looks', () => {
    const r = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const m = new Motor();
    m.snap('sit');
    const c = ctx(m);
    const act = scratchEar();
    expect(canGlance(act)).toBe(true);
    // (into the sit, settled, and the foot up)
    const step = () => { act.update(1 / 60, c); m.update(1 / 60); };
    for (let i = 0; i < 90; i++) step();
    const full = m.layer!.w;
    act.glance(1.2);
    for (let i = 0; i < 40; i++) step();
    expect(full).toBeGreaterThan(0.95);
    r.mockRestore();
    expect(m.layer!.w).toBeGreaterThan(0.45);
    expect(m.layer!.w).toBeLessThan(0.75);
  });
});
