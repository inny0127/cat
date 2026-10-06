import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Crab, type Ctx } from '../src/pixel/behave';

afterEach(() => { vi.restoreAllMocks(); });

describe('the crab hop', () => {
  it('side on to you, the back humped up, it bounces sideways at you, all four feet off the floor, then sits', () => {
    let seed = 5;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const m = new Motor();
    m.snap('stand');
    m.pos.set(0.3, 0, -0.1);
    const you = new THREE.Vector3(0.3, 0, 1.2);
    const c = {
      m, home: new THREE.Vector3(0, 0, 0), mood: { ...NEUTRAL, arousal: 0.8, trust: 0.7 },
      viewer: () => new THREE.Vector3(0, 1.4, 3), keepClear: (p: THREE.Vector3) => p, sound: () => {}, say: () => {},
    } as unknown as Ctx;
    const act = new Crab(you);
    let going = true, t = 0, sideOn = 0, hump = 0, offFloor = 0;
    const z0 = m.pos.z;
    for (; t < 10 && going; t += 1 / 60) {
      going = act.update(1 / 60, c);
      m.update(1 / 60);
      if (act.phase === 'hop') {
        // (its side to you: facing across, not at you nor away)
        sideOn = Math.max(sideOn, Math.abs(Math.sin(m.yaw)));
        hump = Math.max(hump, m.pose.hipPitch - m.pose.chestPitch);
        if (m.pose.LF.y > 0.03 && m.pose.RF.y > 0.03 && m.pose.LH.y > 0.03 && m.pose.RH.y > 0.03) offFloor++;
      }
    }
    vi.restoreAllMocks();
    expect(going).toBe(false);
    expect(sideOn).toBeGreaterThan(0.97);
    expect(hump).toBeGreaterThan(0.6);
    expect(offFloor).toBeGreaterThan(5);
    // (and nearer you by the hops, sat at the end of them)
    expect(m.pos.z - z0).toBeGreaterThan(0.09);
    expect(m.targetPosture).toBe('sit');
  });
});
