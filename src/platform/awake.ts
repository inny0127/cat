import { Capacitor, registerPlugin } from '@capacitor/core';

interface Sentinel { release(): Promise<void>; addEventListener(type: 'release', fn: () => void): void }
interface KeepAwakePlugin { keepAwake(): Promise<void>; allowSleep(): Promise<void> }

/**
 * The screen kept on while it is wanted (the radio playing: the room left open on a desk, as a
 * music video keeps it on). In a browser, a Screen Wake Lock: taken while wanted and the page is
 * in sight, and taken again when it comes back (the browser lets it go whenever the page is
 * hidden), or from inside a touch where it would not be had without one. In an app, the native
 * keep-awake plugin if the build has one. Quietly nothing anywhere else.
 */
export class KeepAwake {
  private wanted = false;
  private lock: Sentinel | null = null;
  private asking = false;
  private nativeOn = false;
  private readonly plugin = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('KeepAwake') ? registerPlugin<KeepAwakePlugin>('KeepAwake') : null;

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => { void this.sync(); });
  }

  /** wanted on or off (cheap to call every frame: it only acts on a change) */
  set(on: boolean) {
    if (on === this.wanted) return;
    this.wanted = on;
    void this.sync();
  }

  /** from inside a touch: another go, if it is wanted and not had */
  touched() {
    if (this.wanted && !this.lock && !this.plugin) void this.sync();
  }

  private async sync() {
    if (this.plugin) {
      if (this.wanted === this.nativeOn) return;
      this.nativeOn = this.wanted;
      try { await (this.wanted ? this.plugin.keepAwake() : this.plugin.allowSleep()); } catch { this.nativeOn = !this.wanted; }
      return;
    }
    const wl = (typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock : undefined);
    if (!wl) return;
    const want = this.wanted && document.visibilityState === 'visible';
    if (want && !this.lock && !this.asking) {
      this.asking = true;
      try {
        const l = await wl.request('screen');
        l.addEventListener('release', () => { if (this.lock === l) this.lock = null; });
        this.lock = l;
      } catch {
        // (not allowed just now: low battery, no touch yet; tried again on the next touch)
      }
      this.asking = false;
      // (let go of meanwhile)
      if (!this.wanted && this.lock) void this.sync();
    } else if (!want && this.lock) {
      const l = this.lock;
      this.lock = null;
      try { await l.release(); } catch { /* gone already */ }
    }
  }
}
