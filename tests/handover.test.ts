import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { washFace, type Ctx } from '../src/pixel/behave';

const ctx = (m: Motor) => ({ m, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx);

describe('a paw is never in two places a frame apart', () => {
  it('a face wash: the paw up once, wiped and licked, and down once, a side at a time', () => {
    for (const r of [0.1, 0.5, 0.9]) {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
      const m = new Motor();
      m.snap('sit');
      const c = ctx(m);
      const act = washFace();
      rnd.mockRestore();
      let most = 0, ups = 0, up = false;
      const was = { LF: m.pose.LF.y, RF: m.pose.RF.y };
      for (let i = 0; i < 60 * 30; i++) {
        const on = act.update(1 / 60, c);
        m.update(1 / 60);
        for (const l of ['LF', 'RF'] as const) {
          most = Math.max(most, Math.abs(m.pose[l].y - was[l]));
          was[l] = m.pose[l].y;
        }
        // (a paw counted up when it is well off the floor)
        const now = Math.max(m.pose.LF.y, m.pose.RF.y) > 0.1;
        if (now && !up) ups++;
        up = now;
        if (!on) break;
      }
      // (a wipe is quick, but not 15 cm in a frame)
      expect(most).toBeLessThan(0.025);
      expect(ups).toBeGreaterThanOrEqual(1);
      expect(ups).toBeLessThanOrEqual(2);
    }
  });

  it('a layer let go of all at once goes out over a moment', () => {
    const m = new Motor();
    m.snap('sit');
    m.layer = { pose: { LF: { planted: 0, frame: 0, x: 0.012, y: 0.21, z: 0.135, flex: 0.85 } }, w: 1 };
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.pose.LF.y).toBeGreaterThan(0.2);
    m.layer = null;
    m.update(1 / 60);
    expect(m.pose.LF.y).toBeGreaterThan(0.18);
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.pose.LF.y).toBeLessThan(0.02);
    // (and a snap into a posture is a snap)
    m.layer = { pose: { LF: { planted: 0, frame: 0, x: 0.012, y: 0.21, z: 0.135, flex: 0.85 } }, w: 1 };
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    m.layer = null;
    m.snap('sit');
    m.update(1 / 60);
    expect(m.pose.LF.y).toBeLessThan(0.02);
  });
});

describe('one posture after another', () => {
  it('a new posture starts from where the body is: not a frame of it there already', () => {
    // (sat watching, half down from a crouch, and off after the dot all at once: the run's own
    // height for the hips asked for while it is still sitting, held off till it is up, and not let
    // in for a frame as the stand begins)
    for (const r of [0.05, 0.5, 0.95]) {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
      const m = new Motor();
      m.snap('crouch');
      m.setPosture('sit');
      for (let i = 0; i < 10; i++) m.update(0.05);
      let was = m.pose.hipY, first = -1, jump = 0;
      for (let i = 0; i < 30; i++) {
        m.setPosture('stand');
        m.layer = { pose: { hipY: 0.185, neckPitch: 0.05 }, w: Math.min(1, (i + 1) / 3) };
        m.update(0.05);
        if (m.posture === 'stand' && first < 0) {
          first = i;
          // (the moment it sets off up into it, it is still all but entirely as it was: the hips
          // where they were, not up 4 cm in the one frame)
          const w = Object.fromEntries(m.postureWeights());
          expect(w.stand ?? 0).toBeLessThan(0.2);
          jump = m.pose.hipY - was;
        }
        was = m.pose.hipY;
      }
      rnd.mockRestore();
      expect(first).toBeGreaterThan(0);
      expect(jump).toBeLessThan(0.008);
    }
  });
});

describe('a rhythm of its own', () => {
  it('a living time: never back, never far off the clock, and not a metronome', async () => {
    const { lived } = await import('../src/pixel/behave');
    for (const seed of [0, 1.7, 6.2]) {
      let was = lived(0, seed), fastest = 0, slowest = Infinity;
      for (let t = 0.01; t < 60; t += 0.01) {
        const x = lived(t, seed), rate = (x - was) / 0.01;
        expect(rate).toBeGreaterThan(0);
        expect(Math.abs(x - t)).toBeLessThanOrEqual(0.1 + 1e-9);
        fastest = Math.max(fastest, rate);
        slowest = Math.min(slowest, rate);
        was = x;
      }
      // (a tenth or so quicker and slower by turns)
      expect(fastest).toBeGreaterThan(1.06);
      expect(slowest).toBeLessThan(0.94);
    }
  });
});

describe('the wiggle before a spring', () => {
  it('winds up: small and slow to begin with, big and quick at the full of it', async () => {
    const { wiggle } = await import('../src/pixel/behave');
    const D = 3, dt = 1 / 480;
    const span = (a: number, b: number) => {
      let peak = 0, cross = 0, was = wiggle(a, D);
      for (let t = a + dt; t < b; t += dt) {
        const x = wiggle(t, D);
        peak = Math.max(peak, Math.abs(x));
        if (x * was < 0) cross++;
        was = x;
      }
      return { peak, hz: cross / 2 / (b - a) };
    };
    const first = span(0.01, 1.01), last = span(2, 3), on = span(3, 5);
    expect(first.peak).toBeLessThan(0.75);
    expect(last.peak).toBeGreaterThan(0.9);
    expect(first.hz).toBeLessThan(4.6);
    expect(last.hz).toBeGreaterThan(5);
    // (and at the full of it, so on)
    expect(on.hz).toBeGreaterThan(5.6);
    expect(on.hz).toBeLessThan(6.4);
  });
});

describe('an easy walk', () => {
  it('wanders a little from the straight way, and comes true at the end; a run does not', () => {
    const lateral = (speed: number, seed: number, pass = false) => {
      let r = seed;
      const rnd = vi.spyOn(Math, 'random').mockImplementation(() => ((r = (r * 16807) % 2147483647) / 2147483647));
      const m = new Motor();
      rnd.mockRestore();
      m.snap('stand');
      m.pos.set(0, 0, 0);
      m.yaw = 0;
      let arrived = false, most = 0;
      m.walkTo(new THREE.Vector3(0, 0, 1.4), speed, null, () => { arrived = true; }, pass);
      for (let i = 0; i < 60 * 15 && !arrived; i++) {
        m.update(1 / 60);
        most = Math.max(most, Math.abs(m.pos.x));
      }
      return { most, arrived, end: Math.abs(m.pos.x) };
    };
    let wandered = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = lateral(0.3, seed);
      expect(w.arrived).toBe(true);
      expect(w.end).toBeLessThan(0.03);
      expect(w.most).toBeLessThan(0.12);
      if (w.most > 0.015) wandered++;
      // (after something at a run, on through it: straight at it)
      expect(lateral(1.0, seed, true).most).toBeLessThan(0.005);
    }
    expect(wandered).toBeGreaterThanOrEqual(3);
  });
});
