import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';
import { yawn, type Ctx } from '../src/pixel/behave';

/** one yawn, frame by frame: how wide the mouth, when, and how long the whole of it */
function aYawn(seed: number) {
  let r = seed;
  const rnd = Math.random;
  Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  try {
    const m = new Motor();
    m.snap('sit');
    const c = { m, sound: () => {}, viewer: () => new THREE.Vector3(0, 1.4, 3) } as unknown as Ctx;
    const act = yawn(false);
    const f: { t: number; jaw: number; eye: number }[] = [];
    let t = 0;
    for (; t < 8; t += 1 / 60) {
      const going = act.update(1 / 60, c);
      m.update(1 / 60);
      f.push({ t, jaw: m.pose.jaw, eye: m.pose.eyeOpen });
      if (!going) break;
    }
    act.stop(c);
    const top = f.reduce((a, b) => (b.jaw > a.jaw ? b : a));
    return { t, wide: top.jaw, at: top.t, f };
  } finally { Math.random = rnd; }
}

describe('a yawn', () => {
  it('the mouth slow to open and quicker to shut, the eyes squeezed at the full of it', () => {
    const { f, at, wide } = aYawn(4);
    expect(wide).toBeGreaterThan(0.4);
    const half = (from: number, to: number, dir: 1 | -1) => f.filter((x) => x.t >= from && x.t <= to).findIndex((x) => dir * (x.jaw - wide / 2) > 0);
    const opening = f.findIndex((x) => x.jaw > wide * 0.9) - f.findIndex((x) => x.jaw > wide * 0.1);
    const closing = f.findIndex((x, i) => i > f.findIndex((y) => y.t >= at) && x.jaw < wide * 0.1) - f.findLastIndex((x) => x.jaw > wide * 0.9);
    expect(opening).toBeGreaterThan(closing);
    expect(half(0, at, 1)).toBeGreaterThan(0);
    expect(f.find((x) => x.t >= at)!.eye).toBeLessThan(0.4);
  });
  it('never quite the same twice: how wide, and how long', () => {
    const ys = [1, 2, 3, 5, 8, 13].map(aYawn);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(ys.map((y) => y.wide))).toBeGreaterThan(0.15);
    expect(spread(ys.map((y) => y.t))).toBeGreaterThan(0.5);
  });
});
