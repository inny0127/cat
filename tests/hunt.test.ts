import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { moveBody, lineClear, groundUnder, type Body, type Box } from '../src/hunt/physics';
import { Cat, type Intent } from '../src/hunt/cat';
import { Prey } from '../src/hunt/prey';
import { CHAIN, GIFT, GOAL, Hunt, NIGHTS, chainMul, nightOpen } from '../src/hunt/game';
import { THINGS } from '../src/hunt/things';

const body = (x: number, y: number, z: number): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, r: 0.12, h: 0.26, grounded: false, landed: 0 });
const run = (b: Body, boxes: Box[], s: number) => { for (let i = 0; i < s * 60; i++) moveBody(b, boxes, 1 / 60); };
const still = (): Intent => ({ move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, jump: false, crouch: false, release: false, listen: false });

describe('밤사냥: a cat among boxes', () => {
  const table: Box = [-0.5, 0.7, -0.5, 0.5, 0.75, 0.5];
  const wall: Box = [1, 0, -2, 1.1, 2.5, 2];
  it('falls to the floor, and comes down on a top', () => {
    const b = body(2, 1, 0);
    run(b, [], 1);
    expect(b.y).toBe(0);
    expect(b.grounded).toBe(true);
    const c = body(0, 1.2, 0);
    run(c, [table], 1);
    expect(c.y).toBeCloseTo(0.75, 3);
    expect(c.grounded).toBe(true);
  });
  it('walks under a table it fits under, and into a wall no further', () => {
    const b = body(-1.5, 0, 0);
    b.grounded = true;
    for (let i = 0; i < 120; i++) { b.vx = 1.5; moveBody(b, [table, wall], 1 / 60); }
    expect(b.x).toBeLessThanOrEqual(1 - 0.12 + 1e-6);
    expect(b.y).toBe(0);
  });
  it('walks up a step no higher than a step, not a ledge', () => {
    const step: Box = [0.5, 0, -1, 2, 0.03, 1], ledge: Box = [0.5, 0, -1, 2, 0.3, 1];
    const b = body(0, 0, 0);
    b.grounded = true;
    for (let i = 0; i < 60; i++) { b.vx = 1; moveBody(b, [step], 1 / 60); }
    expect(b.y).toBeCloseTo(0.03, 3);
    const c = body(0, 0, 0);
    c.grounded = true;
    for (let i = 0; i < 60; i++) { c.vx = 1; moveBody(c, [ledge], 1 / 60); }
    expect(c.y).toBe(0);
    expect(c.x).toBeLessThan(0.5);
  });
  it('a full-tilt pounce at a thin wall, in long frames, never comes out the other side', () => {
    for (const v of [4, 7, 10]) {
      const b = body(0, 0.3, 0);
      for (let i = 0; i < 30; i++) { b.vx = v; moveBody(b, [wall], 1 / 30); }
      expect(b.x).toBeLessThanOrEqual(1 - 0.12 + 1e-6);
    }
  });
  it('sees past nothing solid', () => {
    expect(lineClear(-2, 0.1, 0, 0.8, 0.1, 0, [wall])).toBe(true);
    expect(lineClear(0, 0.1, 0, 2, 0.1, 0, [wall])).toBe(false);
    expect(groundUnder({ x: 0, y: 0.8, z: 0, r: 0.12 }, [table])).toBeCloseTo(0.75);
  });
});

describe('밤사냥: the cat', () => {
  it('springs up onto a top a metre high, but not one twice that', () => {
    const top: Box = [0.3, 0, -0.5, 1.5, 1.0, 0.5], tall: Box = [0.3, 0, -0.5, 1.5, 2.0, 0.5];
    for (const [box, up] of [[top, true], [tall, false]] as const) {
      const c = new Cat();
      c.place(0, 0, 0, Math.PI / 2);
      const I = still();
      I.move.y = 0.8;
      I.jump = true;
      c.update(1 / 60, I, [box]);
      I.jump = false;
      let stood = 0;
      for (let i = 0; i < 90; i++) {
        c.update(1 / 60, I, [box]);
        if (c.body.grounded) stood = Math.max(stood, c.body.y);
      }
      expect(stood > 0.9).toBe(up);
    }
  });
  it('a pounce goes further the longer the wiggle; a tap is a swat', () => {
    const far = (hold: number) => {
      const c = new Cat();
      c.place(0, 0, 0, 0);
      const I = still();
      I.crouch = true;
      for (let i = 0; i < hold * 60; i++) c.update(1 / 60, I, []);
      I.crouch = false;
      I.release = true;
      c.update(1 / 60, I, []);
      const doing = c.doing;
      I.release = false;
      for (let i = 0; i < 90; i++) c.update(1 / 60, I, []);
      return { z: c.body.z, doing };
    };
    const short = far(0.25), long = far(0.85), tap = far(0.05);
    expect(short.doing).toBe('pounce');
    expect(long.z).toBeGreaterThan(short.z + 0.5);
    expect(tap.doing).toBe('swat');
    expect(tap.z).toBeLessThan(0.05);
  });
  it('creeps near silently, dashes loudly', () => {
    const noise = (m: number) => {
      const c = new Cat();
      c.place(0, 0, 0, 0);
      const I = still();
      I.move.y = m;
      for (let i = 0; i < 60; i++) c.update(1 / 60, I, []);
      return c.noise;
    };
    expect(noise(0.4)).toBeLessThan(0.03);
    expect(noise(1)).toBeGreaterThan(0.5);
  });
});

