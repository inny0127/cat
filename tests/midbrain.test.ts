import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Colliculus, Valence, type Known, type ValenceIn } from '../src/pixel/midbrain';
import type { EyeFrame } from '../src/cat3d/retina';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const D = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** a picture from the eyes as the retina makes one: 48 across the two hundred degrees in front of
 *  a head facing `yaw`, 16 down; brightness from `lum(az, el)` */
function frame(yaw: number, t: number, lum: (az: number, el: number) => number): EyeFrame {
  const w = 48, h = 16, n = w * h;
  const F: EyeFrame = { lum: new Float32Array(n), w, h, az: new Float32Array(n), el: new Float32Array(n), t };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i, az = wrap(yaw + (100 - ((i + 0.5) * 200) / w) * D), el = (38 - ((j + 0.5) * 77) / h) * D;
      F.az[k] = az;
      F.el[k] = el;
      F.lum[k] = lum(az, el);
    }
  }
  return F;
}
/** a room of plain walls with a few still things in it: some brightness everywhere, darker below */
const room = (az: number, el: number) => 0.35 + 0.1 * Math.sin(az * 3) + 0.15 * Math.max(0, el) + (Math.abs(wrap(az - 0.9)) < 0.12 && el > 0.1 && el < 0.4 ? 0.4 : 0);

