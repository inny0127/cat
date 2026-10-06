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
