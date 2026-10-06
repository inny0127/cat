import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { PawGlass, type Ctx, type GlassFinger } from '../src/pixel/behave';

/** a cat (its motor) sat in front of the glass, with only what the game needs of a room */
function room() {
  const m = new Motor();
  m.snap('sit');
  m.pos.set(0, 0, 0.3);
  const said: string[] = [];
  const c = {
    m, home: new THREE.Vector3(), window: new THREE.Vector3(0, 0, 0.3),
    room: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, mode: 'rest', mood: { ...NEUTRAL, trust: 0.8 }, kneading: false,
    keepClear: (p: THREE.Vector3) => p, sound: () => {}, say: (k: string) => said.push(k), viewer: () => new THREE.Vector3(0, 1.4, 3),
    mouthAt: () => m.pos.clone().setY(0.2),
  } as unknown as Ctx;
  return { c, m, said };
}

/** play the game with a finger on the glass (null: lifted) for so long; the paws that met the glass */
function play(act: PawGlass, c: Ctx, m: Motor, finger: (t: number) => GlassFinger | null, secs: number) {
  const landed: string[] = [], phases = new Set<string>();
  let t = 0, going = true;
  for (; t < secs && going; t += 0.02) {
    const f = finger(t);
    (act as unknown as { finger: () => GlassFinger | null }).finger = () => f;
    going = act.update(0.02, c);
    m.update(0.02);
    phases.add(act.phase);
    if (act.landed) landed.push(act.landed);
  }
  return { landed, phases, going, t };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('a finger on the glass', () => {
  it('low down: sat, a paw put to it on its side of the cat, the pads to the glass', () => {
    let seed = 777;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m } = room();
    // (a little to the cat's left: toward screen right while it faces you)
    const at = new THREE.Vector3(0.05, 0.1, 0.5);
    const act = new PawGlass(() => ({ at, still: 0 }));
    const r = play(act, c, m, () => ({ at, still: 0 }), 6);
    expect(r.landed.length).toBeGreaterThan(1);
    expect(new Set(r.landed)).toEqual(new Set(['LF']));
    expect(m.targetPosture).toBe('sit');
  });

  it('high up: stood up on its hind legs, both paws to the glass, a pat with each', () => {
    let seed = 4242;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m } = room();
    const at = new THREE.Vector3(-0.03, 0.38, 0.5);
    const act = new PawGlass(() => ({ at, still: 0 }));
    let hipY = 0;
    const r = play(act, c, m, (t) => { hipY = Math.max(hipY, m.pose.hipY); return t < 5 ? { at, still: 0 } : null; }, 10);
    // (up: the hips well off the floor, both paws on the glass)
    expect(hipY).toBeGreaterThan(0.11);
    expect(new Set(r.landed)).toEqual(new Set(['LF', 'RF']));
    // the finger gone: a look for it, and the game over
    expect(r.phases.has('look')).toBe(true);
    expect(r.going).toBe(false);
  });

  it('as often as not, a sniff at the finger first, before the first pat', () => {
    let sniffed = 0;
    for (const seed0 of [12345, 67890, 13579, 24680, 11111, 99999, 31337, 8675309]) {
      let seed = seed0;
      vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
      const { c, m } = room();
      const at = new THREE.Vector3(0.05, 0.1, 0.5);
      const act = new PawGlass(() => ({ at, still: 0 }));
      let firstPat = -1, firstSniff = -1;
      for (let t = 0; t < 6; t += 0.02) {
        act.update(0.02, c);
        m.update(0.02);
        if (act.landed && firstPat < 0) firstPat = t;
        // (sniffing: leant in, the whiskers forward)
        if ((m.layer?.pose as { whisker?: number } | undefined)?.whisker === 1 && firstSniff < 0) firstSniff = t;
      }
      if (firstSniff >= 0) { sniffed++; expect(firstSniff).toBeLessThan(firstPat); }
      vi.restoreAllMocks();
    }
    expect(sniffed).toBeGreaterThan(1);
    expect(sniffed).toBeLessThan(8);
  });

  it('a finger kept still: a pat or two to see if it would go, then no game in it', () => {
    let seed = 31337;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m } = room();
    // (a cat that does not know you so well yet: no rub of its head on the glass)
    c.mood.trust = 0.4;
    const at = new THREE.Vector3(0.02, 0.12, 0.5);
    const act = new PawGlass(() => ({ at, still: 0 }));
    // (moving for a second, then held still)
    const r = play(act, c, m, (t) => ({ at, still: Math.max(0, t - 1) }), 12);
    expect(r.landed.length).toBeGreaterThan(0);
    expect(r.going).toBe(false);
    expect(r.t).toBeLessThan(8);
  });

  it('a cat that loves you, the finger held still at its head: its cheek rubbed on the finger, then a slow blink', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);
    const { c, m, said } = room();
    const at = new THREE.Vector3(0.03, 0.24, 0.5);
    const act = new PawGlass(() => ({ at, still: 0 }));
    let nuzzles = 0, turn = 0, eyes = 1;
    const phases = new Set<string>();
    for (let t = 0, going = true; t < 14 && going; t += 0.02) {
      const f = { at, still: Math.max(0, t - 1) };
      (act as unknown as { finger: () => GlassFinger | null }).finger = () => f;
      going = act.update(0.02, c);
      m.update(0.02);
      phases.add(act.phase);
      if (act.nuzzled) nuzzles++;
      if (act.phase === 'nuzzle') { turn = Math.max(turn, Math.abs(m.pose.headYaw)); eyes = Math.min(eyes, m.pose.eyeOpen); }
    }
    expect(phases.has('nuzzle')).toBe(true);
    expect(phases.has('blink')).toBe(true);
    expect(nuzzles).toBeGreaterThanOrEqual(2);
    // (the face turned to put the cheek to the finger)
    expect(turn).toBeGreaterThan(0.35);
    expect(eyes).toBeLessThan(0.4);
    // (no pats: it was not a game)
    expect(phases.has('pat')).toBe(false);
    expect(said.length).toBeLessThanOrEqual(1);
  });

  it('asking for a game: to the glass, a word, a pat or two at it, and a while waiting', () => {
    let seed = 2024;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m, said } = room();
    m.pos.set(0.2, 0, 0);
    const act = new PawGlass(() => null, true);
    const r = play(act, c, m, () => null, 20);
    expect(said.length).toBeGreaterThan(0);
    expect(r.landed.length).toBeGreaterThan(0);
    // (sat at the glass, and in a while, nobody coming to play, over)
    expect(Math.hypot(m.pos.x, m.pos.z - 0.3)).toBeLessThan(0.08);
    expect(r.going).toBe(false);
  });

  it('asked, and a finger comes: the game is on', () => {
    let seed = 555;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m } = room();
    const at = new THREE.Vector3(0.05, 0.1, 0.5);
    const act = new PawGlass(() => null, true);
    // (nobody there for its first ask; then a finger low on the glass)
    const r = play(act, c, m, (t) => (t > 4 ? { at, still: 0 } : null), 12);
    expect(r.phases.has('ask')).toBe(true);
    expect(r.phases.has('watch')).toBe(true);
    expect(r.landed.filter((p) => p === 'LF').length).toBeGreaterThan(0);
  });

  it('out of reach where it cannot get any nearer: no to and fro, it pats as far as it can', () => {
    let seed = 99;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m } = room();
    // (something in the way: wherever it would go, it is kept where it is)
    (c as unknown as { keepClear: (p: THREE.Vector3) => THREE.Vector3 }).keepClear = () => new THREE.Vector3(0, 0, 0.3);
    const at = new THREE.Vector3(-0.3, 0.12, 0.5);
    const act = new PawGlass(() => ({ at, still: 0 }));
    const r = play(act, c, m, () => ({ at, still: 0 }), 8);
    expect(r.landed.length).toBeGreaterThan(0);
    expect(new Set(r.landed)).toEqual(new Set(['RF']));
  });
});
