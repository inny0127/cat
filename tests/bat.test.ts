import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Play, type Ctx } from '../src/pixel/behave';

afterEach(() => { vi.restoreAllMocks(); });

/** a ball on a finger, moved round and round the cat near enough to swipe at, quick and slow by
 *  turns: the most it turned (rad/s) while a forepaw was up swiping, and how many swipes */
function game(seed0: number) {
  let seed = seed0;
  vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new Motor();
  m.snap('crouch');
  const ball = new THREE.Vector3(0, 0, 0.22);
  const c = new Proxy({
    m, mood: { ...NEUTRAL, arousal: 0.8, trust: 0.6 }, home: new THREE.Vector3(0, 0, -0.4), mode: 'alert',
    yarn: () => ball, toyHeld: () => true, toyPinned: () => false, kick: () => {}, pin: () => {},
    keepClear: (p: THREE.Vector3) => p, sound: () => {}, say: () => {}, gaze: () => null,
  } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : undefined) }) as unknown as Ctx;
  const act = new Play();
  let most = 0, swipes = 0, was = '', yaw = m.yaw;
  for (let t = 0; t < 30; t += 1 / 60) {
    // (round it, now quick, now slow, near and a little further)
    const a = 1.3 * t + 0.9 * Math.sin(t * 0.7), r = 0.2 + 0.05 * Math.sin(t * 1.3);
    ball.set(m.pos.x + r * Math.sin(a), 0, m.pos.z + r * Math.cos(a));
    act.update(1 / 60, c);
    m.update(1 / 60);
    const phase = (act as unknown as { phase: string }).phase;
    if (phase === 'bat' && was !== 'bat') swipes++;
    if (phase === 'bat') most = Math.max(most, Math.abs(Math.atan2(Math.sin(m.yaw - yaw), Math.cos(m.yaw - yaw))) * 60);
    was = phase;
    yaw = m.yaw;
  }
  vi.restoreAllMocks();
  return { most, swipes };
}

describe('swiping at a ball', () => {
  it('a forepaw up at it, the body does not pivot round over the other: round to it first, low', () => {
    let swipes = 0;
    for (const seed of [3, 17, 29]) {
      const g = game(seed);
      swipes += g.swipes;
      expect(g.most).toBeLessThan(0.6);
    }
    // (and it does swipe at it)
    expect(swipes).toBeGreaterThan(2);
  });
});
