import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Sill, type Ctx } from '../src/pixel/behave';

/** a cat (its motor) sat up on the windowsill facing the glass, the mug of tea by its side and the
 *  pencil (if any) by its paws, with only what the sill needs of a room */
function sill(withPencil = false) {
  const m = new Motor();
  m.snap('sit');
  const spot = { launch: new THREE.Vector3(0, 0, 0.44), seat: new THREE.Vector3(0, 0, 0.08), land: new THREE.Vector3(0.03, 0, 0.46), height: 0.36 };
  m.pos.copy(spot.seat);
  m.yaw = Math.PI;
  const edge = 0.245;
  const mug = { at: new THREE.Vector3(-0.105, 0.36, 0.13), onSill: true };
  const pencil = { at: new THREE.Vector3(0.12, 0.36, 0.17), onSill: true };
  const pushes: { what: string; dz: number }[] = [];
  const looks: string[] = [];
  const viewer = new THREE.Vector3(0, 1.4, 3);
  const c = {
    m, home: new THREE.Vector3(), window: new THREE.Vector3(0, 0, 0.3),
    room: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, mode: 'rest', mood: { ...NEUTRAL }, kneading: false,
    night: 0, rain: 0, snow: false,
    keepClear: (p: THREE.Vector3) => p, sound: () => {}, say: () => {}, chirp: () => {}, birds: () => null, drop: () => {},
    perch: () => {}, hold: () => {}, bed: () => ({ to: new THREE.Vector3(0, 0, 0.6), yaw: 0 }),
    viewer: () => { looks.push('you'); return viewer; },
    mug: () => mug,
    pushMug: (dz: number, dx: number) => { pushes.push({ what: 'mug', dz }); mug.at.z += dz; mug.at.x += dx; if (mug.at.z >= edge) mug.onSill = false; },
    pencil: () => (withPencil ? pencil : null),
    pushPencil: (dz: number) => { pushes.push({ what: 'pencil', dz }); pencil.at.z += dz; if (pencil.at.z >= edge) pencil.onSill = false; },
  } as unknown as Ctx;
  return { c, m, spot, mug, pushes, looks };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('up on the sill', () => {
  it('turned round to the room with the mug of tea by it: a look at it, a look at you, a pat or two, and over it goes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { c, m, spot, mug, pushes, looks } = sill();
    const act = new Sill(spot);
    act.phase = 'about';
    const steps: string[] = [];
    let wentAt = -1;
    for (let t = 0; t < 25; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      const k = (act as unknown as { knock: { step: string } }).knock.step;
      if (act.phase === 'knock' && steps[steps.length - 1] !== k) steps.push(k);
      if (!mug.onSill && wentAt < 0) wentAt = t;
      if (act.phase === 'look') break;
    }
    // (stepped over to it first, so that it stood before a paw)
    expect(steps[0]).toBe('to');
    expect(steps).toContain('you');
    expect(looks.length).toBeGreaterThan(0);
    // pushed along, a little at a time and then a shove, until over the edge; watched going
    expect(pushes.every((p) => p.what === 'mug')).toBe(true);
    expect(pushes.length).toBeGreaterThanOrEqual(2);
    expect(mug.onSill).toBe(false);
    expect(steps).toContain('watch');
    expect(wentAt).toBeGreaterThan(0);
  });

  it('sat at the glass by the steaming tea: a sniff at the steam, a start back, a lick of the nose', () => {
    const { c, m, spot } = sill();
    const act = new Sill(spot);
    act.phase = 'sit';
    (act as unknown as { dur: number }).dur = 60;
    (act as unknown as { sniffIn: number }).sniffIn = 0.5;
    let tongue = 0, whisker = 0, squint = 0, sniffed = false;
    for (let t = 0; t < 12; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      const s = (act as unknown as { sniff: number }).sniff;
      if (s >= 0) sniffed = true;
      tongue = Math.max(tongue, m.pose.tongue);
      whisker = Math.max(whisker, m.pose.whisker);
      squint = Math.max(squint, m.pose.squint);
    }
    expect(sniffed).toBe(true);
    expect(tongue).toBeGreaterThan(0.5);
    expect(squint).toBeGreaterThan(0.5);
    // (and done with, back to the window)
    expect((act as unknown as { sniff: number }).sniff).toBe(-1);
    expect(act.phase).toBe('sit');
  });

  it('caught at it by a tap on the glass: frozen, looking at you; then, holding your eye, over it goes anyway', () => {
    let r = 0.1;
    vi.spyOn(Math, 'random').mockImplementation(() => r);
    const { c, m, spot, mug, pushes } = sill();
    const act = new Sill(spot);
    act.phase = 'about';
    const K = () => (act as unknown as { knock: { step: string } }).knock;
    let caught = false, steps: string[] = [];
    for (let t = 0; t < 20 && act.phase !== 'look'; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      if (!caught && act.phase === 'knock' && K().step === 'you') { caught = act.caught(); }
      if (act.phase === 'knock' && steps[steps.length - 1] !== K().step) steps.push(K().step);
    }
    expect(caught).toBe(true);
    expect(steps).toContain('caught');
    // (one shove, and over: no pats before it)
    expect(pushes.length).toBe(1);
    expect(pushes[0].dz).toBeGreaterThanOrEqual(0.13);
    expect(mug.onSill).toBe(false);
    r = 0.1;
  });

  it('caught at it: or the paw drawn back, a look out of the window, and the mug left be', () => {
    let r = 0.1;
    vi.spyOn(Math, 'random').mockImplementation(() => r);
    const { c, m, spot, mug, pushes } = sill();
    const act = new Sill(spot);
    act.phase = 'about';
    const K = () => (act as unknown as { knock: { step: string } }).knock;
    let caught = false;
    for (let t = 0; t < 20 && act.phase !== 'look'; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      if (!caught && act.phase === 'knock' && K().step === 'you') { r = 0.9; caught = act.caught(); }
    }
    expect(caught).toBe(true);
    expect(pushes.length).toBe(0);
    expect(mug.onSill).toBe(true);
    expect(act.phase).toBe('look');
  });

  it('a jump that comes up short: hung over the edge, the hind legs going, hauled up, and a look round and a wash as if nothing had happened', () => {
    const { c, m, spot, looks } = sill();
    m.snap('stand');
    m.pos.copy(spot.launch);
    const holds: { phase: string; y: number }[] = [], sounds: string[] = [];
    const act = new Sill(spot);
    (c as unknown as { hold: (y: number | null) => void }).hold = (y) => { if (y !== null) holds.push({ phase: act.phase, y }); };
    (c as unknown as { sound: (n: string) => void }).sound = (n) => { sounds.push(n); };
    act.miss = true;
    act.phase = 'gather';
    const seen: string[] = [];
    let washed = false, lookedFirst = false;
    for (let t = 0; t < 9; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
      if (seen[seen.length - 1] !== act.phase) seen.push(act.phase);
      if (act.phase === 'sit' && !washed && looks.length > 0) lookedFirst = true;
      if (act.phase === 'sit' && m.pose.tongue > 0.4 && Math.abs(m.pose.neckYaw) > 0.5) washed = true;
    }
    // (gathered already: off it goes at once)
    expect(seen.slice(0, 5), seen.join(' ')).toEqual(['up', 'hang', 'haul', 'settle', 'sit']);
    // (hung well below the top of the sill, the forearms over its edge, then up)
    const hung = holds.filter((h) => h.phase === 'hang');
    expect(hung.length).toBeGreaterThan(10);
    expect(Math.max(...hung.map((h) => h.y))).toBeLessThan(spot.height - 0.15);
    expect(sounds.filter((n) => n === 'scrabble').length).toBeGreaterThanOrEqual(3);
    // sat, a look round at you first, then the wash
    expect(lookedFirst).toBe(true);
    expect(washed).toBe(true);
  });

  it('the pencil by its paws as well: one or the other, never both at once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { c, m, spot, pushes } = sill(true);
    const act = new Sill(spot);
    act.phase = 'about';
    for (let t = 0; t < 25 && act.phase !== 'look'; t += 0.02) {
      act.update(0.02, c);
      m.update(0.02);
    }
    expect(pushes.length).toBeGreaterThan(0);
    expect(new Set(pushes.map((p) => p.what)).size).toBe(1);
    expect(c.pencil()?.onSill).toBe(true);
  });
});
