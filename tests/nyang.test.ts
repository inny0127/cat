import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COMBO_GAP, LEVELS, Round, comboMul, dailyLevel, unlocked } from '../src/nyang/round';
import { TOPS } from '../src/nyang/tops';
import { KINDS, Props } from '../src/nyang/props';
import { choose } from '../src/nyang/closet';
import { buyUp, upLevel } from '../src/nyang/upgrades';
import type { Top } from '../src/nyang/set';

const table: Top = { id: 'table', x0: 0, x1: 0.6, z0: -0.3, z1: 0.3, h: 0.66 };
const stool: Top = { id: 'stool', x0: 0.7, x1: 1.0, z0: -0.15, z1: 0.15, h: 0.42 };
const topAt = (x: number, z: number, below = Infinity) =>
  [table, stool].filter((T) => x >= T.x0 && x <= T.x1 && z >= T.z0 && z <= T.z1 && T.h < below).sort((a, b) => b.h - a.h)[0] ?? null;
const props = () => new Props(() => new THREE.MeshBasicMaterial(), topAt);
const run = (P: Props, s: number) => { for (let i = 0; i < s * 60; i++) P.step(1 / 60); };

describe('냥아치: a round', () => {
  it('scores a run of quick knocks higher, and lets it lapse after the gap', () => {
    const r = new Round(LEVELS[0]);
    expect(r.down(100, false)).toBe(100);
    r.step(1);
    expect(r.down(100, false)).toBe(150);
    r.step(1);
    expect(r.down(100, true)).toBe(300);
    expect(r.comboLive).toBe(3);
    r.step(COMBO_GAP + 0.1);
    expect(r.comboLive).toBe(0);
    expect(r.down(100, false)).toBe(100);
    expect(r.best).toBe(3);
    expect(r.downs).toBe(4);
    expect(r.breaks).toBe(1);
    expect(comboMul(20)).toBe(4);
  });

  it('caught on the pet cam: points lost (never below none), the run broken', () => {
    const r = new Round(LEVELS[2]);
    r.down(300, true);
    r.step(1);
    r.down(300, true);
    expect(r.comboLive).toBe(2);
    r.caught(400);
    expect(r.score).toBe(1130 - 400);
    expect(r.comboLive).toBe(0);
    r.caught(5000);
    expect(r.score).toBe(0);
    expect(r.catches).toBe(2);
    expect(LEVELS[0].cam).toBeUndefined();
    expect(LEVELS[2].cam).toBeGreaterThan(0);
  });

  it('ends when the time is up, and counts nothing after', () => {
    const r = new Round(LEVELS[0]);
    expect(r.step(LEVELS[0].time - 1)).toBe(false);
    expect(r.step(1.01)).toBe(true);
    expect(r.over).toBe(true);
    expect(r.down(300, true)).toBe(0);
    expect(r.left).toBe(0);
  });

  it('gives stars at the room\'s marks, and opens the next room with one', () => {
    const r = new Round(LEVELS[0]);
    r.score = LEVELS[0].stars[1];
    expect(r.stars).toBe(2);
    const save = { best: {}, stars: {} as Record<string, number>, coins: 0, owned: [], coat: 'coat-ginger', neck: null, head: null, up: {}, book: {} };
    expect(unlocked(save, 0)).toBe(true);
    expect(unlocked(save, 1)).toBe(false);
    save.stars[LEVELS[0].id] = 1;
    expect(unlocked(save, 1)).toBe(true);
  });

  it('lays out only things it knows, on tops that exist, within them', () => {
    const tops = ['dresser', 'shelf', 'sofa', 'sofaBack', 'coffee', 'sill', 'stool', 'table'];
    for (const L of LEVELS) {
      expect(L.stars[0]).toBeLessThan(L.stars[1]);
      for (const [kind, top] of L.props) {
        expect(KINDS[kind]).toBeTruthy();
        expect(tops).toContain(top);
      }
    }
  });
});

