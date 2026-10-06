import { describe, it, expect } from 'vitest';
import { PointerInput, type InputHandlers, type Contact } from '../src/input/pointer';

// (the input's timers are the window's)
(globalThis as unknown as { window: unknown }).window ??= globalThis;

describe('a finger brought to rest on the cat', () => {
  it('is still, a moment after its last move: not going on at the speed it had', () => {
    const h = new Proxy({ hitCat: () => true, toP: (x: number, y: number) => [x, y] } as Record<string, unknown>,
      { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as InputHandlers;
    const el = { addEventListener() {}, setPointerCapture() {} } as unknown as HTMLElement;
    const input = new PointerInput(el, h) as unknown as PointerInput & { down(e: object): void; move(e: object): void };
    let t = 1000;
    const ev = (x: number) => ({ preventDefault() {}, pointerId: 3, clientX: x, clientY: 100, timeStamp: t, pointerType: 'touch', pressure: 0.5, width: 20, height: 20, buttons: 1 });
    input.down(ev(100));
    // (a quick stroke, 600 px a second, then the finger held there: no more moves)
    for (let i = 1; i <= 20; i++) { t += 16; input.move(ev(100 + 9.6 * i)); }
    const c = input.onCat()[0] as Contact;
    input.settle(t + 16);
    expect(c.vx).toBeGreaterThan(400);
    // (a fifth of a second on, nothing left of it)
    input.settle(t + 200);
    expect(Math.abs(c.vx)).toBeLessThan(60);
    input.settle(t + 400);
    expect(Math.abs(c.vx)).toBeLessThan(5);
    // (and moving again, it is its new speed from there)
    t += 420;
    input.move(ev(292 + 2));
    expect(Math.abs(c.vx)).toBeLessThan(40);
  });
});