describe('the colliculus: where its eyes go', () => {
  it('a thing it knows: the firing gathers on it, in one patch, as wide as it is', () => {
    const S = new Colliculus();
    const eye = V(0, 0.2, 0), p = V(0.4, 0, 0.6);
    for (let t = 0; t < 1; t += 1 / 60) S.update(1 / 60, eye, [{ id: 'a', p, a: 0.9, r: 0.04 }], 1);
    expect(S.on).toBe('a');
    expect(S.peak).toBeGreaterThan(0.9);
    expect(Math.abs(wrap(S.at.az - Math.atan2(0.4, 0.6)))).toBeLessThan(0.06);
    expect(Math.abs(S.at.el - Math.atan2(-0.2, Math.hypot(0.4, 0.6)))).toBeLessThan(0.06);
    // (and nowhere else on the sheet does it fire)
    let elsewhere = 0;
    for (let k = 0; k < S.f.length; k++) if (S.f[k] > 0.3) elsewhere++;
    expect(elsewhere).toBeLessThan(25);
  });

  it('two things alike: one patch wins and holds; the other is put out (whatever its noise)', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const S = new Colliculus(seed * 7919);
      const eye = V(0, 0.2, 0);
      const K: Known[] = [{ id: 'a', p: V(-0.3, 0, 0.8), a: 0.9, r: 0.04 }, { id: 'b', p: V(0.3, 0, 0.8), a: 0.9, r: 0.04 }];
      let switches = 0, last: string | null = null;
      for (let t = 0; t < 8; t += 1 / 60) {
        S.update(1 / 60, eye, K, 1);
        if (S.on && last && S.on !== last) switches++;
        if (S.on) last = S.on;
      }
      // (a glance at the one, and the other wins: no more than that)
      expect(switches).toBeLessThan(2);
      const other = last === 'a' ? K[1] : K[0];
      expect(S.firing(Math.atan2(other.p.x, other.p.z), Math.atan2(-0.2, Math.hypot(other.p.x, other.p.z)))).toBeLessThan(0.1);
    }
  });

  it('something it knows nothing of moves in a still room: the firing goes to it, on nothing it knows', () => {
    const S = new Colliculus();
    const eye = V(0, 0.2, 0);
    let t = 0;
    for (let i = 0; i < 12; i++) {
      t += 1 / 12;
      S.see(frame(0, t, room), 0);
      for (let k = 0; k < 5; k++) S.update(1 / 60, eye, [], 1);
    }
    expect(S.peak).toBeLessThan(0.5);
    // (a small dark thing swinging to and fro, off to its right and a little up: a curtain's tassel)
    const at = (tt: number) => -0.8 + 0.1 * Math.sin(tt * 9);
    for (let i = 0; i < 18; i++) {
      t += 1 / 12;
      const x = at(t);
      S.see(frame(0, t, (az, el) => room(az, el) - (Math.abs(wrap(az - x)) < 0.09 && Math.abs(el - 0.2) < 0.09 ? 0.3 : 0)), 0);
      for (let k = 0; k < 5; k++) S.update(1 / 60, eye, [], 1);
    }
    expect(S.peak).toBeGreaterThan(0.6);
    expect(S.on).toBeNull();
    expect(Math.abs(wrap(S.at.az + 0.8))).toBeLessThan(0.2);
    expect(Math.abs(S.at.el - 0.2)).toBeLessThan(0.15);
  });

  it('turning its own head round a still room is no movement to it', () => {
    const S = new Colliculus();
    const eye = V(0, 0.2, 0);
    let t = 0, most = 0;
    for (let i = 0; i < 36; i++) {
      t += 1 / 12;
      S.see(frame(0.9 * Math.sin(t * 2.5), t, room), 0);
      for (let k = 0; k < 5; k++) S.update(1 / 60, eye, [], 1);
      if (i > 2) most = Math.max(most, S.peak);
    }
    expect(most).toBeLessThan(0.5);
  });

  it('the whole view changes at once (the light switched off, lightning): a start, and no movement anywhere', () => {
    const S = new Colliculus();
    const eye = V(0, 0.2, 0);
    let t = 0;
    for (let i = 0; i < 6; i++) { t += 1 / 12; S.see(frame(0, t, room), 0); S.update(1 / 60, eye, [], 1); }
    t += 1 / 12;
    S.see(frame(0, t, (az, el) => room(az, el) * 0.3), 0);
    for (let k = 0; k < 5; k++) S.update(1 / 60, eye, [], 1);
    expect(S.flash).toBeGreaterThan(0.6);
    expect(S.peak).toBeLessThan(0.5);
  });

  it('alert in a still room: its eyes go from one thing that stands out to another, a second or few on each; drowsy, nowhere', () => {
    // (a bright thing up to the left, a dark one down in front, on a plain wall)
    const patch = (az: number, el: number, a0: number, e0: number, r: number) => (Math.abs(wrap(az - a0)) < r && Math.abs(el - e0) < r ? 1 : 0);
    const still = (az: number, el: number) => 0.3 + 0.05 * Math.sin(az * 3) + 0.5 * patch(az, el, 0.9, 0.25, 0.12) - 0.2 * patch(az, el, 0.1, -0.5, 0.1);
    const run = (look: number) => {
      const S = new Colliculus();
      S.look = look;
      const eye = V(0, 0.2, 0);
      const looks: { at: string; secs: number }[] = [];
      let t = 0, cur: string | null = null;
      for (let i = 0; i < 60 * 40; i++) {
        t += 1 / 60;
        if (i % 5 === 0) S.see(frame(0, t, still), 0);
        S.update(1 / 60, eye, [], 1);
        const at = S.peak > 0.5 ? (Math.abs(wrap(S.at.az - 0.9)) < 0.3 ? 'bright' : Math.abs(wrap(S.at.az - 0.1)) < 0.3 ? 'dark' : 'else') : null;
        if (at !== cur) { if (at) looks.push({ at, secs: 0 }); cur = at; }
        if (at) looks[looks.length - 1].secs += 1 / 60;
      }
      return looks;
    };
    const alert = run(0.9);
    expect(alert.length).toBeGreaterThan(5);
    expect(new Set(alert.map((l) => l.at)).has('dark')).toBe(true);
    expect(alert.every((l) => l.at !== 'else')).toBe(true);
    const mean = alert.reduce((a, l) => a + l.secs, 0) / alert.length;
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(4);
    expect(run(0).length).toBe(0);
  });

  it('out past the front of the room, where there is nothing, nothing moves and nothing stands out', () => {
    const S = new Colliculus();
    S.look = 1;
    const eye = V(0, 0.2, 0);
    let t = 0, most = 0;
    for (let i = 0; i < 40; i++) {
      t += 1 / 12;
      // (a plain floor below, and above it nothing: flickering numbers that are no picture of anything)
      const F = frame(0, t, (az, el) => (el < -0.2 ? 0.2 : 0.08 + 0.3 * ((i * 7 + Math.floor(az * 20)) % 3)));
      F.none = new Uint8Array(F.w * F.h);
      for (let k = 0; k < F.w * F.h; k++) F.none[k] = F.el[k] < -0.2 ? 0 : 1;
      S.see(F, 0);
      for (let k = 0; k < 5; k++) S.update(1 / 60, eye, [], 1);
      if (i > 2) most = Math.max(most, S.peak);
    }
    expect(most).toBeLessThan(0.5);
  });

  it('its own shadow going about by its feet is no news; the same a few steps off is', () => {
    const run = (x0: number) => {
      const S = new Colliculus();
      const eye = V(0, 0.2, 0);
      const own = { eye, x: 0, y: 0, z: 0.1, r: 0.6 };
      let t = 0, most = 0;
      for (let i = 0; i < 30; i++) {
        t += 1 / 12;
        // (a dark patch on the floor, going to and fro, x0 ahead of it)
        const az0 = 0.15 * Math.sin(t * 6), el0 = -Math.atan2(0.2, x0);
        S.see(frame(0, t, (az, el) => room(az, el) - (Math.abs(wrap(az - az0)) < 0.1 && Math.abs(el - el0) < 0.08 ? 0.25 : 0)), 0, own);
        for (let k = 0; k < 5; k++) S.update(1 / 60, eye, [], 1);
        if (i > 4) most = Math.max(most, S.peak);
      }
      return most;
    };
    expect(run(0.3)).toBeLessThan(0.5);
    expect(run(1.6)).toBeGreaterThan(0.6);
  });

  it('a thing that stood out, the cat turned away from it: gone from mind (a thing it knows stays)', () => {
    const S = new Colliculus();
    S.look = 0.9;
    const eye = V(0, 0.2, 0);
    const lit = (az: number, el: number) => 0.3 + (Math.abs(wrap(az - 0.4)) < 0.15 && Math.abs(el - 0.1) < 0.15 ? 0.5 : 0);
    let t = 0;
    for (let i = 0; i < 60; i++) { t += 1 / 60; if (i % 5 === 0) S.see(frame(0, t, lit), 0); S.update(1 / 60, eye, [], 1); }
    expect(S.peak).toBeGreaterThan(0.6);
    // (turned right round: the bright thing behind it now, the wall plain)
    for (let i = 0; i < 60; i++) { t += 1 / 60; if (i % 5 === 0) S.see(frame(Math.PI, t, () => 0.3), 0); S.update(1 / 60, eye, [], 1); }
    expect(S.firing(0.4, 0.1)).toBeLessThan(0.2);
  });

  it('asleep, the eyes give it nothing: a thing it knows fires nothing on it', () => {
    const S = new Colliculus();
    for (let t = 0; t < 1; t += 1 / 60) S.update(1 / 60, V(0, 0.2, 0), [{ id: 'a', p: V(0.4, 0, 0.6), a: 0.9, r: 0.04 }], 0);
    expect(S.peak).toBeLessThan(0.1);
  });
});

