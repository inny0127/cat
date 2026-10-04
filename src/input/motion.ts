/**
 * Shaking the phone like a bag of kibble; and how it is tipped, for looking through it as through
 * a window (tiltX, tiltY). iOS asks permission for motion sensors, which has to happen inside a
 * touch handler, so `ask()` is called from one when the cat first wants food.
 */
type PermissionFn = () => Promise<'granted' | 'denied'>;

export class MotionInput {
  onShake: (strength: number) => void = () => {};
  active = false;
  /** how the phone is tipped from the way it has been held of late, in the screen's own axes (-1 ..
   *  1 each way: the right edge away from you, the top toward you) */
  tiltX = 0;
  tiltY = 0;
  private held: { x: number; y: number } | null = null;
  private lastTurn = 0;
  private needsPermission: boolean;
  private gx = 0;
  private gy = 0;
  private gz = 0;
  private lastSign = 0;
  private peaks: number[] = [];
  private lastEmit = 0;

  constructor() {
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: PermissionFn } }).DeviceMotionEvent;
    this.needsPermission = !!DME && typeof DME.requestPermission === 'function';
    if (!DME) return;
    if (!this.needsPermission) this.listen();
  }

  get supported() {
    return 'DeviceMotionEvent' in window && (navigator.maxTouchPoints || 0) > 0;
  }

  get canAsk() {
    return this.needsPermission && !this.active;
  }

  /** must run inside a user gesture on iOS (motion, and the phone's turn, which iOS may ask for
   *  on its own) */
  async ask() {
    if (!this.needsPermission || this.active) return this.active;
    try {
      const DME = (window as unknown as { DeviceMotionEvent: { requestPermission: PermissionFn } }).DeviceMotionEvent;
      const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } }).DeviceOrientationEvent;
      const asked = [DME.requestPermission()];
      if (DOE && typeof DOE.requestPermission === 'function') asked.push(DOE.requestPermission().catch(() => 'denied' as const));
      const [r] = await Promise.all(asked);
      if (r === 'granted') this.listen();
    } catch {
      /* dismissed */
    }
    return this.active;
  }

  private listen() {
    if (this.active) return;
    this.active = true;
    window.addEventListener('devicemotion', (e) => this.sample(e));
    window.addEventListener('deviceorientation', (e) => this.turn(e));
  }

  /** the phone's turn, into the screen's axes; measured from the way it has been held these last
   *  few seconds (which drifts after it), so that however it is held, still is the middle */
  private turn(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    const ang = screen.orientation?.angle ?? 0;
    let x = e.gamma, y = e.beta;
    if (ang === 90) { x = e.beta; y = -e.gamma; }
    else if (ang === 270 || ang === -90) { x = -e.beta; y = e.gamma; }
    else if (ang === 180) { x = -e.gamma; y = -e.beta; }
    const now = e.timeStamp / 1000;
    const dt = this.lastTurn ? Math.min(0.25, Math.max(0, now - this.lastTurn)) : 0;
    this.lastTurn = now;
    if (!this.held || Math.abs(y - this.held.y) > 60) this.held = { x, y };
    const k = 1 - Math.exp(-dt / 3);
    this.held.x += (x - this.held.x) * k;
    this.held.y += (y - this.held.y) * k;
    this.tiltX = Math.max(-1, Math.min(1, (x - this.held.x) / 18));
    this.tiltY = Math.max(-1, Math.min(1, (y - this.held.y) / 18));
  }

  private sample(e: DeviceMotionEvent) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    // remove gravity with a slow low-pass
    const k = 0.08;
    this.gx += (a.x - this.gx) * k;
    this.gy += (a.y - this.gy) * k;
    this.gz += (a.z - this.gz) * k;
    const lx = a.x - this.gx, ly = a.y - this.gy, lz = a.z - this.gz;
    // dominant axis of the jolt
    const v = Math.abs(lx) > Math.abs(ly) ? (Math.abs(lx) > Math.abs(lz) ? lx : lz) : Math.abs(ly) > Math.abs(lz) ? ly : lz;
    const now = performance.now();
    if (Math.abs(v) > 11) {
      const sgn = Math.sign(v);
      if (sgn !== this.lastSign) {
        this.lastSign = sgn;
        this.peaks.push(now);
        this.peaks = this.peaks.filter((t) => now - t < 1100);
        if (this.peaks.length >= 3 && now - this.lastEmit > 220) {
          this.lastEmit = now;
          this.onShake(Math.min(1, Math.abs(v) / 25));
        }
      }
    }
  }
}
