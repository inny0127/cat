import { describe, it, expect } from 'vitest';
import { PointerInput, type InputHandlers } from '../src/input/pointer';

// (the input's timers are the window's)
(globalThis as unknown as { window: unknown }).window ??= globalThis;

/** the glass's gestures as a finger makes them: what each handler heard */
function finger() {
  const heard: string[] = [];
  let lookDx = 0, lookV = 0, lookOn = false;
  const h: InputHandlers = {
    hitCat: () => false,
    toP: (x, y) => [x, y],
    catTouchStart: () => heard.push('pet'),
    catTouchEnd: () => {},
    glassTap: () => heard.push('tap'),
    glassKnock: () => heard.push('knock'),
    pourStart: () => heard.push('pour'),
    pourEnd: () => {},
    shake: () => heard.push('shake'),
    scoop: () => heard.push('scoop'),
    longHold: () => heard.push('hold'),
    hover: () => {},
    firstGesture: () => {},
    lookStart: () => { heard.push('look'); lookOn = true; return true; },
    lookMove: (dx) => { lookDx += dx; },
    lookEnd: (v, cancelled) => { heard.push(cancelled ? 'look off' : 'look end'); lookV = v; lookOn = false; },
  };
  const el = { addEventListener() {}, setPointerCapture() {} } as unknown as HTMLElement;
  const input = new PointerInput(el, h) as unknown as { down(e: object): void; move(e: object): void; up(e: object, c: boolean): void; onGlass(): unknown[] };
  let t = 0;
  const ev = (x: number, y: number) => ({ preventDefault() {}, pointerId: 1, clientX: x, clientY: y, timeStamp: t, pointerType: 'touch', pressure: 0.5, width: 20, height: 20, buttons: 1 });
  /** a stroke through the points, a step each 16 ms */
  const stroke = (pts: [number, number][], hold = 0) => {
    t += 1000;
    input.down(ev(pts[0][0], pts[0][1]));
    for (const [x, y] of pts.slice(1)) { t += 16; input.move(ev(x, y)); }
    t += hold;
    input.up(ev(pts[pts.length - 1][0], pts[pts.length - 1][1]), false);
  };
  return { heard, stroke, input, get lookDx() { return lookDx; }, get lookV() { return lookV; }, get lookOn() { return lookOn; } };
}

const line = (x0: number, y0: number, x1: number, y1: number, n: number) =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n] as [number, number]);

describe('a finger drawn sideways across the glass: looking round the room', () => {
  it('the view goes with the finger all the way, and glides on the way it was going when let go', () => {
    const f = finger();
    f.stroke(line(300, 400, 120, 410, 12));
    expect(f.heard).toEqual(['look', 'look end']);
    expect(f.lookDx).toBeCloseTo(-180, 0);
    // (180 px in about a fifth of a second)
    expect(f.lookV).toBeLessThan(-600);
  });
  it('held still a moment before letting go: no glide', () => {
    const f = finger();
    f.stroke(line(100, 400, 260, 400, 10), 300);
    expect(f.heard).toEqual(['look', 'look end']);
    expect(f.lookV).toBe(0);
  });
  it('scrubbing the glass is still for the kibble, and the view goes back where it was', () => {
    const f = finger();
    const pts: [number, number][] = [];
    for (let k = 0; k < 6; k++) pts.push(...line(k % 2 ? 260 : 140, 400, k % 2 ? 140 : 260, 400, 4).slice(k ? 1 : 0));
    f.stroke(pts);
    expect(f.heard).toContain('shake');
    expect(f.heard).toContain('look off');
    expect(f.heard).not.toContain('look end');
  });
  it('a swipe down is still the litter, a tap a tap, a little wiggle a finger on the glass for the cat', () => {
    const f = finger();
    f.stroke(line(200, 300, 205, 420, 8));
    f.stroke([[200, 300], [202, 301]]);
    expect(f.heard).toEqual(['scoop', 'tap']);
    const g = finger();
    g.stroke(line(200, 400, 222, 402, 6));
    expect(g.heard).not.toContain('look');
  });
});
