import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Soundscape, type Heard } from '../src/pixel/soundscape';
import { Ears } from '../src/pixel/ears';

const WINDOW = new THREE.Vector3(0, 1.1, -1.4);
const RADIATOR = new THREE.Vector3(0, 0.3, -0.5);

/** an hour (or `secs`) of the place's sounds at an hour of a day of the year: how many of each,
 *  and what a cat's ears made of them (flicks, and looks that way) */
function listen(hour: number, month: number, secs = 3600, rain = 0, seed = 7) {
  // (the same hour each run: the place's sounds come at no set pace, and an hour of them is a
  // throw of the dice)
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    return hear(hour, month, secs, rain);
  } finally { Math.random = rnd; }
}
function hear(hour: number, month: number, secs: number, rain: number) {
  const S = new Soundscape({ window: WINDOW, radiator: RADIATOR }), E = new Ears();
  const day = hour > 6 && hour < 19 ? 1 : 0;
  const n: Record<string, number> = {};
  let flicks = 0, looks = 0;
  const lookedAt: Record<string, number> = {};
  const out: Heard[] = [];
  const dt = 1 / 30;
  for (let t = 0; t < secs; t += dt) {
    out.length = 0;
    S.update(dt, { day, hour, month, rain }, out);
    for (const h of out) {
      n[h.id] = (n[h.id] ?? 0) + 1;
      E.sound(h.id, h.at, h.loud, false, 0.25);
      if (E.orient) { looks++; lookedAt[h.id] = (lookedAt[h.id] ?? 0) + 1; E.orient = null; }
    }
    E.update(dt);
    if (E.flick) { flicks++; E.flick = null; }
  }
  return { n, flicks, looks, lookedAt };
}

describe('the sounds of the place', () => {
  it('a spring morning: birds often, the street and the building now and then', () => {
    const r = listen(7, 4);
    expect(r.n.bird).toBeGreaterThan(200);
    expect(r.n.street).toBeGreaterThan(40);
    expect(r.n.door).toBeGreaterThan(10);
    expect(r.n.pipes ?? 0).toBe(0);
  });
  it('the small hours: no birds, the street all but quiet', () => {
    const r = listen(3, 4);
    expect(r.n.bird ?? 0).toBe(0);
    expect(r.n.street ?? 0).toBeLessThan(40);
  });
  it('the pipes tick as the heating comes on of a winter morning, not of a summer one', () => {
    expect(listen(6.5, 0).n.pipes).toBeGreaterThan(5);
    expect(listen(6.5, 6).n.pipes ?? 0).toBe(0);
  });
  it('the ears: turned to most, a look at only a few (the birds go on, and are got used to)', () => {
    const r = listen(7, 4);
    const all = Object.values(r.n).reduce((a, b) => a + b, 0);
    // (an ear to many of them, but nothing like every one)
    expect(r.flicks).toBeGreaterThan(30);
    expect(r.flicks).toBeLessThan(all * 0.6);
    // (a look that way now and then: a door, a horn; seldom a bird, there are so many)
    expect(r.looks).toBeGreaterThan(3);
    expect(r.looks).toBeLessThan(60);
    expect((r.lookedAt.bird ?? 0) / r.n.bird).toBeLessThan(0.08);
  });
});
