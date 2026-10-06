import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Wrestle, type Ctx } from '../src/pixel/behave';

afterEach(() => { vi.restoreAllMocks(); });

/** the cat (standing by its bed, facing you) and its toy mouse lying somewhere; a tussle with it,
 *  start to end: the phases it went through, what came of the mouse, how it lay */
function tussle(mx: number, mz: number, seed0: number) {
  let seed = seed0;
  vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new Motor();
  m.snap('stand');
  m.pos.set(0.3, 0, 0);
  const home = new THREE.Vector3(0, 0, 0);
  const mouse = { p: new THREE.Vector3(mx, 0, mz), state: 'floor' as 'floor' | 'mouth' | 'air', moving: false, under: false };
  let carried = 0, kicked = 0, dropped = 0, inMouth = 0;
  const heldAt: THREE.Vector3[] = [];
  const fwd = () => new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
  const c = {
    m, home, mood: { ...NEUTRAL, arousal: 0.7, trust: 0.6 }, temper: { bold: 0, playful: 0, lazy: 0, curious: 0 },
    viewer: () => new THREE.Vector3(0, 1.4, 3), keepClear: (p: THREE.Vector3) => p, clear: () => true, sound: () => {},
    mouse: () => mouse,
    mouthAt: () => m.pos.clone().addScaledVector(fwd(), 0.17).setY(0.12),
    carry: (at: THREE.Vector3 | null) => {
      if (at) { mouse.state = 'mouth'; mouse.p.copy(at); carried++; if (m.posture === 'side') heldAt.push(at.clone()); else inMouth++; }
      else if (mouse.state === 'mouth') { mouse.state = 'floor'; mouse.p.y = 0; dropped++; }
    },
    kickMouse: (dir: THREE.Vector3, speed: number) => {
      mouse.state = 'floor';
      mouse.p.addScaledVector(dir.clone().setY(0).normalize(), 0.25 * speed).setY(0);
      kicked++;
    },
  } as unknown as Ctx;
  const act = new Wrestle();
  const phases: string[] = [];
  let going = true, t = 0, sideFor = 0, kickReach = 0;
  for (; t < 60 && going; t += 1 / 30) {
    going = act.update(1 / 30, c);
    m.update(1 / 30);
    if (phases[phases.length - 1] !== act.phase) phases.push(act.phase);
    if (m.posture === 'side' && act.phase === 'hug') {
      sideFor += 1 / 30;
      kickReach = Math.max(kickReach, m.pose.LH.z, m.pose.RH.z);
    }
  }
  vi.restoreAllMocks();
  return { going, phases, carried, kicked, dropped, inMouth, heldAt, sideFor, kickReach, mouse, m, t };
}

describe('a tussle with its toy mouse', () => {
  it('lying out in the open by its bed: down low, a hop onto it, over on its side with it, hugged and kicked, then sent off', () => {
    const r = tussle(0.02, 0.02, 11);
    expect(r.phases.slice(0, 4)).toEqual(['go', 'crouch', 'pounce', 'hug']);
    expect(r.phases).toContain('let');
    expect(r.phases).toContain('look');
    // (held all the while it was on its side with it, a good few seconds of it)
    expect(r.sideFor).toBeGreaterThan(2.5);
    expect(r.heldAt.length).toBeGreaterThan(60);
    // (the hind feet come up at it, raking: well forward of where they lie)
    expect(r.kickReach).toBeGreaterThan(-0.12);
    // (and in the end let go of it, kicked off or dropped)
    expect(r.kicked + r.dropped).toBeGreaterThan(0);
    expect(r.going).toBe(false);
  });

  it('lying out in front, toward you: taken up in its mouth and carried back by its bed first', () => {
    const r = tussle(-0.1, 0.5, 7);
    expect(r.phases.slice(0, 4)).toEqual(['go', 'take', 'bring', 'drop']);
    expect(r.inMouth).toBeGreaterThan(10);
    expect(r.phases).toContain('hug');
    // (where it had it out with it: back by its bed, not out in front)
    const first = r.heldAt[0];
    expect(first.z).toBeLessThan(0.3);
  });
});
