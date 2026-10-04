import { describe, it, expect, beforeAll } from 'vitest';

/** the phone's turn as the sensor gives it (degrees), at a time (s) */
type Turn = { beta: number; gamma: number; timeStamp: number };

describe('the phone tipped, as an eye moved off to the side of a window', () => {
  let MotionInput: typeof import('../src/input/motion').MotionInput;
  beforeAll(async () => {
    // (no sensors here: a window with nothing in it, held upright)
    Object.assign(globalThis, { window: { addEventListener() {} }, screen: { orientation: { angle: 0 } } });
    ({ MotionInput } = await import('../src/input/motion'));
  });
  const feed = (mi: object, turns: Turn[]) => {
    for (const t of turns) (mi as unknown as { turn(e: Turn): void }).turn({ ...t, timeStamp: t.timeStamp * 1000 });
  };

  it('measured from the way it has been held: tipped, it reads so; held there, it settles back', () => {
    const mi = new MotionInput();
    const held: Turn[] = [];
    for (let i = 0; i < 60; i++) held.push({ beta: 70, gamma: 3, timeStamp: i / 30 });
    feed(mi, held);
    expect(Math.abs(mi.tiltX)).toBeLessThan(0.05);
    expect(Math.abs(mi.tiltY)).toBeLessThan(0.05);
    // the right edge away from you and the top toward you
    feed(mi, [{ beta: 82, gamma: 15, timeStamp: 2.05 }]);
    expect(mi.tiltX).toBeGreaterThan(0.5);
    expect(mi.tiltY).toBeGreaterThan(0.5);
    // held so a good while: still is the middle again
    const later: Turn[] = [];
    for (let i = 0; i < 400; i++) later.push({ beta: 82, gamma: 15, timeStamp: 2.1 + i / 30 });
    feed(mi, later);
    expect(Math.abs(mi.tiltX)).toBeLessThan(0.1);
    expect(Math.abs(mi.tiltY)).toBeLessThan(0.1);
  });

  it('on its side: across the screen is the sensor up and down', () => {
    (globalThis as unknown as { screen: { orientation: { angle: number } } }).screen.orientation.angle = 90;
    const mi = new MotionInput();
    const held: Turn[] = [];
    for (let i = 0; i < 60; i++) held.push({ beta: 0, gamma: -60, timeStamp: i / 30 });
    feed(mi, held);
    feed(mi, [{ beta: 12, gamma: -60, timeStamp: 2.05 }]);
    expect(mi.tiltX).toBeGreaterThan(0.5);
    expect(Math.abs(mi.tiltY)).toBeLessThan(0.1);
    (globalThis as unknown as { screen: { orientation: { angle: number } } }).screen.orientation.angle = 0;
  });
});
