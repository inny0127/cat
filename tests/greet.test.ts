import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Beg, Gift, Greet, type Ctx } from '../src/pixel/behave';

/** a cat (its motor) lying in its bed, with only what a hello needs of a room */
function room() {
  const m = new Motor();
  m.snap('loaf');
  const blinks: boolean[] = [];
  const c = {
    m, home: new THREE.Vector3(), window: new THREE.Vector3(0, 0, 0.2),
    room: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, mode: 'rest', mood: { ...NEUTRAL, trust: 0.8 }, kneading: false,
    bed: () => ({ to: new THREE.Vector3(), yaw: 0 }), sound: () => {}, say: () => {},
    viewer: () => new THREE.Vector3(0, 1.4, 3), perch: () => {}, hold: () => {}, bump: () => {},
    blink: (slow: boolean) => blinks.push(slow),
    mouthAt: () => m.pos.clone().setY(0.2),
  } as unknown as Ctx;
  return { c, m, blinks };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('a hello when you come back', () => {
  it('up to the glass, sat there looking at you, a slow blink, and in a while about its business', () => {
    const { c, m, blinks } = room();
    m.pos.set(0.05, 0, -0.1);
    const act = new Greet(0.3), seen = new Set<string>();
    let t = 0, going = true;
    for (; t < 40 && going; t += 0.02) {
      going = act.update(0.02, c);
      m.update(0.02);
      seen.add(act.phase);
    }
    expect(seen.has('come')).toBe(true);
    expect(seen.has('stay')).toBe(true);
    // (sat down at the glass, facing you)
    expect(Math.hypot(m.pos.x - 0, m.pos.z - 0.2)).toBeLessThan(0.08);
    expect(m.targetPosture).toBe('sit');
    expect(blinks[0]).toBe(true);
    expect(going).toBe(false);
  });

  it('fond of you: a head pushed out to you, a cheek along it', () => {
    // (the same dice every run: as glad as can be it nearly always does, and nearly is not a test)
    let seed = 12345;
    vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
    const { c, m } = room();
    m.pos.set(0, 0, 0.18);
    // (as glad as can be: it nearly always does)
    let bumped = 0;
    for (let k = 0; k < 6; k++) {
      const act = new Greet(1), seen = new Set<string>();
      for (let t = 0; t < 12; t += 0.02) {
        act.update(0.02, c);
        m.update(0.02);
        seen.add(act.phase);
      }
      if (seen.has('bump')) bumped++;
    }
    expect(bumped).toBeGreaterThan(2);
  });
});

describe('a present', () => {
  /** a room with a toy mouse in it, which a mouth can carry and let fall */
  function withMouse(at: THREE.Vector3) {
    const r = room();
    const mouse = { p: at.clone(), state: 'floor' as 'floor' | 'mouth' | 'air', moving: false };
    const said: string[] = [];
    Object.assign(r.c, {
      mouse: () => mouse,
      carry: (p: THREE.Vector3 | null) => {
        if (p) { mouse.state = 'mouth'; mouse.p.copy(p); }
        else if (mouse.state === 'mouth') { mouse.state = 'floor'; mouse.p.y = 0; }
      },
      mouthAt: () => r.m.pos.clone().add(new THREE.Vector3(Math.sin(r.m.yaw) * 0.15, 0.1, Math.cos(r.m.yaw) * 0.15)),
      keepClear: (p: THREE.Vector3) => p,
      say: (k: string) => said.push(k),
    });
    return { ...r, mouse, said };
  }

  it('to the toy mouse, up in its mouth, to the glass, let fall there, and a word to you', () => {
    const { c, m, mouse, said } = withMouse(new THREE.Vector3(-0.4, 0, -0.3));
    m.snap('stand');
    const act = new Gift(), seen = new Set<string>();
    let carried = false, going = true;
    for (let t = 0; t < 40 && going; t += 0.02) {
      going = act.update(0.02, c);
      m.update(0.02);
      seen.add(act.phase);
      if (mouse.state === 'mouth') carried = true;
    }
    expect([...seen]).toEqual(expect.arrayContaining(['go', 'take', 'bring', 'drop', 'show']));
    expect(carried).toBe(true);
    // (let fall by the glass, not where it lay)
    expect(mouse.state).toBe('floor');
    expect(Math.hypot(mouse.p.x - c.window.x, mouse.p.z - c.window.z)).toBeLessThan(0.25);
    expect(said.length).toBeGreaterThan(0);
    expect(going).toBe(false);
  });

  it('thrown: after it at a run, and a pounce on it where it came down', () => {
    const { c, m } = withMouse(new THREE.Vector3(0.5, 0, -0.5));
    m.snap('stand');
    const act = new Gift(true), seen = new Set<string>();
    let fastest = 0;
    for (let t = 0; t < 8; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      seen.add(act.phase);
      fastest = Math.max(fastest, m.speed);
    }
    expect(seen.has('pounce')).toBe(true);
    expect(fastest).toBeGreaterThan(0.45);
  });
});

describe('asking at the empty bowl', () => {
  function withBowl() {
    const r = room();
    const said: string[] = [];
    Object.assign(r.c, { say: (k: string) => said.push(k), keepClear: (p: THREE.Vector3) => p });
    return { ...r, said };
  }

  it('over to the bowl, a sniff in it, round to you and sat by it, and a plaintive meow', () => {
    const { c, m, said } = withBowl();
    m.snap('loaf');
    const bowl = new THREE.Vector3(-0.3, 0, -0.45);
    const act = new Beg(bowl, true, () => true), seen = new Set<string>();
    let going = true, t = 0;
    for (; t < 40 && going; t += 0.02) {
      going = act.update(0.02, c);
      m.update(0.02);
      seen.add(act.phase);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['go', 'sniff', 'turn', 'ask']));
    // (sat beside the bowl, near it, facing you: the viewer is toward +z)
    expect(Math.hypot(m.pos.x - bowl.x, m.pos.z - bowl.z)).toBeLessThan(0.35);
    expect(Math.cos(m.yaw)).toBeGreaterThan(0.7);
    expect(m.targetPosture).toBe('sit');
    expect(said).toEqual(['meowPlead']);
    expect(going).toBe(false);
  });

  it('fed meanwhile, it stops at once', () => {
    const { c, m } = withBowl();
    let empty = true;
    const act = new Beg(new THREE.Vector3(-0.3, 0, -0.45), false, () => empty);
    for (let t = 0; t < 1; t += 0.02) { act.update(0.02, c); m.update(0.02); }
    empty = false;
    expect(act.update(0.02, c)).toBe(false);
  });
});

