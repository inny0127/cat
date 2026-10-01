/**
 * Shaking the phone like a bag of kibble. iOS asks permission for motion sensors, which has to
 * happen inside a touch handler, so `ask()` is called from one when the cat first wants food.
 */
type PermissionFn = () => Promise<'granted' | 'denied'>;

export class MotionInput {
  onShake: (strength: number) => void = () => {};
  active = false;
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

  /** must run inside a user gesture on iOS */
  async ask() {
    if (!this.needsPermission || this.active) return this.active;
    try {
      const DME = (window as unknown as { DeviceMotionEvent: { requestPermission: PermissionFn } }).DeviceMotionEvent;
      const r = await DME.requestPermission();
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
