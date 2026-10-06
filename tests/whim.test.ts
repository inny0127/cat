import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Whim, GOAL, type Eyes } from '../src/pixel/whim';
import type { Act, Option } from '../src/pixel/behave';

const act = (name: string): Act => ({ name, update: () => true, stop: () => {} });
const opt = (key: string, w: number, about?: string, at?: THREE.Vector3): Option => ({ key, w, about, at, make: () => (key === 'still' ? null : act(key)) });

/** eyes on a thing (or nothing), and how well each thing is seen */
function eyes(on: string | null = null, vis: Record<string, number> = {}): Eyes & { on: string | null; forgot: string[] } {
  return {
    on,
    forgot: [],
    get attending() { return this.on ? { id: this.on, a: 0.9 } : null; },
    unit(id: string) { return id in vis ? { vis: vis[id] } : null; },
    forget(id: string) { this.forgot.push(id); },
  };
}

/** a steady stream of numbers, the same each run */
function seeded(seed = 7) {
  let r = seed;
  return () => ((r = (r * 16807) % 2147483647) / 2147483647);
}

/** run a whim for `secs` at 60 frames a second; what it began, in order */
function run(w: Whim, opts: Option[], E: Eyes, secs: number, each?: (t: number) => void) {
  const out: { key: string; t: number }[] = [];
  const dt = 1 / 60;
  for (let t = 0; t < secs; t += dt) {
    each?.(t);
    const r = w.update(dt, () => opts, E);
    if (r) out.push({ key: r.o.key, t });
  }
  return out;
}

describe('what comes into its head (whim)', () => {
  it('as often, and in the same proportions, as its moods say', () => {
    const opts = [opt('yawn', 1), opt('groom', 2), opt('still', 1)];
    const got = run(new Whim(seeded(3)), opts, eyes(), 4000);
    const n = (k: string) => got.filter((g) => g.key === k).length;
    // (one every twelve seconds or so, give or take the moments at its ease after each)
    expect(got.length).toBeGreaterThan(4000 / 20);
    expect(got.length).toBeLessThan(4000 / 12);
    expect(n('groom') / n('yawn')).toBeGreaterThan(1.5);
    expect(n('groom') / n('yawn')).toBeLessThan(2.6);
    // (never one straight after another)
    for (let i = 1; i < got.length; i++) expect(got[i].t - got[i - 1].t).toBeGreaterThan(1);
  });

  it('its eyes on the thing an urge is about: that urge many times stronger', () => {
    const opts = [opt('play', 0.5, 'yarn'), opt('groom', 0.5), opt('still', 1.5)];
    const blind = run(new Whim(seeded(5)), opts, eyes(null, { yarn: 1 }), 3000).filter((g) => g.key === 'play').length;
    const looking = run(new Whim(seeded(5)), opts, eyes('yarn', { yarn: 1 }), 3000).filter((g) => g.key === 'play').length;
    expect(looking).toBeGreaterThan(3 * blind);
  });

  it('a thing in sight is looked at before it is gone after; begun once the eyes have been on it a moment', () => {
    const w = new Whim(seeded(11));
    const E = eyes(null, { yarn: 1 });
    // (only the one urge, and nothing else in the world)
    const opts = [opt('play', 1, 'yarn')];
    let first = -1, began = -1;
    run(w, opts, E, 60, (t) => {
      if (w.intent && first < 0) first = t;
      // its eyes get there half a second after it has it in mind
      if (first >= 0 && t - first > 0.5) E.on = 'yarn';
    }).forEach((g) => { if (began < 0) began = g.t; });
    expect(first).toBeGreaterThan(0);
    expect(began - first).toBeGreaterThan(0.5 + 0.3 - 0.02);
    expect(began - first).toBeLessThan(0.5 + 1.4 + 0.05);
  });

  it('something else holding its eyes the while: forgotten', () => {
    const w = new Whim(seeded(11));
    const E = eyes('hand', { yarn: 1, hand: 1 });
    const got = run(w, [opt('play', 1, 'yarn')], E, 4, () => {});
    // (it had it in mind, never looked, and let it go)
    expect(got.length).toBe(0);
    run(w, [opt('play', 1, 'yarn')], E, 30, () => {});
    expect(w.intent === null || w.intent.t <= 3).toBe(true);
  });

  it('a place round behind it, out of sight: it knows where it is, and goes', () => {
    const w = new Whim(seeded(2));
    const E = eyes(null, { [GOAL]: 0 });
    const got = run(w, [opt('box', 1, undefined, new THREE.Vector3(0, 0, -1))], E, 60);
    expect(got.length).toBeGreaterThan(0);
    expect(got[0].key).toBe('box');
    // (and the place is let go of from its mind once it is off)
    expect(E.forgot).toContain(GOAL);
  });

  it('what is about nothing in particular is done at once', () => {
    const w = new Whim(seeded(4));
    run(w, [opt('yawn', 1)], eyes(), 120, () => expect(w.intent).toBeNull());
  });
});
