import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { washFace, type Ctx } from '../src/pixel/behave';

const ctx = (m: Motor) => ({ m, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx);

describe('a paw is never in two places a frame apart', () => {
  it('a face wash: the paw up once, wiped and licked, and down once, a side at a time', () => {
    for (const r of [0.1, 0.5, 0.9]) {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
      const m = new Motor();
      m.snap('sit');
      const c = ctx(m);
      const act = washFace();
      rnd.mockRestore();
      let most = 0, ups = 0, up = false;
      const was = { LF: m.pose.LF.y, RF: m.pose.RF.y };
      for (let i = 0; i < 60 * 30; i++) {
        const on = act.update(1 / 60, c);
        m.update(1 / 60);
        for (const l of ['LF', 'RF'] as const) {
          most = Math.max(most, Math.abs(m.pose[l].y - was[l]));
          was[l] = m.pose[l].y;
        }
        // (a paw counted up when it is well off the floor)
        const now = Math.max(m.pose.LF.y, m.pose.RF.y) > 0.1;
        if (now && !up) ups++;
        up = now;
        if (!on) break;
      }
      // (a wipe is quick, but not 15 cm in a frame)
      expect(most).toBeLessThan(0.025);
      expect(ups).toBeGreaterThanOrEqual(1);
      expect(ups).toBeLessThanOrEqual(2);
    }
  });

  it('a layer let go of all at once goes out over a moment', () => {
    const m = new Motor();
    m.snap('sit');
    m.layer = { pose: { LF: { planted: 0, frame: 0, x: 0.012, y: 0.21, z: 0.135, flex: 0.85 } }, w: 1 };
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.pose.LF.y).toBeGreaterThan(0.2);
    m.layer = null;
    m.update(1 / 60);
    expect(m.pose.LF.y).toBeGreaterThan(0.18);
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.pose.LF.y).toBeLessThan(0.02);
    // (and a snap into a posture is a snap)
    m.layer = { pose: { LF: { planted: 0, frame: 0, x: 0.012, y: 0.21, z: 0.135, flex: 0.85 } }, w: 1 };
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    m.layer = null;
    m.snap('sit');
    m.update(1 / 60);
    expect(m.pose.LF.y).toBeLessThan(0.02);
  });
});