describe('what to do about it: go toward it, shy, freeze, wonder', () => {
  const calm: ValenceIn = { prey: 0, loom: 0, novel: 0, startle: 0, fear: 0, arousal: 0.2 };
  const run = (V0: Valence, secs: number, I: Partial<ValenceIn>, each?: (v: Valence, t: number) => void) => {
    for (let t = 0; t < secs; t += 1 / 60) { V0.update(1 / 60, { ...calm, ...I }); each?.(V0, t); }
  };

  it('at rest: none of it much', () => {
    const v = new Valence();
    run(v, 5, {});
    expect(v.approach).toBeLessThan(0.25);
    expect(v.withdraw).toBeLessThan(0.15);
    expect(v.freeze).toBeLessThan(0.2);
  });

  it('a thing coming at its face: a shy in a tenth of a second or so, and over a while after', () => {
    const v = new Valence();
    run(v, 3, {});
    let rose = -1;
    run(v, 0.4, { loom: 1 }, (x, t) => { if (rose < 0 && x.withdraw > 0.5) rose = t; });
    expect(rose).toBeGreaterThan(0);
    expect(rose).toBeLessThan(0.2);
    run(v, 3, {});
    expect(v.withdraw).toBeLessThan(0.3);
  });

  it('prey-like movement draws it on, and a shy puts that out', () => {
    const v = new Valence();
    run(v, 2, { prey: 0.9, arousal: 0.6 });
    expect(v.approach).toBeGreaterThan(0.6);
    run(v, 0.3, { prey: 0.9, arousal: 0.6, loom: 1 });
    expect(v.withdraw).toBeGreaterThan(0.5);
    expect(v.approach).toBeLessThan(0.5);
  });

  it('a start that comes to nothing, again and again: less of a start each time', () => {
    const v = new Valence();
    const peaks: number[] = [];
    for (let k = 0; k < 4; k++) {
      let peak = 0;
      run(v, 0.25, { startle: 1 }, (x) => { peak = Math.max(peak, x.withdraw); });
      run(v, 1.5, {});
      peaks.push(peak);
    }
    expect(peaks[3]).toBeLessThan(peaks[0] - 0.08);
  });

  it('something new, and not afraid: a moment stock still, then curious about it', () => {
    const v = new Valence();
    run(v, 2, {});
    let froze = 0;
    run(v, 0.6, { novel: 1 }, (x) => { froze = Math.max(froze, x.freeze); });
    run(v, 2, { novel: 0.6 });
    expect(froze).toBeGreaterThan(0.45);
    expect(v.curious).toBeGreaterThan(0.45);
    const afraid = new Valence();
    run(afraid, 2, { fear: 0.9 });
    run(afraid, 2.6, { novel: 0.8, fear: 0.9 });
    expect(afraid.curious).toBeLessThan(v.curious - 0.2);
  });
});