describe('밤사냥: the hunted', () => {
  const world = () => {
    // (a world of nothing: the floor, a hole, a lamp)
    const at = new THREE.Vector3(3, 0, 0);
    return {
      boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }, { at: new THREE.Vector3(2, 1.5, 2), color: 0, power: 1, reach: 3 }],
      holes: [{ at, out: new THREE.Vector3(-1, 0, 0) }], treats: [new THREE.Vector3(0, 0, 0)], cricketSpots: [new THREE.Vector3(0, 0, 0)],
      grid: { cell: 0.1, cols: 90, rows: 70, free: new Uint8Array(6300).fill(1) },
      cellAt: () => 3200, path: (_a: THREE.Vector3, b: THREE.Vector3) => [b.clone()],
    } as never;
  };
  const sense = (eye: THREE.Vector3, noise: number, speed: number, W: never) => ({ eye, noise, speed, world: W, sound: () => {} });
  it('a cricket does not mind a cat creeping up, and is off at a dashing one', () => {
    const W = world();
    const calm = new Prey('cricket');
    calm.pos.set(0, 0, 0);
    calm.state = 'pause';
    for (let i = 0; i < 60; i++) calm.update(1 / 60, sense(new THREE.Vector3(0.8, 0.2, 0), 0.01, 0.3, W));
    expect(calm.state === 'flee').toBe(false);
    const spooked = new Prey('cricket');
    spooked.pos.set(0, 0, 0);
    spooked.state = 'pause';
    for (let i = 0; i < 60; i++) spooked.update(1 / 60, sense(new THREE.Vector3(0.8, 0.2, 0), 0.9, 2.8, W));
    expect(spooked.state).toBe('flee');
  });
  it('a mouse startled runs for its hole and is gone', () => {
    const W = world();
    const m = new Prey('mouse');
    m.pos.set(1, 0, 0);
    m.state = 'roam';
    for (let i = 0; i < 240; i++) m.update(1 / 60, sense(new THREE.Vector3(0.5, 0.2, 0), 1, 3, W));
    expect(m.state).toBe('hidden');
  });
});