describe('found waiting for you at the glass', () => {
  it('sat there looking out, it sees you: no walk to the glass, straight on to the hello', () => {
    const { c, m, blinks } = room();
    m.snap('sit');
    m.pos.set(0, 0, 0.22);
    const act = new Greet(0.8, true), seen: string[] = [];
    let jolted = false;
    const jolt = m.jolt.bind(m);
    m.jolt = (k?: number) => { jolted = true; jolt(k); };
    for (let t = 0; t < 6; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      if (seen[seen.length - 1] !== act.phase) seen.push(act.phase);
    }
    expect(seen[0]).toBe('see');
    expect(seen).not.toContain('come');
    expect(seen).toContain('sit');
    expect(jolted).toBe(true);
    expect(Math.hypot(m.pos.x, m.pos.z - 0.22)).toBeLessThan(0.02);
    expect(blinks[0]).toBe(true);
  });
});

describe('a nap by you', () => {
  it('as near the glass as it can get, lying down there where it may doze off, then back to bed', async () => {
    const { byYou } = await import('../src/pixel/behave');
    const { c, m } = room();
    Object.assign(c, {
      keepClear: (p: THREE.Vector3) => p,
      lieAt: (_p: string, at: THREE.Vector3, face: number) => ({ to: at.clone(), yaw: face }),
      bed: () => ({ to: new THREE.Vector3(), yaw: 0 }),
    });
    m.snap('loaf');
    const act = byYou(c);
    let t = 0;
    for (; t < 30 && !act.canNap; t += 0.02) { act.update(0.02, c); m.update(0.02); }
    expect(act.canNap).toBe(true);
    // (and down it lies)
    act.update(0.02, c);
    // (in front of the bed, nearer you than the bed's own edge)
    expect(m.pos.z).toBeGreaterThan(0.25);
    expect(['loaf', 'side']).toContain(m.targetPosture);
  });
});
