/**
 * Finger (and mouse) handling. Touches that start on the cat are petting contacts, sampled every
 * frame. Touches on a toy in the room move it about (and with a laser pointer in hand, every touch
 * is the pointer's). Touches on the empty room around it are gestures: tap, knock (double tap),
 * long press (pouring water), quick side-to-side scrubbing (shaking the kibble), a downward swipe
 * (scooping the litter), and a finger drawn sideways across it (looking round the room). Two
 * fingers pinched or spread take the view in or out, and moved together take it along.
 */
export interface Contact {
  id: number;
  sx: number; // css px
  sy: number;
  x0: number; // where it started (css px)
  y0: number;
  px: number; // painting px
  py: number;
  vx: number; // painting px / s (smoothed)
  vy: number;
  t0: number;
  last: number;
  onCat: boolean;
  startedOnCat: boolean;
  travel: number; // css px
  press: number; // 0..1
  maxSpeed: number;
}

export interface InputHandlers {
  /** is the cat under a screen point (held: a finger already stroking it, which a fingertip's
   *  width off its edge does not take off it) */
  hitCat(sx: number, sy: number, held?: boolean): boolean;
  toP(sx: number, sy: number): [number, number];
  catTouchStart(c: Contact): void;
  catTouchEnd(c: Contact, tap: boolean): void;
  glassTap(sx: number, sy: number): void;
  glassKnock(sx: number, sy: number): void;
  pourStart(sx: number, sy: number): void;
  pourEnd(): void;
  shake(strength: number): void;
  scoop(): void;
  longHold(sx: number, sy: number, onCat: boolean): void; // ~3 s still press
  hover(sx: number, sy: number): void;
  firstGesture(): void;
  /** a finger down on a toy in the room (not on the cat): true takes the touch for moving the toy,
   *  and then none of the glass's gestures */
  grabToy?(sx: number, sy: number, id: number, kind: string): boolean;
  /** something in hand that has every touch (a laser pointer: wherever a finger goes, the dot
   *  goes, on the cat as anywhere else): asked first, before the cat */
  takeAll?(sx: number, sy: number, id: number, kind: string): boolean;
  /** the finger moving the toy; letting go of it (tap: let go at once, barely moved) */
  dragToy?(sx: number, sy: number, id: number): void;
  releaseToy?(tap: boolean, id: number): void;
  /** a finger drawn sideways across the glass: looking round the room. lookStart: may it (true:
   *  the view goes with the finger from now on); lookMove: how far the finger went (css px, + to
   *  the right); lookEnd: let go (how fast it was going, css px/s), or called off (cancelled: it
   *  was scrubbing the glass after all) */
  lookStart?(): boolean;
  lookMove?(dx: number, dy: number): void;
  lookEnd?(v: number, cancelled: boolean, vy?: number): void;
  /** two fingers pinched or spread, or moved together: the view in or out about the point between
   *  them, and along with them. pinchStart: may they (true: the two fingers are the view's from
   *  now on, and nothing else's); pinch: how much further apart they are than last time (a ratio),
   *  where the point between them is now, and how far it went since (css px); pinchEnd: let go */
  pinchStart?(): boolean;
  pinch?(k: number, mx: number, my: number, dx: number, dy: number): void;
  pinchEnd?(): void;
  /** looking round goes up and down as well as along (the view in close): any way the finger goes */
  lookFree?(): boolean;
  /** a finger lifted, before anything is made of it (tap: it barely moved, as a tap does) */
  lifting?(tap: boolean): void;
  /** a finger that came down on the cat moved (from inside the touch) */
  stroking?(): void;
}

interface GlassTrack {
  lastDx: number;
  accum: number;
  reversals: number[];
  pouring: boolean;
  timer: number;
  holdTimer: number;
  /** the touch has hold of a toy */
  toy?: boolean;
  /** the finger is looking round the room (how fast it goes, css px/s, smoothed; when it last
   *  moved), or will not (it scrubbed) */
  look?: { v: number; t: number; vy: number } | null;
  noLook?: boolean;
  /** one of two fingers that took the view in or out (and, the other let go, nothing more) */
  pinched?: boolean;
}

