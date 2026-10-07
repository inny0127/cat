import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Chase, type LaserDot } from '../src/pixel/chase';
import { Tease, type Lure } from '../src/pixel/tease';
import type { Act, Ctx } from '../src/pixel/behave';

/** a cat (its motor) sitting at the middle of an empty floor, facing +z, with only what the
 *  laser and the wand need of a room */
function room() {
  const m = new Motor();
  m.snap('sit');
  const calls = { pushes: [] as number[], pin: 0, bat: 0, sounds: [] as string[] };
  const world = { dot: null as LaserDot | null, lure: null as Lure | null, mug: null as { at: THREE.Vector3; onSill: boolean } | null };
  const c = {
    m, home: new THREE.Vector3(), window: new THREE.Vector3(0, 0, 0.2),
    room: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, mode: 'alert', mood: { ...NEUTRAL }, kneading: false,
    bed: () => ({ to: new THREE.Vector3(), yaw: 0 }), sill: () => null, box: () => null,
    sound: (n: string) => calls.sounds.push(n), say: () => {},
    laser: () => world.dot, gaze: () => null, keepClear: (p: THREE.Vector3) => p, detour: () => null,
    books: () => new THREE.Vector3(0.6, 0, 0.6),
    lure: () => world.lure, batLure: () => { calls.bat++; }, pinLure: () => { calls.pin++; },
    pencil: () => null, pushPencil: () => {}, mug: () => world.mug, pushMug: (dz: number) => { calls.pushes.push(dz); if (world.mug) world.mug.at.z += dz; },
    viewer: () => new THREE.Vector3(0, 1.4, 3), perch: () => {}, hold: () => {},
    bump: () => {},
  } as unknown as Ctx;
  return { c, m, calls, world };
}

/** run an act for a while (the motor moving the body as it goes), noting the phases it goes
 *  through; false if it ended */
function run(act: Act, c: Ctx, m: Motor, secs: number, seen: Set<string>, each?: (t: number) => void) {
  for (let t = 0; t < secs; t += 0.02) {
    each?.(t);
    if (!act.update(0.02, c)) return false;
    m.update(0.02);
    seen.add((act as unknown as { phase: string }).phase);
  }
  return true;
}

const floorDot = (x: number, z: number): LaserDot => ({ p: new THREE.Vector3(x, 0, z), on: 'floor', n: new THREE.Vector3(0, 1, 0) });

