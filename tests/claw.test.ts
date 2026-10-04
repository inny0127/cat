import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { NEUTRAL } from '../src/cat3d/mood';
import { Claw, type Ctx } from '../src/pixel/behave';
import { rugScratch, sisal } from '../src/audio/synth';

afterEach(() => { vi.restoreAllMocks(); });

describe('the scratching post', () => {
  it('over to it, up on the hind legs, the claws down the rope a paw at a time, a long pull, and sat looking at you', () => {
    for (const seed0 of [7, 4242, 99991]) {
      let seed = seed0;
      vi.spyOn(Math, 'random').mockImplementation(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
      const m = new Motor();
      m.snap('stand');
      const post = { at: new THREE.Vector3(-0.82, 0, -0.37), r: 0.042 };
      m.pos.set(post.at.x + 0.6, 0, post.at.z + 0.15);
      m.yaw = -Math.PI / 2;
      const sounds: string[] = [], bumps: THREE.Vector3[] = [];
      const viewer = new THREE.Vector3(0, 1.2, 3);
      const c = {
        m, mood: { ...NEUTRAL, trust: 0.8 }, viewer: () => viewer,
        sound: (n: string) => sounds.push(n), bump: (at: THREE.Vector3) => bumps.push(at.clone()),
      } as unknown as Ctx;
      const act = new Claw(post), phases: string[] = [];
      let going = true, t = 0, apart = 0, high = 0, lookedAtYou = false;
      for (; t < 30 && going; t += 1 / 60) {
        going = act.update(1 / 60, c);
        m.update(1 / 60);
        if (phases[phases.length - 1] !== act.phase) phases.push(act.phase);
        if (act.phase === 'rake') {
          apart = Math.max(apart, Math.abs(m.pose.LF.y - m.pose.RF.y));
          high = Math.max(high, m.pose.LF.y, m.pose.RF.y);
          // (the paws at the rope: as far ahead of the cat as the post's near side)
          for (const f of [m.pose.LF, m.pose.RF]) expect(Math.abs(f.z - (Claw.STAND - post.r - 0.008))).toBeLessThan(0.035);
        }
        if (act.phase === 'after' && m.lookTarget && m.lookTarget.distanceTo(viewer) < 1e-6) lookedAtYou = true;
      }
      expect(going).toBe(false);
      expect(phases.filter((p) => p !== 'sniff')).toEqual(['go', 'up', 'rake', 'pull', 'down', 'after']);
      // stood at the post, side on to you, facing it
      expect(Math.abs(m.pos.x - (post.at.x + Claw.STAND))).toBeLessThan(0.04);
      expect(Math.abs(m.pos.z - post.at.z)).toBeLessThan(0.04);
      expect(Math.abs(Math.atan2(Math.sin(m.yaw + Math.PI / 2), Math.cos(m.yaw + Math.PI / 2)))).toBeLessThan(0.3);
      // high up the rope, one paw and then the other
      expect(high).toBeGreaterThan(0.4);
      expect(apart).toBeGreaterThan(0.05);
      // each drag down heard, and the post knocked by it
      const drags = sounds.filter((s) => s === 'sisal').length;
      expect(drags).toBeGreaterThanOrEqual(6);
      expect(bumps.length).toBe(drags);
      for (const b of bumps) expect(Math.hypot(b.x - post.at.x, b.z - post.at.z)).toBeLessThan(0.1);
      expect(lookedAtYou).toBe(true);
      vi.restoreAllMocks();
    }
  });

  it('claws down sisal: a knock, and a long rip coarser and lower than a rug', () => {
    const zc = (d: Float32Array) => { let n = 0; for (let i = 1; i < d.length; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++; return n / d.length; };
    let a = 0, b = 0;
    for (let i = 0; i < 6; i++) {
      const d = sisal(22050);
      expect(d.length / 22050).toBeGreaterThan(0.28);
      expect(d.length / 22050).toBeLessThan(0.45);
      let peak = 0, e = 0;
      for (const v of d) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); e += v * v; }
      expect(peak).toBeLessThanOrEqual(0.9001);
      expect(Math.sqrt(e / d.length)).toBeGreaterThan(0.02);
      a += zc(d);
      b += zc(rugScratch(22050));
    }
    expect(a).toBeLessThan(b);
  });
});