export class PointerInput {
  readonly contacts = new Map<number, Contact>();
  private glass = new Map<number, GlassTrack>();
  private lastTap = { t: 0, x: 0, y: 0 };
  private gestured = false;
  /** two fingers down together: which, how far apart and where between them at first and last
   *  time, and whether they have the view yet */
  private two: { a: number; b: number; d0: number; mx0: number; my0: number; d: number; mx: number; my: number; on: boolean } | null = null;

  constructor(private el: HTMLElement, private h: InputHandlers) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e, false));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.up(e, true); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pressOf(e: PointerEvent) {
    if (e.pointerType === 'mouse') return 0.35;
    // real force where the hardware reports it, else contact size as a proxy
    if (e.pressure > 0 && e.pressure !== 0.5) return Math.min(1, e.pressure);
    const size = Math.max(e.width || 0, e.height || 0);
    return size > 0 ? Math.min(1, 0.2 + size / 70) : 0.4;
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    if (!this.gestured) {
      this.gestured = true;
      this.h.firstGesture();
    }
    const all = !!this.h.takeAll?.(e.clientX, e.clientY, e.pointerId, e.pointerType);
    const onCat = !all && this.h.hitCat(e.clientX, e.clientY);
    const [px, py] = this.h.toP(e.clientX, e.clientY);
    const c: Contact = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: e.clientX, y0: e.clientY, px, py, vx: 0, vy: 0,
      t0: e.timeStamp, last: e.timeStamp, onCat, startedOnCat: onCat, travel: 0,
      press: this.pressOf(e), maxSpeed: 0,
    };
    this.contacts.set(e.pointerId, c);
    if (this.contacts.size === 2 && !this.two) {
      const [a, b] = [...this.contacts.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      this.two = { a: a.id, b: b.id, d0: d, mx0: mx, my0: my, d, mx, my, on: false };
    }
    if (all) {
      this.glass.set(e.pointerId, { lastDx: 0, accum: 0, reversals: [], pouring: false, timer: 0, holdTimer: 0, toy: true });
      return;
    }
    const holdTimer = window.setTimeout(() => {
      const cc = this.contacts.get(e.pointerId);
      if (cc && cc.travel < 26) this.h.longHold(cc.sx, cc.sy, cc.onCat);
    }, 2600);
    if (onCat) {
      this.h.catTouchStart(c);
      this.glass.set(e.pointerId, { lastDx: 0, accum: 0, reversals: [], pouring: false, timer: 0, holdTimer });
    } else if (this.h.grabToy?.(e.clientX, e.clientY, e.pointerId, e.pointerType)) {
      clearTimeout(holdTimer);
      this.glass.set(e.pointerId, { lastDx: 0, accum: 0, reversals: [], pouring: false, timer: 0, holdTimer: 0, toy: true });
    } else {
      const g: GlassTrack = { lastDx: 0, accum: 0, reversals: [], pouring: false, timer: 0, holdTimer };
      g.timer = window.setTimeout(() => {
        const cc = this.contacts.get(e.pointerId);
        if (cc && !cc.startedOnCat && cc.travel < 14) {
          g.pouring = true;
          this.h.pourStart(cc.sx, cc.sy);
        }
      }, 520);
      this.glass.set(e.pointerId, g);
    }
  }

  private move(e: PointerEvent) {
    const c = this.contacts.get(e.pointerId);
    if (!c) {
      if (e.pointerType === 'mouse' && e.buttons === 0) this.h.hover(e.clientX, e.clientY);
      return;
    }
    const dt = Math.max(1, e.timeStamp - c.last) / 1000;
    const [px, py] = this.h.toP(e.clientX, e.clientY);
    const ivx = (px - c.px) / dt, ivy = (py - c.py) / dt;
    const k = Math.min(1, dt * 18);
    c.vx += (ivx - c.vx) * k;
    c.vy += (ivy - c.vy) * k;
    const dsx = e.clientX - c.sx, dsy = e.clientY - c.sy;
    c.travel += Math.hypot(dsx, dsy);
    c.sx = e.clientX;
    c.sy = e.clientY;
    c.px = px;
    c.py = py;
    c.last = e.timeStamp;
    c.press = this.pressOf(e);
    c.maxSpeed = Math.max(c.maxSpeed, Math.hypot(c.vx, c.vy));
    if (this.twoFingers(e.pointerId)) return;
    const g = this.glass.get(e.pointerId);
    if (g?.pinched) return;
    c.onCat = c.startedOnCat && this.h.hitCat(e.clientX, e.clientY, true);
    if (c.startedOnCat) this.h.stroking?.();

    if (!g || c.startedOnCat) return;
    if (g.toy) {
      this.h.dragToy?.(c.sx, c.sy, e.pointerId);
      return;
    }
    // (a pour begun by a timer that ran while the page was too busy to hear the finger move: by
    // the events' own times it was moving before the pour was due, and it is no pour after all)
    if (g.pouring && c.travel > 14 && e.timeStamp - c.t0 < 520) {
      g.pouring = false;
      this.h.pourEnd();
    }
    // (a finger moving over the glass is watched, as a mouse's pointer is)
    if (!g.look) this.h.hover(c.sx, c.sy);
    // side-to-side scrubbing: count direction reversals (and a finger that has gone back and forth
    // twice in a moment is scrubbing, not looking round: the view goes back where it was)
    if (Math.abs(dsx) > 0.5) {
      if (Math.sign(dsx) !== Math.sign(g.lastDx) && g.accum > 16) {
        g.reversals.push(e.timeStamp);
        g.accum = 0;
        const recent = g.reversals.filter((t) => e.timeStamp - t < 1300);
        g.reversals = recent;
        if (recent.length >= 2 && g.look) {
          g.look = null;
          this.h.lookEnd?.(0, true);
        }
        if (recent.length >= 2) g.noLook = true;
        if (recent.length >= 3) this.h.shake(Math.min(1, recent.length / 6));
      }
      g.accum += Math.abs(dsx);
      g.lastDx = dsx;
    }
    // drawn sideways across the glass: looking round the room, the view going with the finger
    if (g.look) {
      const free = !!this.h.lookFree?.();
      this.h.lookMove?.(dsx, free ? dsy : 0);
      const idt = Math.max(1, e.timeStamp - g.look.t) / 1000;
      g.look.v += (dsx / idt - g.look.v) * Math.min(1, idt * 12);
      g.look.vy += ((free ? dsy : 0) / idt - g.look.vy) * Math.min(1, idt * 12);
      g.look.t = e.timeStamp;
    } else if (!g.noLook && !g.pouring) {
      const dx = c.sx - c.x0, dy = c.sy - c.y0, free = !!this.h.lookFree?.();
      if ((free ? Math.hypot(dx, dy) > 18 : Math.abs(dx) > 30 && Math.abs(dx) > 2 * Math.abs(dy)) && this.h.lookStart?.()) {
        g.look = { v: 0, t: e.timeStamp, vy: 0 };
        clearTimeout(g.timer);
        clearTimeout(g.holdTimer);
        this.h.lookMove?.(dx, free ? dy : 0);
      }
    }
    if (c.travel > 14 && !g.pouring) clearTimeout(g.timer);
  }

  private up(e: PointerEvent, cancelled: boolean) {
    const c = this.contacts.get(e.pointerId);
    if (!c) return;
    this.contacts.delete(e.pointerId);
    const g = this.glass.get(e.pointerId);
    this.glass.delete(e.pointerId);
    if (g) {
      clearTimeout(g.timer);
      clearTimeout(g.holdTimer);
      if (g.pouring) this.h.pourEnd();
    }
    const T = this.two;
    if (T && (T.a === e.pointerId || T.b === e.pointerId)) {
      this.two = null;
      if (T.on) {
        this.h.pinchEnd?.();
        return;
      }
    }
    if (g?.pinched) return;
    const dur = e.timeStamp - c.t0;
    const tap = !cancelled && dur < 300 && c.travel < 14;
    this.h.lifting?.(!cancelled && dur < 700 && c.travel < 14);
    if (c.startedOnCat) {
      this.h.catTouchEnd(c, tap);
      return;
    }
    if (g?.toy) {
      this.h.releaseToy?.(tap, e.pointerId);
      return;
    }
    if (g?.look) {
      // (gone still before it let go: no glide)
      const still = e.timeStamp - g.look.t > 120;
      this.h.lookEnd?.(still ? 0 : g.look.v, cancelled, still ? 0 : g.look.vy);
      return;
    }
    // (a pour begun by a timer that ran while the page was too busy to hear the finger lift: by
    // the events' own times it was a tap, and is taken as one)
    if (cancelled || (g?.pouring && !tap)) return;
    // swipe down: mostly vertical, quick, long enough
    const totalDy = c.sy - c.y0;
    if (totalDy > 70 && dur < 700 && c.travel < totalDy * 1.5) {
      this.h.scoop();
      return;
    }
    if (tap) {
      const now = e.timeStamp;
      if (now - this.lastTap.t < 380 && Math.hypot(c.sx - this.lastTap.x, c.sy - this.lastTap.y) < 60) {
        this.h.glassKnock(c.sx, c.sy);
        this.lastTap.t = 0;
      } else {
        this.h.glassTap(c.sx, c.sy);
        this.lastTap = { t: now, x: c.sx, y: c.sy };
      }
    }
  }

  /** a finger of two that are down together moved: once they have gone apart or together far
   *  enough (or, off the cat, along together), they are the view's: whatever each was doing is
   *  let go of (a stroke ended, a toy put down, a look round stopped), and from then on they take
   *  the view in or out and along. True if the move was theirs */
  private twoFingers(id: number) {
    const T = this.two;
    if (!T || (T.a !== id && T.b !== id)) return false;
    const a = this.contacts.get(T.a), b = this.contacts.get(T.b);
    if (!a || !b) return false;
    const d = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
    if (!T.on) {
      // (two fingers stroking the cat side by side are a hand on it, not the view's)
      const along = !a.startedOnCat && !b.startedOnCat && Math.hypot(mx - T.mx0, my - T.my0) > 18;
      if (Math.abs(d - T.d0) < 22 && !along) return false;
      if (!this.h.pinchStart?.()) { this.two = null; return false; }
      T.on = true;
      for (const c of [a, b]) {
        const g = this.glass.get(c.id);
        if (g) {
          clearTimeout(g.timer);
          clearTimeout(g.holdTimer);
          if (g.pouring) { g.pouring = false; this.h.pourEnd(); }
          if (g.look) { g.look = null; this.h.lookEnd?.(0, false); }
          if (g.toy) this.h.releaseToy?.(false, c.id);
          g.pinched = true;
        } else this.glass.set(c.id, { lastDx: 0, accum: 0, reversals: [], pouring: false, timer: 0, holdTimer: 0, pinched: true });
        if (c.startedOnCat) {
          c.startedOnCat = c.onCat = false;
          this.h.catTouchEnd(c, false);
        }
      }
      T.d = d; T.mx = mx; T.my = my;
      return true;
    }
    this.h.pinch?.(d / Math.max(1, T.d), mx, my, mx - T.mx, my - T.my);
    T.d = d; T.mx = mx; T.my = my;
    return true;
  }

  /** fingers resting in the room now (not on the cat, nor holding a toy, nor pouring, nor taking
   *  the view anywhere): where on the screen */
  onGlass(): { sx: number; sy: number }[] {
    const out: { sx: number; sy: number }[] = [];
    for (const [id, c] of this.contacts) {
      const g = this.glass.get(id);
      if (!c.startedOnCat && g && !g.toy && !g.pouring && !g.look && !g.pinched) out.push({ sx: c.sx, sy: c.sy });
    }
    return out;
  }

  /** contacts currently resting on the cat */
  onCat(): Contact[] {
    const out: Contact[] = [];
    for (const c of this.contacts.values()) if (c.onCat) out.push(c);
    return out;
  }

  get touching() {
    return this.contacts.size > 0;
  }
}