describe('the red dot of a laser pointer', () => {
  it('still on the floor in front of it: crept up on, pounced on, and held under the paws', () => {
    const { c, m, world } = room();
    world.dot = floorDot(0, 0.45);
    const act = new Chase(c), seen = new Set<string>();
    run(act, c, m, 6, seen);
    expect(seen.has('pounce')).toBe(true);
    expect(seen.has('hold')).toBe(true);
    // (and it has come up to it)
    expect(m.pos.z).toBeGreaterThan(0.1);
  });

  it('darting off across the room: run after, flat out', () => {
    const { c, m, world } = room();
    const act = new Chase(c), seen = new Set<string>();
    let fastest = 0;
    run(act, c, m, 3, seen, (t) => {
      world.dot = floorDot(-0.2 + t * 0.6, 0.9);
      fastest = Math.max(fastest, m.speed);
    });
    expect(seen.has('run')).toBe(true);
    expect(fastest).toBeGreaterThan(0.6);
  });

  it('crouched to spring, the dot darted off and straight back: still crouched, not up and down again', () => {
    const { c, m, world } = room();
    world.dot = floorDot(0, 0.3);
    const act = new Chase(c), seen = new Set<string>();
    const phase = () => (act as unknown as { phase: string }).phase;
    // (till it is down in the wiggle before the spring)
    for (let t = 0; t < 3 && phase() !== 'wiggle'; t += 0.02) { act.update(0.02, c); m.update(0.02); }
    expect(phase()).toBe('wiggle');
    // (a flick of the finger: off across the floor a tenth of a second, and back; it springs at it
    // or stays down for it, but it does not get up to go after it)
    const during = new Set<string>();
    run(act, c, m, 0.4, during, (t) => {
      world.dot = t < 0.1 ? floorDot(0.7, 0.9) : floorDot(0, 0.3);
    });
    expect(during.has('run')).toBe(false);
    expect(during.has('stalk')).toBe(false);
    // (but gone off and staying off, it is after it)
    world.dot = floorDot(0.8, 1.0);
    const after = new Set<string>();
    run(act, c, m, 1.5, after);
    expect(after.has('run') || after.has('stalk')).toBe(true);
  });

  it('gone: looked for (and you looked at), and in the end given up on', () => {
    const { c, m, world } = room();
    world.dot = floorDot(0, 0.6);
    const act = new Chase(c), seen = new Set<string>();
    run(act, c, m, 1, seen);
    world.dot = null;
    const going = run(act, c, m, 25, seen);
    expect(seen.has('search')).toBe(true);
    expect(going).toBe(false);
  });

  it('on the books: pounced on there', () => {
    const { c, m, world } = room();
    const books = c.books();
    m.pos.set(books.x - 0.5, 0, books.z);
    world.dot = { p: new THREE.Vector3(books.x, 0.12, books.z), on: 'books', n: new THREE.Vector3(-1, 0, 0) };
    const act = new Chase(c), seen = new Set<string>();
    run(act, c, m, 8, seen);
    expect(seen.has('pounce')).toBe(true);
  });

  it('up on the sill after it: the mug of tea in the way there is knocked over the edge', () => {
    const { c, m, world, calls } = room();
    const sill = { launch: new THREE.Vector3(0, 0, 0.5), seat: new THREE.Vector3(0, 0, 0.14), land: new THREE.Vector3(0.03, 0, 0.52), height: 0.36 };
    (c as unknown as { sill: () => typeof sill }).sill = () => sill;
    world.mug = { at: new THREE.Vector3(-0.08, 0.36, 0.19), onSill: true };
    world.dot = { p: new THREE.Vector3(-0.06, 0.36, 0.15), on: 'sill', n: new THREE.Vector3(0, 1, 0) };
    const act = new Chase(c), seen = new Set<string>();
    run(act, c, m, 8, seen);
    expect(seen.has('up')).toBe(true);
    expect(calls.pushes.length).toBeGreaterThan(0);
  });

  it('up the wall within reach: reared up to; out of reach: leapt at', () => {
    const low = room(), high = room();
    const wall = (y: number): LaserDot => ({ p: new THREE.Vector3(0, y, 0.8), on: 'up', n: new THREE.Vector3(0, 0, -1) });
    low.world.dot = wall(0.25);
    high.world.dot = wall(0.6);
    const a = new Chase(low.c), b = new Chase(high.c), sa = new Set<string>(), sb = new Set<string>();
    run(a, low.c, low.m, 5, sa);
    run(b, high.c, high.m, 6, sb);
    expect(sa.has('rear')).toBe(true);
    expect(sb.has('leap')).toBe(true);
  });

  it('round something in the way and on to it, not round and round the way round', () => {
    const { c, m, world } = room();
    m.pos.set(0.47, 0, -0.09);
    m.yaw = 2.5;
    // (a way round close by and off to the side, as a table leg would give)
    let asked = 0;
    (c as unknown as { detour: () => THREE.Vector3 | null }).detour = () => (asked++ === 0 ? new THREE.Vector3(0.37, 0, -0.06) : null);
    world.dot = { p: new THREE.Vector3(0.2, 0.25, -0.4), on: 'up', n: new THREE.Vector3(0, 0, 1) };
    const act = new Chase(c), seen = new Set<string>();
    for (let t = 0; t < 6 && !seen.has('rear'); t += 0.025) {
      act.update(0.025, c);
      m.update(0.025);
      seen.add(act.phase);
    }
    expect(seen.has('rear')).toBe(true);
  });

  it('on its own tail: round and round after it, and then a lick at the spot', () => {
    const { c, m, world } = room();
    world.dot = { p: new THREE.Vector3(0, 0, -0.3), on: 'floor', n: new THREE.Vector3(0, 1, 0), self: 'rear', selfAt: new THREE.Vector3(0.03, 0.12, -0.2) };
    const act = new Chase(c), seen = new Set<string>();
    let turned = 0, last = m.yaw;
    for (let t = 0; t < 3; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      seen.add(act.phase);
      turned += Math.abs(Math.atan2(Math.sin(m.yaw - last), Math.cos(m.yaw - last)));
      last = m.yaw;
      // (spun round, the dot is off it, on the floor)
      if (act.phase === 'self') world.dot = { ...world.dot!, self: undefined };
    }
    expect(seen.has('self')).toBe(true);
    expect(turned).toBeGreaterThan(Math.PI * 1.5);
  });

  it('after long enough, it has had enough: down on its chest, only watching', () => {
    const { c, m, world } = room();
    world.dot = floorDot(0.1, 0.5);
    const act = new Chase(c), seen = new Set<string>();
    (act as unknown as { total: number }).total = 1e4;
    run(act, c, m, 3, seen);
    expect(act.tired).toBe(true);
    expect(seen.has('tired')).toBe(true);
    expect(m.targetPosture).toBe('sphinx');
  });
});

describe('the feather wand', () => {
  const lure = (x: number, y: number, z: number, v = 0.3): Lure => ({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(v, 0, 0), held: true, pinned: false });

  it('dangled in reach: a swipe of a paw at it, and it goes swinging', () => {
    const { c, m, world, calls } = room();
    world.lure = lure(0.02, 0.2, 0.2);
    const act = new Tease(), seen = new Set<string>();
    run(act, c, m, 3, seen);
    expect(seen.has('swat')).toBe(true);
    expect(calls.bat + calls.pin).toBeGreaterThan(0);
  });

  it('dragged over the floor: pounced on and held down', () => {
    const { c, m, world, calls } = room();
    const act = new Tease(), seen = new Set<string>();
    run(act, c, m, 6, seen, (t) => {
      // (once the paws have them, they stay put)
      if (calls.pin) { world.lure = { ...world.lure!, pinned: true, v: new THREE.Vector3() }; return; }
      world.lure = lure(0.03 * Math.sin(t * 3), 0.012, 0.42, 0.1);
    });
    expect(seen.has('pounce')).toBe(true);
    expect(calls.pin).toBeGreaterThan(0);
    expect(seen.has('pin')).toBe(true);
  });

  it('lying on the floor, nobody playing: gone to, pounced on, and in a while left', () => {
    const { c, m, world } = room();
    // (the feathers lie where they are: a paw on them lets go of them at once)
    world.lure = { p: new THREE.Vector3(0.1, 0.012, 0.7), v: new THREE.Vector3(), held: false, pinned: false };
    const act = new Tease(true), seen = new Set<string>();
    const ended = !run(act, c, m, 40, seen);
    expect(seen.has('go')).toBe(true);
    expect(seen.has('pounce')).toBe(true);
    expect(ended).toBe(true);
  });

  it('held up high over it: leapt at', () => {
    const { c, m, world } = room();
    world.lure = lure(0, 0.6, 0.15);
    const act = new Tease(), seen = new Set<string>();
    run(act, c, m, 4, seen);
    expect(seen.has('leap')).toBe(true);
  });
});
