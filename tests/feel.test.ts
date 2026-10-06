import { describe, it, expect, vi, afterEach } from 'vitest';
import { Haptic } from '../src/platform/haptics';
import { PointerInput, type InputHandlers } from '../src/input/pointer';

// (the input's timers are the window's)
(globalThis as unknown as { window: unknown }).window ??= globalThis;

/** just enough of an element: what it was made, what is in it and after it, its click listeners */
class El {
  style = { cssText: '' };
  attrs: Record<string, string> = {};
  children: El[] = [];
  type = '';
  tabIndex = 0;
  after: El | null = null;
  clicks = 0;
  private on: Record<string, ((e: unknown) => void)[]> = {};
  constructor(readonly tag: string) {}
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  appendChild(c: El) { this.children.push(c); c.parent = this; return c; }
  addEventListener(k: string, f: (e: unknown) => void) { (this.on[k] ??= []).push(f); }
  insertAdjacentElement(_where: string, el: El) { this.after = el; return el; }
  blur() {}
  parent: El | null = null;
  checked = false;
  /** a click on it (a finger's, or from script), up through what it is in: whether it went
   *  through, not stopped. A label's goes on to what is in it (the switch), as a browser's does,
   *  and that click too comes back up through the label; a switch's flips it */
  fire(trusted: boolean, target: El = this): boolean {
    let stopped = false;
    const e = { isTrusted: trusted, target, preventDefault: () => { stopped = true; } };
    for (let at: El | null = this; at; at = at.parent) for (const f of at.on.click ?? []) f(e);
    if (stopped) return false;
    if (this.tag === 'label' && this.children[0]) return this.children[0].fire(trusted);
    if (this.tag === 'input') this.checked = !this.checked;
    return true;
  }
  click() { this.clicks++; this.fire(false); }
}

let clock = 1000;
function phone(ios: boolean) {
  const vibrated: unknown[] = [];
  vi.stubGlobal('navigator', ios
    ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }
    : { userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux', maxTouchPoints: 5, vibrate: (p: unknown) => { vibrated.push(p); return true; } });
  vi.stubGlobal('document', { createElement: (t: string) => new El(t), body: new El('body') });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  return { haptic: new Haptic(), vibrated };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('felt through the glass on an iPhone (a web page: no vibrate, only a switch ticking)', () => {
  it('the finger touches a see-through label over the picture, with a hidden switch in it', () => {
    const { haptic } = phone(true);
    const canvas = new El('canvas');
    const pad = haptic.surface(canvas as unknown as HTMLElement) as unknown as El;
    expect(pad.tag).toBe('label');
    expect(canvas.after).toBe(pad);
    expect(pad.children[0].attrs.switch).toBe('');
    expect(pad.children[0].style.cssText).toContain('visibility:hidden');
  });
  it('a tap the app answers with a tap to feel: the tap\'s own click flips the switch (it ticks); any other tap: not', () => {
    const { haptic } = phone(true);
    const pad = haptic.surface(new El('canvas') as unknown as HTMLElement) as unknown as El;
    const sw = pad.children[0];
    haptic.lifted();
    haptic.tap('light');
    clock += 30;
    expect(pad.fire(true)).toBe(true);
    expect(sw.checked).toBe(true);
    // (no click from script for it: the tap's own is the one that ticks)
    expect(pad.clicks).toBe(0);
    clock += 1000;
    haptic.lifted();
    clock += 30;
    expect(pad.fire(true)).toBe(false);
    expect(sw.checked).toBe(true);
  });
  it('a tap asked for at the lift but the click long after: not flipped', () => {
    const { haptic } = phone(true);
    const pad = haptic.surface(new El('canvas') as unknown as HTMLElement) as unknown as El;
    haptic.lifted();
    haptic.tapSoon('medium');
    clock += 600;
    expect(pad.fire(true)).toBe(false);
  });
  it('a tap to feel with no tap being lifted: from script (it ticked so until iOS 26.5)', () => {
    const { haptic } = phone(true);
    const pad = haptic.surface(new El('canvas') as unknown as HTMLElement) as unknown as El;
    haptic.tap('heavy');
    expect(pad.clicks).toBe(1);
    expect(pad.children[0].checked).toBe(true);
    clock += 30;
    expect(pad.fire(true)).toBe(false);
  });
  it('purring under a stroking finger: ticks as it moves, quicker the more it purrs; none once it stops', () => {
    const { haptic } = phone(true);
    const pad = haptic.surface(new El('canvas') as unknown as HTMLElement) as unknown as El;
    const ticks = (level: number) => {
      haptic.purr(level);
      const n0 = pad.clicks;
      for (let t = 0; t < 1000; t += 16) { clock += 16; haptic.stroke(); }
      return pad.clicks - n0;
    };
    const soft = ticks(0.3), loud = ticks(0.95);
    expect(soft).toBeGreaterThanOrEqual(5);
    expect(loud).toBeGreaterThan(soft);
    expect(loud).toBeLessThanOrEqual(12);
    expect(ticks(0)).toBe(0);
  });
});

describe('felt through the glass on Android (vibrate)', () => {
  it('the picture itself is what the finger touches; a tap is a buzz long enough to feel', () => {
    const { haptic, vibrated } = phone(false);
    const canvas = new El('canvas');
    expect(haptic.surface(canvas as unknown as HTMLElement)).toBe(canvas);
    expect(canvas.after).toBe(null);
    haptic.tap('light');
    expect(vibrated[0]).toBeGreaterThanOrEqual(15);
  });
});

describe('the input says when a finger lifts, and when one moves on the cat', () => {
  function finger(onCat: (x: number) => boolean) {
    const said: string[] = [];
    const h = new Proxy({
      hitCat: (x: number) => onCat(x),
      toP: (x: number, y: number) => [x, y],
      lifting: (tap: boolean) => said.push(tap ? 'lift tap' : 'lift'),
      stroking: () => { if (said[said.length - 1] !== 'stroke') said.push('stroke'); },
      lookStart: () => false,
    } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as InputHandlers;
    const el = { addEventListener() {}, setPointerCapture() {} } as unknown as HTMLElement;
    const input = new PointerInput(el, h) as unknown as { down(e: object): void; move(e: object): void; up(e: object, c: boolean): void };
    let t = 0;
    const ev = (x: number, y: number) => ({ preventDefault() {}, pointerId: 1, clientX: x, clientY: y, timeStamp: t, pointerType: 'touch', pressure: 0.5, width: 20, height: 20, buttons: 1 });
    const stroke = (pts: [number, number][]) => {
      t += 1000;
      input.down(ev(...pts[0]));
      for (const p of pts.slice(1)) { t += 16; input.move(ev(...p)); }
      input.up(ev(...pts[pts.length - 1]), false);
    };
    return { said, stroke };
  }
  it('a tap on the cat, a stroke along it, a swipe over the glass', () => {
    const f = finger((x) => x < 200);
    f.stroke([[100, 300], [101, 300]]);
    f.stroke([[60, 300], [90, 302], [120, 304], [150, 306]]);
    f.stroke([[300, 300], [302, 340], [303, 380], [304, 420]]);
    expect(f.said).toEqual(['stroke', 'lift tap', 'stroke', 'lift', 'lift']);
  });
});
