import { describe, it, expect } from 'vitest';
import { Brain } from '../src/sim/brain';
import { newCat } from '../src/sim/state';
import type { Zone } from '../src/sim/zones';

/** a cat awake in its bed and a hand on it, stroking at a place, a way: the hints it gives */
function stroked(zone: Zone, vx: number, grain: [number, number] = [1, 0], seconds = 8) {
  const s = newCat(Date.now() - 60_000);
  s.trust = 0.15;
  const said: string[] = [];
  const quiet = (own: Record<string, unknown> = {}) =>
    new Proxy(own, { get: (t, k) => (k in t ? t[k as string] : () => {}), set: () => true });
  const senses = { zoneAt: () => zone, grainAt: () => grain, headScreen: () => ({ x: 0, y: 0 }), viewW: () => 390, motionShake: false };
  const b = new Brain(s, quiet() as never, quiet() as never, quiet() as never, quiet({ show: (t: string) => said.push(t) }) as never, senses as never);
  b.toAwake('rest');
  const c = { id: 1, sx: 100, sy: 100, x0: 100, y0: 100, px: 200, py: 200, vx, vy: 0, t0: 0, last: 0, onCat: true, startedOnCat: true, travel: 50, press: 0.5, maxSpeed: Math.abs(vx) };
  for (let t = 0; t < seconds; t += 0.05) b.update(0.05, t, [c as never]);
  // (and the hand gone a moment, for what was said after it)
  for (let t = seconds; t < seconds + 2; t += 0.05) b.update(0.05, t, []);
  return said;
}

describe('a word on why it is annoyed', () => {
  it('stroked against its fur: told to go from the head to the tail', () => {
    const said = stroked('back', -150, [1, 0]);
    expect(said.some((t) => t.includes('거꾸로'))).toBe(true);
  });
  it('its tail held: told it does not like that', () => {
    const said = stroked('tail', 100, [1, 0]);
    expect(said.some((t) => t.includes('꼬리'))).toBe(true);
  });
  it('stroked slowly the way its fur lies, on its head: nothing to say', () => {
    const said = stroked('head', 100, [1, 0]);
    expect(said.filter((t) => t.includes('싫어') || t.includes('귀찮'))).toEqual([]);
  });
  it('said once only, however often it happens', () => {
    const s = newCat(Date.now());
    expect(s.hints['why-tail']).toBeUndefined();
    const first = stroked('tail', 100);
    expect(first.filter((t) => t.includes('꼬리')).length).toBe(1);
  });
});