describe('냥아치: the room of the day', () => {
  it('is the same all day, another the next, its things on tops and apart, its marks rising', () => {
    const a = dailyLevel(new Date(2026, 9, 30, 8)), b = dailyLevel(new Date(2026, 9, 30, 22)), c = dailyLevel(new Date(2026, 9, 31, 8));
    expect(a).toEqual(b);
    expect(a.props).not.toEqual(c.props);
    for (const L of [a, c]) {
      expect(L.props.length).toBeGreaterThanOrEqual(15);
      expect(L.stars[0]).toBeLessThan(L.stars[1]);
      expect(L.stars[1]).toBeLessThan(L.stars[2]);
      for (const [kind, top, x, z] of L.props) {
        const T = TOPS.find((t) => t.id === top)!;
        expect(x).toBeGreaterThanOrEqual(T.x0);
        expect(x).toBeLessThanOrEqual(T.x1);
        expect(z).toBeGreaterThanOrEqual(T.z0);
        expect(z).toBeLessThanOrEqual(T.z1);
        for (const [k2, t2, x2, z2] of L.props) {
          if (t2 !== top || (x2 === x && z2 === z)) continue;
          expect(Math.hypot(x - x2, z - z2)).toBeGreaterThan(KINDS[kind].r + KINDS[k2].r);
        }
      }
    }
  });
});

describe('냥아치: things knocked off', () => {
  it('a mug pushed off the table falls, breaks on the floor and is reported once', () => {
    const P = props();
    const downs: boolean[] = [];
    P.onDown = (_p, broke) => downs.push(broke);
    const mug = P.place('mug', table, 0.5, 0);
    P.swat(mug, new THREE.Vector3(1, 0, 0), 1.6);
    run(P, 2);
    expect(mug.state).toBe('broken');
    expect(downs).toEqual([true]);
    expect(P.standing).not.toContain(mug);
  });

  it('a gentle push leaves it on the table, slid along a little', () => {
    const P = props();
    const cup = P.place('cup', table, 0.2, 0);
    P.swat(cup, new THREE.Vector3(1, 0, 0), 0.4);
    run(P, 1);
    expect(cup.state).toBe('still');
    expect(cup.on).toBe(table);
    expect(cup.group.position.x).toBeGreaterThan(0.2);
  });

  it('a book off the table does not break; one landing on a lower top stays up there', () => {
    const P = props();
    const downs: boolean[] = [];
    P.onDown = (_p, broke) => downs.push(broke);
    const book = P.place('book', table, 0.55, 0.25);
    P.swat(book, new THREE.Vector3(0, 0, 1), 1.4);
    run(P, 2);
    expect(book.state).toBe('down');
    expect(downs).toEqual([false]);
    // (off the table's end onto the stool beside it, lower down)
    const jar = P.place('jar', table, 0.58, 0);
    P.swat(jar, new THREE.Vector3(1, 0, 0), 0.9);
    run(P, 2);
    expect(jar.on).toBe(stool);
    expect(downs.length).toBe(1);
  });
});

describe('냥아치: the wardrobe', () => {
  it('buys what the coins run to, puts it on, and takes an accessory off again', () => {
    const w = { coins: 400, owned: [] as string[], coat: 'coat-ginger', neck: null as string | null, head: null as string | null };
    expect(choose(w, 'coat-silver')).toBe('poor');
    expect(w.coins).toBe(400);
    expect(choose(w, 'collar-red')).toBe('bought');
    expect(w.neck).toBe('collar-red');
    expect(w.coins).toBe(280);
    expect(choose(w, 'collar-red')).toBe('off');
    expect(w.neck).toBe(null);
    expect(choose(w, 'collar-red')).toBe('wear');
    expect(w.coins).toBe(280);
    expect(choose(w, 'coat-cream')).toBe('poor');
    expect(choose(w, 'coat-ginger')).toBe('wear');
    expect(choose(w, 'nothing')).toBe('poor');
  });
});

describe('냥아치: upgrades', () => {
  it('a step at a time, each dearer, while the coins last, up to four', () => {
    const s = { coins: 1000, up: {} as Record<string, number> };
    expect(buyUp(s, 'paw')).toBe('bought');
    expect(s.coins).toBe(900);
    expect(buyUp(s, 'paw')).toBe('bought');
    expect(s.coins).toBe(650);
    expect(buyUp(s, 'paw')).toBe('bought');
    expect(s.coins).toBe(150);
    expect(buyUp(s, 'paw')).toBe('poor');
    expect(upLevel(s.up, 'paw')).toBe(3);
    s.coins = 5000;
    expect(buyUp(s, 'paw')).toBe('bought');
    expect(buyUp(s, 'paw')).toBe('max');
    expect(upLevel(s.up, 'legs')).toBe(0);
  });
});
