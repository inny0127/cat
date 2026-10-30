import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { moveBody, lineClear, groundUnder, type Body, type Box } from '../src/hunt/physics';
import { Cat, type Intent } from '../src/hunt/cat';
import { Prey } from '../src/hunt/prey';
import { CHAIN, GIFT, GOAL, Hunt, NIGHTS, chainMul, nightOpen, today } from '../src/hunt/game';
import { THINGS } from '../src/hunt/things';
import { COATS, allStars, coatOf } from '../src/hunt/coats';
import { BADGES, reckon } from '../src/hunt/journal';

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
  it('a spider let down on its thread is up and away from a cat bounding at it, and back down later', () => {
    const W = world();
    const sp = new Prey('spider');
    sp.spawn(W);
    for (let i = 0; i < 300; i++) sp.update(1 / 60, sense(new THREE.Vector3(3, 0.2, 3), 0, 0, W));
    expect(sp.state).toBe('roam');
    expect(sp.pos.y).toBeLessThan(1.2);
    const low = sp.pos.y;
    for (let i = 0; i < 240; i++) sp.update(1 / 60, sense(sp.pos.clone().add(new THREE.Vector3(0.5, -low + 0.2, 0)), 1, 3, W));
    expect(sp.state).toBe('hidden');
    expect(sp.mesh.visible).toBe(false);
    for (let i = 0; i < 60 * 20; i++) sp.update(1 / 60, sense(new THREE.Vector3(3, 0.2, 3), 0, 0, W));
    expect(sp.mesh.visible).toBe(true);
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
    // (sitting up, dropping off again: the same racket a few seconds on does not wake them again)
    for (let i = 0; i < 6 * 60; i++) {
      h.cat.body.x = 2.5;
      h.cat.body.z = -1.5;
      h.step(1 / 60, I);
    }
    expect(woke).toBe(1);
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
  it('a pounce a little off its mark is bent onto it; one well off is not', () => {
    const W = { boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [{ at: new THREE.Vector3(3, 0, 3), out: new THREE.Vector3(-1, 0, 0) }], treats: [new THREE.Vector3()], cricketSpots: [new THREE.Vector3()], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(9, 0.55, 9), r: 1 }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) } } as never;
    const pounceAt = (x: number, z: number) => {
      let got = 0;
      const h = new Hunt(W, { ...NIGHTS[0], roster: { cricket: 1 } }, { crashed: () => {}, goal: () => {}, lightning: () => {}, caught: () => { got++; }, gift: () => {}, missed: () => {}, stirred: () => {}, sound: () => {} });
      const c = h.prey[0];
      h.cat.place(0, 0, 0, 0);
      const I = still();
      I.crouch = true;
      for (let i = 0; i < 30; i++) { c.pos.set(x, 0, z); c.state = 'pause'; c.alert = 0; h.step(1 / 60, I); }
      I.crouch = false;
      I.release = true;
      h.step(1 / 60, I);
      I.release = false;
      for (let i = 0; i < 60; i++) { if (c.state !== 'held' && c.mesh.visible) { c.pos.set(x, 0, z); c.state = 'pause'; c.alert = 0; } h.step(1 / 60, I); }
      return got;
    };
    expect(pounceAt(0.45, 1.5)).toBe(1);
    expect(pounceAt(1.4, 1.0)).toBe(0);
  });
  it('coats are earned with stars, all nights together; one not yet earned is not worn', () => {
    expect(COATS[0].stars).toBe(0);
    for (let i = 1; i < COATS.length; i++) expect(COATS[i].stars).toBeGreaterThan(COATS[i - 1].stars);
    expect(COATS[COATS.length - 1].stars).toBeLessThanOrEqual(NIGHTS.length * 3);
    const save = { best: {}, stars: { first: 3, mice: 2 }, coat: 'tuxedo' };
    expect(allStars(save)).toBe(5);
    expect(coatOf(save).id).toBe('ginger');
    expect(coatOf({ ...save, coat: 'black' }).id).toBe('black');
  });
  it('the night of the day: the same all day, another the next, and open after the first night', () => {
    const a = today(new Date(2026, 9, 30, 1)), b = today(new Date(2026, 9, 30, 23)), c = today(new Date(2026, 9, 31, 12));
    expect(a.id).toBe(b.id);
    expect(a.blurb).toBe(b.blurb);
    expect(a.goals.map((g) => g.text)).toEqual(b.goals.map((g) => g.text));
    expect(c.id).not.toBe(a.id);
    const days = Array.from({ length: 40 }, (_, k) => today(new Date(2026, 0, 1 + k)));
    for (const N of days) {
      expect(N.goals.length).toBe(3);
      expect(new Set(N.goals.map((g) => g.text)).size).toBe(3);
      expect(N.stars[0]).toBeLessThan(N.stars[1]);
      expect(N.stars[1]).toBeLessThan(N.stars[2]);
    }
    // (not every day alike)
    expect(new Set(days.map((N) => N.blurb.split(' · ').slice(1).join())).size).toBeGreaterThan(20);
    expect(nightOpen({ best: {}, stars: {} }, -1)).toBe(false);
    expect(nightOpen({ best: {}, stars: { first: 1 } }, -1)).toBe(true);
    expect(allStars({ best: {}, stars: { first: 2, [a.id]: 3 } })).toBe(2);
  });
  it('the journal adds each night in, and gives each badge once, when earned', () => {
    const save = { best: {}, stars: { first: 3 } } as Parameters<typeof reckon>[0];
    let fresh = reckon(save, { moth: 4, cricket: 2, mouse: 0, spider: 0, gifts: 0, knocked: 1 }, { stars: 3, wakes: 0, best: 5 });
    expect(fresh).toEqual(['첫 사냥', '연속 사냥', '쉿, 완벽한 밤']);
    expect(save.totals).toMatchObject({ moth: 4, cricket: 2, nights: 1, bestChain: 5 });
    fresh = reckon(save, { moth: 6, cricket: 0, mouse: 0, spider: 0, gifts: 0, knocked: 0 }, { stars: 1, wakes: 2, best: 2 });
    expect(fresh).toEqual(['불나방 사냥꾼']);
    expect(save.totals).toMatchObject({ moth: 10, nights: 2, bestChain: 5 });
    expect(save.badges).toHaveLength(4);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
  it('the endless night: no dawn, more out every half minute, over at the third waking', () => {
    const W = { boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [{ at: new THREE.Vector3(3, 0, 0), out: new THREE.Vector3(-1, 0, 0) }], treats: [new THREE.Vector3()], cricketSpots: [new THREE.Vector3()], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(3.6, 0.55, -2.4), r: 1.25 }, sleeper: { position: new THREE.Vector3(3.6, 0.6, -3) }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) } } as never;
    const N = NIGHTS.find((n) => n.endless)!;
    let out = 0;
    const h = new Hunt(W, { ...N, roster: {} }, { spawned: () => { out++; }, crashed: () => {}, goal: () => {}, lightning: () => {}, caught: () => {}, gift: () => {}, missed: () => {}, stirred: () => {}, sound: () => {} });
    const I = still();
    for (let i = 0; i < 65 * 30; i++) h.step(1 / 30, I);
    expect(h.over).toBe(false);
    expect(out).toBe(2);
    expect(h.prey).toHaveLength(2);
    expect(h.clock).toContain('♥♥♥ 1:0');
    // (a racket by the bed, on and on: three wakings, and it is over)
    I.move.y = 1;
    for (let i = 0; i < 60 * 30 && !h.over; i++) {
      h.cat.body.x = 2.5;
      h.cat.body.z = -1.5;
      h.step(1 / 30, I);
    }
    expect(h.over).toBe(true);
    expect(h.wakes).toBe(3);
  });
  it('a treasure hidden for the night, one not kept yet; found by going right up to it, once', () => {
    const W = { boxes: [], lamps: [{ at: new THREE.Vector3(0, 1.5, 0), color: 0, power: 1, reach: 3 }], holes: [], treats: [], cricketSpots: [], cellAt: () => -1, path: () => [], bed: { at: new THREE.Vector3(9, 0.55, 9), r: 1 }, grid: { cell: 0.1, cols: 1, rows: 1, free: new Uint8Array(1) }, spots: [] } as never;
    const found: string[] = [];
    const kept = ['cap', 'tie', 'fluff', 'bell', 'feather', 'band', 'pencap'];
    const h = new Hunt(W, { ...NIGHTS[0], roster: {} }, { found: (t) => found.push(t.id), spawned: () => {}, crashed: () => {}, goal: () => {}, lightning: () => {}, caught: () => {}, gift: () => {}, missed: () => {}, stirred: () => {}, sound: () => {} }, kept);
    expect(h.toy?.id).toBe('sock');
    const at = h.toy!.at;
    h.cat.place(at.x + 1, at.y, at.z, 0);
    h.step(1 / 60, still());
    expect(found).toEqual([]);
    for (let i = 0; i < 3; i++) { h.cat.place(at.x, at.y, at.z, 0); h.step(1 / 60, still()); }
    expect(found).toEqual(['sock']);
    expect(h.score).toBeGreaterThanOrEqual(300);
  });
});
