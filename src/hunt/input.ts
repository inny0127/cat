import type { Intent } from './cat';

/**
 * Fingers and keys to what the cat is asked to do. On a touch screen: the left half a stick
 * (wherever the thumb comes down; pushed a little, a creep; all the way, a dash), the right half
 * to look round (dragged); the buttons: the pounce (held: the wiggle; let go: the leap; tapped: a
 * swat), a jump, the ears. With a keyboard and mouse: WASD (Shift to dash, C to creep), the mouse
 * to look (the pointer locked to the game on a click), held and let go to pounce, space to jump, E
 * to listen.
 */
export class Controls {
  readonly intent: Intent = { move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, jump: false, crouch: false, release: false, listen: false };
  /** the stick: where the thumb came down and where it is now (css px), for drawing it */
  stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private lookFinger: { id: number; x: number; y: number } | null = null;
  private keys = new Set<string>();
  private held = { pounce: false, listen: false };
  private jumpQueued = false;
  private releaseQueued = false;
  private yaw = 0;
  private pitch = 0;
  /** how far a css px of drag turns the head (rad) */
  sensitivity = 0.0065;
  enabled = true;
  /** any touch seen (the buttons are drawn then) */
  touchy = false;

  constructor(private readonly surface: HTMLElement, buttons: { pounce: HTMLElement; jump: HTMLElement; listen: HTMLElement }) {
    const S = surface;
    S.addEventListener('pointerdown', (e) => this.down(e));
    S.addEventListener('pointermove', (e) => this.move(e));
    S.addEventListener('pointerup', (e) => this.up(e));
    S.addEventListener('pointercancel', (e) => this.up(e));
    const hold = (el: HTMLElement, on: () => void, off: () => void) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); on(); });
      const end = (e: PointerEvent) => { e.stopPropagation(); if (!el.classList.contains('on')) return; el.classList.remove('on'); off(); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };
    hold(buttons.pounce, () => { this.held.pounce = true; }, () => { this.held.pounce = false; this.releaseQueued = true; });
    hold(buttons.jump, () => { this.jumpQueued = true; }, () => {});
    hold(buttons.listen, () => { this.held.listen = true; }, () => { this.held.listen = false; });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.held.pounce = false; this.held.listen = false; this.stick = null; this.lookFinger = null; });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== S) return;
      this.yaw -= e.movementX * this.sensitivity * 0.5;
      this.pitch -= e.movementY * this.sensitivity * 0.5;
    });
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') {
      // (a mouse: the pointer locked to the game for looking; its button the pounce)
      if (document.pointerLockElement !== this.surface) { this.surface.requestPointerLock?.(); return; }
      this.held.pounce = true;
      return;
    }
    this.touchy = true;
    if (e.clientX < innerWidth * 0.45 && !this.stick) this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    else if (!this.lookFinger) this.lookFinger = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  private move(e: PointerEvent) {
    const s = this.stick;
    if (s && e.pointerId === s.id) { s.x = e.clientX; s.y = e.clientY; return; }
    const L = this.lookFinger;
    if (L && e.pointerId === L.id) {
      this.yaw -= (e.clientX - L.x) * this.sensitivity;
      this.pitch -= (e.clientY - L.y) * this.sensitivity;
      L.x = e.clientX;
      L.y = e.clientY;
    }
  }
  private up(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (this.held.pounce) { this.held.pounce = false; this.releaseQueued = true; }
      return;
    }
    if (this.stick && e.pointerId === this.stick.id) this.stick = null;
    if (this.lookFinger && e.pointerId === this.lookFinger.id) this.lookFinger = null;
  }

  /** what is asked this frame (the looks and the presses taken up) */
  read(): Intent {
    const I = this.intent, k = this.keys;
    let mx = 0, my = 0;
    if (this.stick) {
      const R = 55;
      mx = (this.stick.x - this.stick.ox) / R;
      my = -(this.stick.y - this.stick.oy) / R;
      const m = Math.hypot(mx, my);
      if (m > 1) { mx /= m; my /= m; }
    } else {
      if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
      if (k.has('KeyD')) mx += 1;
      if (k.has('KeyA')) mx -= 1;
      if (k.has('ArrowLeft')) this.yaw += 0.04;
      if (k.has('ArrowRight')) this.yaw -= 0.04;
      const m = Math.hypot(mx, my);
      if (m > 0) {
        const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : k.has('KeyC') ? 0.4 : 0.75;
        mx = (mx / m) * speed;
        my = (my / m) * speed;
      }
    }
    I.move.x = this.enabled ? mx : 0;
    I.move.y = this.enabled ? my : 0;
    I.look.yaw = this.yaw;
    I.look.pitch = this.pitch;
    this.yaw = this.pitch = 0;
    I.jump = this.enabled && this.jumpQueued;
    I.crouch = this.enabled && (this.held.pounce || k.has('KeyF'));
    I.release = this.releaseQueued || (!I.crouch && this.wasCrouch);
    this.wasCrouch = I.crouch;
    I.listen = this.enabled && (this.held.listen || k.has('KeyE') || k.has('KeyQ'));
    this.jumpQueued = false;
    this.releaseQueued = false;
    return I;
  }
  private wasCrouch = false;
}