describe('밤사냥: the night', () => {
  it('counts a run of catches up, and lets it go after the gap', () => {
    expect(chainMul(1)).toBe(1);
    expect(chainMul(3)).toBe(2);
    expect(chainMul(9)).toBe(3);
    expect(CHAIN).toBeGreaterThan(5);
    expect(GIFT).toBeGreaterThan(300);
  });
  it('opens each night with a star in the one before', () => {
    expect(nightOpen({ best: {}, stars: {} }, 0)).toBe(true);
    expect(nightOpen({ best: {}, stars: {} }, 1)).toBe(false);
    expect(nightOpen({ best: {}, stars: { [NIGHTS[0].id]: 1 } }, 1)).toBe(true);
    for (const N of NIGHTS) {
      expect(N.stars[0]).toBeLessThan(N.stars[1]);
      expect(N.stars[1]).toBeLessThan(N.stars[2]);
    }
  });
  it('wakes their person with a racket in the bedroom, at a cost', () => {
    const W = { boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [{ at: new THREE.Vector3(3, 0, 0), out: new THREE.Vector3(-1, 0, 0) }], treats: [new THREE.Vector3()], cricketSpots: [new THREE.Vector3()], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(3.6, 0.55, -2.4), r: 1.25 }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) } } as never;
    let woke = 0;
    const h = new Hunt(W, { ...NIGHTS[0], roster: {} }, { caught: () => {}, gift: () => {}, missed: () => {}, stirred: (w) => { if (w) woke++; }, sound: () => {} });
    h.score = 500;
    h.cat.place(2.5, 0, -1.5, 0);
    const I = still();
    I.move.y = 1;
    for (let i = 0; i < 600 && !woke; i++) {
      h.cat.body.x = 2.5;
      h.cat.body.z = -1.5;
      h.step(1 / 60, I);
    }
    expect(woke).toBe(1);
    expect(h.score).toBe(200);
  });
  it('a mug swatted off the table: a crash, points, and the cricket by it gone', () => {
    const table: Box = [-0.5, 0.7, -0.5, 0.5, 0.75, 0.5];
    const W = { boxes: [table], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [{ at: new THREE.Vector3(3, 0, 0), out: new THREE.Vector3(-1, 0, 0) }], treats: [new THREE.Vector3()], cricketSpots: [new THREE.Vector3(0.3, 0, 1.2)], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(9, 0.55, 9), r: 1 }, sleeper: { position: new THREE.Vector3(9, 0.6, 9) }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) }, spots: [{ kind: 'mug', at: new THREE.Vector3(0, 0.75, 0.35) }] } as never;
    const crashed: string[] = [], heard: string[] = [];
    const h = new Hunt(W, { ...NIGHTS[0], roster: { cricket: 1 } }, { goal: () => {}, lightning: () => {}, caught: () => {}, gift: () => {}, missed: () => {}, stirred: () => {}, sound: (n) => heard.push(n), crashed: (t) => crashed.push(t.kind) });
    const cricket = h.prey[0];
    cricket.pos.set(0.3, 0, 1.2);
    cricket.state = 'pause';
    h.cat.place(0, 0.75, 0.1, 0);
    const I = still();
    I.crouch = true;
    h.step(1 / 60, I);
    I.crouch = false;
    I.release = true;
    h.step(1 / 60, I);
    I.release = false;
    for (let i = 0; i < 90; i++) h.step(1 / 60, I);
    expect(crashed).toEqual(['mug']);
    expect(heard).toContain(THINGS.mug.sound);
    expect(h.score).toBeGreaterThanOrEqual(THINGS.mug.pts);
    expect(h.things[0].state).toBe('down');
    expect(cricket.state).toBe('flee');
  });
  it('a mug left be stays put; walked into on its table, it is shoved but not off', () => {
    const table: Box = [-1, 0.7, -1, 1, 0.75, 1];
    const W = { boxes: [table], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [], treats: [], cricketSpots: [], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(9, 0.55, 9), r: 1 }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) }, spots: [{ kind: 'mug', at: new THREE.Vector3(0, 0.75, 0.2) }] } as never;
    const h = new Hunt(W, { ...NIGHTS[0], roster: {} }, { goal: () => {}, lightning: () => {}, caught: () => {}, gift: () => {}, missed: () => {}, stirred: () => {}, sound: () => {}, crashed: () => {} });
    h.cat.place(0, 0.75, -0.5, 0);
    const I = still();
    for (let i = 0; i < 60; i++) h.step(1 / 60, I);
    expect(h.things[0].pos.z).toBeCloseTo(0.2, 5);
    I.move.y = 0.5;
    for (let i = 0; i < 100; i++) h.step(1 / 60, I);
    expect(h.things[0].pos.z).toBeGreaterThan(0.25);
    expect(h.things[0].state === 'down').toBe(false);
    expect(h.knocked).toBe(0);
  });
  it('pays a challenge the moment it is done, and not waking them only at dawn', () => {
    const W = { boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [], treats: [], cricketSpots: [], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(9, 0.55, 9), r: 1 }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) } } as never;
    const paid: number[] = [];
    const night = { ...NIGHTS[1], time: 2, roster: {} };
    const h = new Hunt(W, night, { caught: () => {}, gift: () => {}, missed: () => {}, stirred: () => {}, sound: () => {}, crashed: () => {}, lightning: () => {}, goal: (k) => paid.push(k) });
    h.best = 3;
    h.step(1 / 60, still());
    expect(paid).toEqual([1]);
    expect(h.score).toBe(GOAL);
    for (let i = 0; i < 150 && !h.over; i++) h.step(1 / 60, still());
    expect(h.over).toBe(true);
    expect(paid).toEqual([1, 2]);
    expect(h.goals).toEqual([false, true, true]);
  });
  it('every night has its challenges, each its own words', () => {
    for (const N of NIGHTS) {
      expect(N.goals.length).toBe(3);
      expect(new Set(N.goals.map((g) => g.text)).size).toBe(3);
    }
    expect(new Set(NIGHTS.map((N) => N.id)).size).toBe(NIGHTS.length);
  });
  it('rain on the windows: a trotting cat goes unheard by a cricket that would hear it on a still night', () => {
    const W = { boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [], treats: [], cricketSpots: [new THREE.Vector3()], cellAt: () => -1, path: () => [], grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) } } as never;
    const alert = (hear: number) => {
      const c = new Prey('cricket');
      c.pos.set(0, 0, 0);
      c.state = 'pause';
      // (heard, not seen: from behind a wall of nothing, standing still but loud)
      for (let i = 0; i < 30; i++) c.update(1 / 60, { eye: new THREE.Vector3(1.2, 0.2, 0), noise: 0.35 * hear, speed: 0, world: W, sound: () => {} });
      return c.alert;
    };
    expect(alert(0.45)).toBeLessThan(alert(1) * 0.6);
  });
});
