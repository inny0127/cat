/**
 * Finger (and mouse) handling. Touches that start on the cat are petting contacts, sampled every
 * frame. Touches on a toy in the room move it about (and with a laser pointer in hand, every touch
 * is the pointer's). Touches on the empty "glass" around it are gestures: tap, knock (double tap),
 * long press (pouring water), quick side-to-side scrubbing (shaking the kibble), and a downward
 * swipe (scooping the litter).
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
  hitCat(sx: number, sy: number): boolean;
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
}

export class PointerInput {
  readonly contacts = new Map<number, Contact>();
  private glass = new Map<number, GlassTrack>();
  private lastTap = { t: 0, x: 0, y: 0 };
  private gestured = false;

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
    c.onCat = c.startedOnCat && this.h.hitCat(e.clientX, e.clientY);

    const g = this.glass.get(e.pointerId);
    if (!g || c.startedOnCat) return;
    if (g.toy) {
      this.h.dragToy?.(c.sx, c.sy, e.pointerId);
      return;
    }
    // side-to-side scrubbing: count direction reversals
    if (Math.abs(dsx) > 0.5) {
      if (Math.sign(dsx) !== Math.sign(g.lastDx) && g.accum > 16) {
        g.reversals.push(e.timeStamp);
        g.accum = 0;
        const recent = g.reversals.filter((t) => e.timeStamp - t < 1300);
        g.reversals = recent;
        if (recent.length >= 3) this.h.shake(Math.min(1, recent.length / 6));
      }
      g.accum += Math.abs(dsx);
      g.lastDx = dsx;
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
    const dur = e.timeStamp - c.t0;
    const tap = !cancelled && dur < 300 && c.travel < 14;
    if (c.startedOnCat) {
      this.h.catTouchEnd(c, tap);
      return;
    }
    if (g?.toy) {
      this.h.releaseToy?.(tap, e.pointerId);
      return;
    }
    if (cancelled || g?.pouring) return;
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
