import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Fish, type Ctx } from '../src/pixel/behave';

afterEach(() => { vi.restoreAllMocks(); });

/** the toy mouse in under the radiator; the cat sent after it, as lucky as asked */
function fishFor(luck: number, helpAt: number | null, seed0: number) {
  let seed = seed0;
  vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new Motor();
  m.snap('stand');
  m.pos.set(-0.1, 0, 0.05);
  const mouse = { p: new THREE.Vector3(0.1, 0, -0.511), state: 'floor' as 'floor' | 'mouth' | 'air', moving: false, under: true };
  const said: string[] = [], sounds: string[] = [];
  let hooked = 0, lookedAtYou = false;
  const viewer = new THREE.Vector3(0, 1.2, 3);
  const c = {
    m, mood: { ...NEUTRAL, trust: 0.8 }, viewer: () => viewer, window: new THREE.Vector3(0, 0, 0.25),
    keepClear: (p: THREE.Vector3) => p, mouse: () => mouse,
    hookMouse: () => { hooked++; mouse.under = false; mouse.p.z = -0.45; mouse.moving = true; },
    carry: (at: THREE.Vector3 | null) => { mouse.state = at ? 'mouth' : 'floor'; },
    mouthAt: () => m.pos.clone().setY(0.1), sound: (n: string) => sounds.push(n), say: (n: string) => said.push(n), blink: () => {},
  } as unknown as Ctx;
  const act = new Fish();
  act.luck = luck;
  const phases: string[] = [];
  let going = true, t = 0, reachPaw = 0;
  for (; t < 60 && going; t += 1 / 30) {
    going = act.update(1 / 30, c);
    m.update(1 / 30);
    if (phases[phases.length - 1] !== act.phase) phases.push(act.phase);
    if (act.phase === 'reach') reachPaw = Math.max(reachPaw, m.pose.LF.z, m.pose.RF.z);
    if (act.phase === 'ask' && m.lookTarget && m.lookTarget.distanceTo(viewer) < 1e-6) lookedAtYou = true;
    if (helpAt !== null && t > helpAt && mouse.under) { mouse.under = false; mouse.p.z = -0.4; mouse.moving = true; }
    if (mouse.moving && Math.random() < 0.05) mouse.moving = false;
  }
  vi.restoreAllMocks();
  return { going, phases, hooked, said, sounds, reachPaw, lookedAtYou, mouse, m, t, out: act.out };
}

describe('the toy mouse under the radiator', () => {
  it('a look in under, a paw in after it (claws on the boards), and out it comes: after it', () => {
    const r = fishFor(1, null, 7);
    expect(r.phases.slice(0, 3)).toEqual(['go', 'peer', 'reach']);
    expect(r.hooked).toBe(1);
    expect(r.reachPaw).toBeGreaterThan(0.2);
    expect(r.sounds).toContain('scrabble');
    // (over: the avatar has it fetched, a Gift)
    expect(r.going).toBe(false);
    expect(r.out).toBe(true);
  });

  it('beaten, it turns round to you and asks; a hand gets it out, and it is after it', () => {
    const r = fishFor(0, 22, 99);
    expect(r.hooked).toBe(0);
    expect(r.phases).toContain('ask');
    expect(r.lookedAtYou).toBe(true);
    expect(r.said.some((w) => /^meow/.test(w))).toBe(true);
    expect(r.mouse.under).toBe(false);
    expect(r.going).toBe(false);
    expect(r.out).toBe(true);
  });

  it('nobody comes: in the end it gives it up', () => {
    const r = fishFor(0, null, 5);
    expect(r.phases[r.phases.length - 1]).toBe('after');
    expect(r.going).toBe(false);
    expect(r.mouse.under).toBe(true);
    expect(r.out).toBe(false);
    expect(r.t).toBeLessThan(40);
  });
});
