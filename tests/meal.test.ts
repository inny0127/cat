import { describe, it, expect, vi } from 'vitest';
import { mealLayer, mealPlan } from '../src/pixel/behave';

describe('at the bowl', () => {
  for (const reason of ['eat', 'drink']) {
    it(`${reason}: a sniff first, then the head down at it, and up now and then; never a jump`, () => {
      for (const r of [0.1, 0.5, 0.9]) {
        const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
        const dur = reason === 'eat' ? 30 : 16;
        const P = mealPlan(reason, dur);
        rnd.mockRestore();
        // (the first moment: nose down, no mouthful yet)
        const first = mealLayer(reason, 0.2, P);
        expect(first.neckPitch).toBeLessThan(-0.6);
        expect(first.jaw ?? 0).toBe(0);
        expect(first.tongue ?? 0).toBe(0);
        let ups = 0, was = mealLayer(reason, 0, P), most = 0;
        const dt = 1 / 60;
        for (let t = dt; t < dur; t += dt) {
          const L = mealLayer(reason, t, P);
          if ((L.neckPitch ?? 0) > -0.4) ups += dt;
          // (the head never in two places a frame apart: neck, head, the look about)
          for (const k of ['neckPitch', 'headPitch', 'headYaw'] as const) most = Math.max(most, Math.abs((L[k] ?? 0) - (was[k] ?? 0)));
          was = L;
        }
        expect(most).toBeLessThan(0.08);
        // (up between mouthfuls a fair part of the time, but mostly at it)
        expect(ups / dur).toBeGreaterThan(reason === 'eat' ? 0.08 : 0.04);
        expect(ups / dur).toBeLessThan(0.45);
      }
    });
  }
});

describe('grooming in bouts', () => {
  it('licks at a spot, a breath, and on along: the spots go one way, and the head never jumps', async () => {
    const { groomPlan, groomAt, groomFlank, groomChest } = await import('../src/pixel/behave');
    for (const r of [0.05, 0.5, 0.95]) {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
      const P = groomPlan(5, 9);
      rnd.mockRestore();
      expect(P[0].kind).toBe('lick');
      expect(P.some((p) => p.kind === 'pause')).toBe(true);
      for (let i = 1; i < P.length; i++) {
        expect(P[i].at).toBeCloseTo(P[i - 1].until, 9);
        expect(P[i].spot).toBeGreaterThanOrEqual(P[i - 1].spot);
      }
      // (the spot it is at moves on only in the breaths, smoothly)
      let was = groomAt(P, 0).spot, most = 0;
      for (let t = 0; t < P[P.length - 1].until; t += 1 / 60) {
        const g = groomAt(P, t);
        most = Math.max(most, Math.abs(g.spot - was));
        was = g.spot;
      }
      expect(most).toBeLessThan(0.03);
    }
    // (and the acts' own layers frame to frame)
    for (const make of [groomFlank, groomChest]) {
      const act = make() as unknown as { shape: (t: number) => Record<string, number>; dur: number };
      let prev = act.shape(0), jump = 0;
      for (let t = 1 / 60; t < act.dur; t += 1 / 60) {
        const L = act.shape(t);
        for (const k of ['neckPitch', 'headPitch', 'neckYaw', 'headYaw']) jump = Math.max(jump, Math.abs((L[k] ?? 0) - (prev[k] ?? 0)));
        prev = L;
      }
      expect(jump).toBeLessThan(0.05);
    }
  });
});

describe('kneading', () => {
  it('treads in turn, harder and softer, with a lull now and then; no paw ever jumps', async () => {
    const { knead } = await import('../src/pixel/behave');
    for (const r of [0.1, 0.5, 0.9]) {
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(r);
      const act = knead() as unknown as { shape: (t: number) => { LF: { y: number }; RF: { y: number } } };
      let prev = act.shape(0), jump = 0, still = 0, longest = 0;
      for (let t = 1 / 60; t < 30; t += 1 / 60) {
        const L = act.shape(t);
        jump = Math.max(jump, Math.abs(L.LF.y - prev.LF.y), Math.abs(L.RF.y - prev.RF.y));
        // (both paws down)
        still = L.LF.y < 0.0125 && L.RF.y < 0.0125 ? still + 1 / 60 : 0;
        longest = Math.max(longest, still);
        prev = L;
      }
      rnd.mockRestore();
      expect(jump).toBeLessThan(0.006);
      expect(longest).toBeGreaterThan(0.5);
    }
  });
});
