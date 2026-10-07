import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Nerves, LATENCY, type Thing } from '../src/pixel/nerves';
import type { EyeFrame } from '../src/cat3d/retina';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** a cat with its eyes 0.2 m up at the middle of the room, facing `yaw`; the things as a function
 *  of time; run for `secs`, calling `each` every step */
function watch(things: (t: number) => Thing[], secs: number, yaw: (t: number) => number = () => 0, each?: (n: Nerves, t: number) => void, n = new Nerves()) {
  const eye = V(0, 0.2, 0);
  const dt = 1 / 60;
  let t = n.time;
  const end = t + secs;
  for (; t < end - 1e-9; t += dt) {
    n.update(dt, eye, yaw(t), 0, things(t));
    each?.(n, t);
  }
  return n;
}

describe('what the cat sees, and what it makes of it', () => {
  it('a red dot behind it is not seen; turned round, it is, and its eyes go to it', () => {
    const dot = (): Thing[] => [{ id: 'dot', kind: 'dot', p: V(0.1, 0, -0.8) }];
    const n = watch(dot, 1);
    expect(n.unit('dot')!.vis).toBe(0);
    expect(n.attending).toBeNull();
    watch(dot, 0.6, () => Math.PI, undefined, n);
    expect(n.unit('dot')!.vis).toBeGreaterThan(0.8);
    expect(n.attending?.id).toBe('dot');
    expect(n.gaze.angleTo(V(0.1, -0.2, -0.8).normalize())).toBeLessThan(0.08);
  });

  it('hidden behind the plant pot it is not there for it; out from behind, it is', () => {
    const n = new Nerves();
    n.blockers = () => [{ c: V(0, 0, 0.5), r: 0.11, h: 0.24 }];
    watch(() => [{ id: 'dot', kind: 'dot', p: V(0, 0, 1) }], 1, () => 0, undefined, n);
    expect(n.unit('dot')!.vis).toBeLessThan(0.05);
    watch(() => [{ id: 'dot', kind: 'dot', p: V(0.4, 0, 1) }], 0.6, () => 0, undefined, n);
    expect(n.unit('dot')!.vis).toBeGreaterThan(0.5);
    expect(n.attending?.id).toBe('dot');
  });

  it('seen a moment late: a dot going steadily across is believed a little behind where it is', () => {
    let lag = 0;
    watch((t) => [{ id: 'dot', kind: 'dot', p: V(-0.6 + 0.4 * t, 0, 0.9) }], 2, () => 0, (n, t) => {
      if (t > 1.5) lag = Math.max(lag, -0.6 + 0.4 * t - n.unit("dot")!.belief.x);
    });
    // (0.4 m/s and the eye's lateness: about 4 cm, and not a great deal more)
    expect(lag).toBeGreaterThan(0.4 * LATENCY * 0.8);
    expect(lag).toBeLessThan(0.4 * LATENCY + 0.04);
  });

  it('swept across the room faster than the eye: lost on the way; when it stops, found again', () => {
    let lowest = 1, found = -1;
    const n = watch((t) => {
      const u = Math.max(0, Math.min(1, (t - 1) / 0.25));
      return [{ id: 'dot', kind: 'dot', p: V(-0.7 + 1.4 * u, 0, 0.8) }];
    }, 2.4, () => 0, (n, t) => {
      const d = n.unit('dot')!;
      if (t > 1 && t < 1.4) lowest = Math.min(lowest, d.conf);
      if (t > 1.25 && found < 0 && d.conf > 0.6 && d.belief.distanceTo(V(0.7, 0, 0.8)) < 0.05) found = t - 1.25;
    });
    // (it saw it go, not where: while it went, where it was is all but lost)
    expect(lowest).toBeLessThan(0.45);
    // (and once it stops, a moment and it is seen where it is)
    expect(found).toBeGreaterThan(LATENCY * 0.9);
    expect(found).toBeLessThan(0.45);
    expect(n.attending?.id).toBe('dot');
  });

  it('a short flick is seen landing: the eyes jump after it to where it stopped', () => {
    let found = -1;
    watch((t) => {
      const u = Math.max(0, Math.min(1, (t - 1) / 0.12));
      return [{ id: 'dot', kind: 'dot', p: V(-0.55 + 1.1 * u, 0, 0.9) }];
    }, 1.8, () => 0, (n, t) => {
      if (t > 1.12 && found < 0 && n.gaze.angleTo(V(0.55, -0.2, 0.9).normalize()) < 0.08) found = t - 1.12;
    });
    expect(found).toBeGreaterThan(LATENCY * 0.9);
    expect(found).toBeLessThan(0.4);
  });

  it('a toy that only sits there is soon nothing to look at; it moves, and its eyes are on it', () => {
    let onToy = 0, late = 0;
    const toyAt = (t: number) => (t < 20 ? V(0.3, 0, 0.7) : V(0.3 + 0.15 * Math.sin((t - 20) * 5), 0, 0.7));
    const n = new Nerves();
    n.fond = 0.2;
    watch((t) => [{ id: 'yarn', kind: 'toy', p: toyAt(t) }], 21, () => 0, (n, t) => {
      if (t < 3 && n.attending?.id === 'yarn') onToy += 1 / 60;
      if (t > 15 && t < 20 && n.attending?.id === 'yarn') late += 1 / 60;
    }, n);
    expect(onToy).toBeGreaterThan(1);
    expect(late).toBeLessThan(2);
    expect(n.attending?.id).toBe('yarn');
  });

  it('two things alike to look at: one at a time, not flickering between them', () => {
    let switches = 0, last: string | null = null;
    watch(() => [{ id: 'a', kind: 'toy', p: V(-0.3, 0, 0.8) }, { id: 'b', kind: 'toy', p: V(0.3, 0, 0.8) }], 10, () => 0, (n) => {
      const id = n.attending?.id ?? null;
      if (id && last && id !== last) switches++;
      if (id) last = id;
    });
    expect(switches).toBeLessThan(5);
  });

  it('the dot jumps well off to one side: the eyes jump to it, a little after', () => {
    let at = -1;
    watch((t) => [{ id: 'dot', kind: 'dot', p: t < 1 ? V(-0.4, 0, 0.9) : V(0.5, 0, 0.6) }], 1.6, () => 0, (n, t) => {
      if (t > 1 && at < 0 && n.gaze.angleTo(V(0.5, -0.2, 0.6).normalize()) < 0.1) at = t - 1;
    });
    expect(at).toBeGreaterThan(LATENCY);
    expect(at).toBeLessThan(0.35);
  });

  it('a long jump of the eyes is told (for the blink that goes with it); a little one is not', () => {
    let big = 0, small = 0;
    watch((t) => [{ id: 'dot', kind: 'dot', p: t < 1 ? V(-0.4, 0, 0.9) : V(0.5, 0, 0.6) }], 1.6, () => 0, (n, t) => { if (t > 1) big = Math.max(big, n.jump); });
    watch((t) => [{ id: 'dot', kind: 'dot', p: t < 1 ? V(0, 0, 0.9) : V(0.2, 0, 0.9) }], 1.6, () => 0, (n, t) => { if (t > 1) small = Math.max(small, n.jump); });
    expect(big).toBeGreaterThan(0.7);
    expect(small).toBeLessThan(0.35);
  });

  it('a dot that darts about builds a will to hunt it, which ebbs slowly when it is gone', () => {
    let peak = 0;
    const n = watch((t) => [{ id: 'dot', kind: 'dot', p: V(0.3 * Math.sin(t * 3), 0, 0.8 + 0.2 * Math.cos(t * 2)) }], 2, () => 0, (n) => { peak = Math.max(peak, n.hunt); });
    expect(peak).toBeGreaterThan(0.5);
    watch(() => [], 1, () => 0, undefined, n);
    expect(n.hunt).toBeGreaterThan(0.2);
    watch(() => [], 8, () => 0, undefined, n);
    expect(n.hunt).toBeLessThan(0.1);
  });

  it('you, just sitting there: looked at a few seconds, then not, then again (no stare without end)', () => {
    const n = new Nerves();
    n.fond = 0.6;
    const looks: number[] = [];
    let cur = 0, on = false;
    watch(() => [{ id: 'you', kind: 'you', p: V(0, 0.3, 1.5) }], 60, () => 0, (n) => {
      const now = n.attending?.id === 'you';
      if (now) cur += 1 / 60;
      else if (on) { looks.push(cur); cur = 0; }
      on = now;
    }, n);
    expect(looks.length).toBeGreaterThan(2);
    expect(Math.max(...looks)).toBeLessThan(12);
    expect(looks.reduce((a, b) => a + b, 0) / looks.length).toBeGreaterThan(1.5);
  });

  it('the red dot held still is watched most of the time: a thing like prey does not tire the eye so', () => {
    let on = 0;
    watch(() => [{ id: 'dot', kind: 'dot', p: V(0.2, 0, 0.8) }], 15, () => 0, (n, t) => { if (t > 1 && n.attending?.id === 'dot') on += 1 / 60; });
    expect(on).toBeGreaterThan(9);
  });

  it('something it knows nothing of moved, and is still now: its eyes stay there a moment, then let go', () => {
    const n = new Nerves();
    const eye = V(0, 0.2, 0);
    const D = Math.PI / 180, wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const frame = (t: number, x: number): EyeFrame => {
      const w = 48, h = 16, k = w * h;
      const F: EyeFrame = { lum: new Float32Array(k), w, h, az: new Float32Array(k), el: new Float32Array(k), t };
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const q = j * w + i, az = wrap((100 - ((i + 0.5) * 200) / w) * D), el = (38 - ((j + 0.5) * 77) / h) * D;
        F.az[q] = az;
        F.el[q] = el;
        F.lum[q] = 0.35 + 0.1 * Math.sin(az * 3) - (Math.abs(wrap(az - x)) < 0.09 && Math.abs(el - 0.2) < 0.09 ? 0.3 : 0);
      }
      return F;
    };
    let gone = -1, letGo = -1, moved = false;
    for (let i = 0; i < 60 * 5; i++) {
      const t = i / 60;
      // (a tassel swinging off to its right a second and a half, then still)
      if (i % 5 === 0) n.frame = frame(t, -0.8 + (t < 1.5 ? 0.1 * Math.sin(t * 9) : 0.1 * Math.sin(1.5 * 9)));
      n.update(1 / 60, eye, 0, 0, []);
      if (n.place === 'move') moved = true;
      if (moved && gone < 0 && n.sc.peak < 0.5) gone = t;
      if (gone > 0 && letGo < 0 && !n.place) letGo = t;
    }
    expect(moved).toBe(true);
    expect(gone).toBeGreaterThan(0);
    expect(letGo - gone).toBeGreaterThan(0.25);
    expect(letGo - gone).toBeLessThan(1.5);
  });

  it('asleep it sees nothing', () => {
    const n = new Nerves();
    n.awake = 0;
    watch(() => [{ id: 'dot', kind: 'dot', p: V(0, 0, 0.8) }], 1, () => 0, undefined, n);
    expect(n.attending).toBeNull();
  });

  it('come to say hello (you its business): its eyes mostly on you, a glance at a toy now and then', () => {
    // (you through the glass ahead, a toy mouse and the feathers lying about to one side; a while of
    // it, without and with the act's interest in you)
    const things = (): Thing[] => [
      { id: 'you', kind: 'you', p: V(0, 1.2, 2.5) },
      { id: 'mouse', kind: 'toy', p: V(-0.3, 0, 0.5) },
      { id: 'wand', kind: 'toy', p: V(0.3, 0, 0.7) },
    ];
    const share = (bias: number) => {
      const n = new Nerves();
      n.fond = 0.6;
      let on = 0, steps = 0;
      watch(things, 20, () => 0, (n) => {
        n.bias.set('you', bias);
        steps++;
        if (n.attending?.id === 'you') on++;
      }, n);
      return on / steps;
    };
    const idle = share(0), hello = share(0.35);
    expect(hello).toBeGreaterThan(0.6);
    expect(hello).toBeGreaterThan(idle + 0.15);
    // (not a stare fixed on you: it looks away now and then)
    expect(hello).toBeLessThan(0.98);
  });
});
