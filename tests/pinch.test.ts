import { describe, it, expect } from 'vitest';
import { PointerInput, type InputHandlers } from '../src/input/pointer';

// (the input's timers are the window's)
(globalThis as unknown as { window: unknown }).window ??= globalThis;

/** two fingers on the screen: the view's (in or out, and along), and nothing else's */
function hand(onCat: (x: number) => boolean) {
  const said: string[] = [];
  const zoom = { k: 1, mx: 0, my: 0, dx: 0, dy: 0 };
  const h = new Proxy({
    hitCat: (x: number) => onCat(x),
    toP: (x: number, y: number) => [x, y],
    catTouchStart: () => said.push('pet'),
    catTouchEnd: () => said.push('pet over'),
    glassTap: () => said.push('tap'),
    glassKnock: () => said.push('knock'),
    lookStart: () => { said.push('look'); return true; },
    pinchStart: () => { said.push('pinch'); return true; },
    pinch: (k: number, mx: number, my: number, dx: number, dy: number) => { zoom.k *= k; zoom.mx = mx; zoom.my = my; zoom.dx += dx; zoom.dy += dy; },
    pinchEnd: () => said.push('pinch over'),
    twoTapTwice: () => said.push('two taps'),
  } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as InputHandlers;
  const el = { addEventListener() {}, setPointerCapture() {} } as unknown as HTMLElement;
  const input = new PointerInput(el, h) as unknown as { down(e: object): void; move(e: object): void; up(e: object, c: boolean): void; onCat(): unknown[] };
  let t = 0;
  const ev = (id: number, x: number, y: number) => ({ preventDefault() {}, pointerId: id, clientX: x, clientY: y, timeStamp: t, pointerType: 'touch', pressure: 0.5, width: 20, height: 20, buttons: 1 });
  /** both fingers from where they are to where they go, in steps */
  const two = (a0: [number, number], b0: [number, number], a1: [number, number], b1: [number, number], n = 10) => {
    t += 1000;
    input.down(ev(1, ...a0));
    input.down(ev(2, ...b0));
    for (let i = 1; i <= n; i++) {
      t += 16;
      const u = i / n;
      input.move(ev(1, a0[0] + (a1[0] - a0[0]) * u, a0[1] + (a1[1] - a0[1]) * u));
      input.move(ev(2, b0[0] + (b1[0] - b0[0]) * u, b0[1] + (b1[1] - b0[1]) * u));
    }
    t += 16;
    input.up(ev(1, ...a1), false);
    t += 40;
    input.up(ev(2, ...b1), false);
  };
  /** both fingers down together and up again, still, after `gap` ms */
  const tapTwo = (a: [number, number], b: [number, number], gap = 200) => {
    t += gap;
    input.down(ev(1, ...a));
    t += 20;
    input.down(ev(2, ...b));
    t += 90;
    input.up(ev(1, ...a), false);
    t += 15;
    input.up(ev(2, ...b), false);
  };
  return { said, zoom, two, tapTwo, input };
}

describe('two fingers take the view in and out', () => {
  it('spread apart over the room: the view goes in, about the point between them; let go, nothing else (no tap)', () => {
    const f = hand(() => false);
    f.two([180, 400], [220, 400], [80, 400], [320, 400]);
    expect(f.said).toEqual(['pinch', 'pinch over']);
    // (the second finger's 40 px became 240: six times as far apart as at first, a little less for
    // the first steps it took to know it for a pinch)
    expect(f.zoom.k).toBeGreaterThan(3);
    expect(f.zoom.mx).toBeCloseTo(200, 0);
    expect(f.zoom.my).toBeCloseTo(400, 0);
  });

  it('pinched together: the view goes out', () => {
    const f = hand(() => false);
    f.two([60, 400], [340, 400], [170, 400], [230, 400]);
    expect(f.zoom.k).toBeLessThan(0.5);
  });

  it('moved along together over the room: the view goes with them', () => {
    const f = hand(() => false);
    f.two([150, 400], [250, 400], [150, 300], [250, 300]);
    expect(f.said).toEqual(['pinch', 'pinch over']);
    expect(f.zoom.dy).toBeLessThan(-60);
    expect(Math.abs(f.zoom.k - 1)).toBeLessThan(0.05);
  });

  it('two fingers stroking the cat side by side are a hand on it, not the view\'s', () => {
    const f = hand(() => true);
    f.two([150, 400], [190, 400], [150, 470], [190, 470]);
    expect(f.said.filter((s) => s === 'pinch')).toHaveLength(0);
    expect(f.said.filter((s) => s === 'pet')).toHaveLength(2);
  });

  it('two fingers tapped together twice running (the window on its mind): nothing else, on the glass or on the cat', () => {
    const f = hand(() => false);
    f.tapTwo([150, 400], [230, 420], 1000);
    f.tapTwo([152, 402], [228, 418]);
    expect(f.said).toEqual(['two taps']);
    const g = hand(() => true);
    g.tapTwo([150, 400], [230, 420], 1000);
    g.tapTwo([152, 402], [228, 418]);
    expect(g.said.filter((x) => x === 'two taps')).toHaveLength(1);
    expect(g.said.filter((x) => x === 'pinch')).toHaveLength(0);
    // (once only, or too far apart in time: not)
    const h = hand(() => false);
    h.tapTwo([150, 400], [230, 420], 1000);
    h.tapTwo([150, 400], [230, 420], 900);
    expect(h.said).toEqual([]);
  });

  it('spread over the cat: the strokes they began are over, and the view goes in', () => {
    const f = hand(() => true);
    f.two([180, 400], [220, 400], [80, 400], [320, 400]);
    expect(f.said).toEqual(['pet', 'pet', 'pinch', 'pet over', 'pet over', 'pinch over']);
    expect(f.input.onCat()).toHaveLength(0);
  });
});
