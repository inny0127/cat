import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Feel the purr through the glass. Native builds use the Taptic engine / vibrator; browsers that
 * support navigator.vibrate (Android Chrome) get a buzzing pattern. iOS's browsers have no
 * vibrate(): only the tick of a switch control flipped under the finger (see surface()).
 */
export class Haptic {
  readonly native = Capacitor.isNativePlatform();
  private purrOn = false;
  private timer = 0;
  private level = 0;

  get webVibrate() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  private readonly ios = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  /** iOS without vibrate() (a web page, not the app): its switch controls tick under the finger
   *  when flipped (from iOS 18) */
  private get iosWeb() {
    return this.ios && !this.native && !this.webVibrate;
  }

  /**
   * What the finger touches, for the input to listen on: the picture itself, but on iOS's
   * browsers a see-through label laid over it, wired to a hidden switch. A switch flipped from
   * script ticked until iOS 26.5; since then only a real tap on one does. So the finger's taps
   * land on the label, and a tap the app answers with a tap to feel (asked for while the finger
   * is lifted) lets its own click flip the switch, which ticks; any other tap leaves it be.
   */
  surface(under: HTMLElement): HTMLElement {
    if (!this.iosWeb || typeof document === 'undefined') return under;
    if (this.pad) return this.pad;
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;inset:0;display:block;touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none';
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.tabIndex = -1;
    // (never under the finger, nor seen; but drawn as a switch, or it does not tick)
    sw.style.cssText = 'visibility:hidden;position:absolute;left:0;top:0;margin:0;pointer-events:none';
    sw.addEventListener('focus', () => sw.blur());
    label.appendChild(sw);
    label.addEventListener('click', (e) => {
      // (the label's click, passed on to the switch, comes back up through the label: it is the
      // one that flips it, and is let be)
      if (this.scripted || e.target === sw) return;
      if (e.isTrusted && performance.now() - this.wantAt < 400) this.wantAt = -1e9;
      else e.preventDefault();
    });
    under.insertAdjacentElement('afterend', label);
    this.pad = label;
    return label;
  }
  private pad: HTMLLabelElement | null = null;
  /** a tick asked for while a tap was being lifted (it goes with the tap's own click), and when
   *  the last tap was lifted */
  private wantAt = -1e9;
  private liftAt = -1e9;
  private scripted = false;
  /** a finger lifted after a tap (said by the input, before the app hears of the tap) */
  lifted() {
    this.liftAt = performance.now();
  }
  private get inLift() {
    return !!this.pad && performance.now() - this.liftAt < 60;
  }

  /** a switch flipped from script: a tick before iOS 26.5, nothing after */
  private iosSwitch: HTMLLabelElement | null = null;
  private iosTick() {
    if (this.inLift) { this.wantAt = performance.now(); return; }
    let label = this.pad ?? this.iosSwitch;
    if (!label) {
      label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      input.addEventListener('focus', () => input.blur());
      label.appendChild(input);
      document.body.appendChild(label);
      this.iosSwitch = label;
    }
    this.scripted = true;
    try { label.click(); } finally { this.scripted = false; }
  }

  tap(kind: 'light' | 'medium' | 'heavy' = 'light') {
    if (this.native) {
      void Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (this.webVibrate) {
      // (a buzz much shorter than this is not felt at all on many phones' motors)
      navigator.vibrate(kind === 'heavy' ? 55 : kind === 'medium' ? 32 : 18);
    } else if (this.ios) {
      try { this.iosTick(); } catch { /* no way to feel it here */ }
    }
  }

  /** a tap from the cat's side of the glass, felt as soon as the platform lets it be: at once
   *  where it can be, and on iOS's browsers (whose tick only comes from inside a touch) with the
   *  tap being lifted, or at the finger's next move */
  private pending: 'light' | 'medium' | 'heavy' | null = null;
  private pendingAt = 0;
  tapSoon(kind: 'light' | 'medium' | 'heavy' = 'light') {
    if (this.native || this.webVibrate || !this.ios || this.inLift) this.tap(kind);
    else { this.pending = kind; this.pendingAt = performance.now(); }
  }
  /** from inside a touch: a tap that was waiting for one (not long: later, it would be felt for
   *  nothing) */
  flush() {
    const k = this.pending;
    this.pending = null;
    if (k && performance.now() - this.pendingAt < 400) this.tap(k);
  }

  /** a finger moving on the cat (from inside the touch): a tap waiting for one, and on iOS's
   *  browsers the purr, as ticks under the stroking finger (before iOS 26.5: since, a page has no
   *  way to make one there) */
  private strokeTick = 0;
  stroke() {
    this.flush();
    if (!this.iosWeb || this.level <= 0.2) return;
    const now = performance.now();
    if (now - this.strokeTick < 150 - 60 * this.level) return;
    this.strokeTick = now;
    try { this.iosTick(); } catch { /* no way to feel it here */ }
  }

  /** level 0..1 while a finger rests on a purring cat */
  purr(level: number) {
    this.level = level;
    const on = level > 0.2;
    if (on === this.purrOn) return;
    this.purrOn = on;
    clearInterval(this.timer);
    if (!on) {
      if (this.webVibrate) navigator.vibrate(0);
      return;
    }
    if (this.native) {
      // ~12 soft taps a second reads as a rumble under the finger
      this.timer = window.setInterval(() => {
        if (Math.random() < 0.55 + this.level * 0.4) void Haptics.impact({ style: ImpactStyle.Light });
      }, 85);
    } else if (this.webVibrate) {
      const pulse = () => {
        // purring comes in breaths: a long rumble out, a softer one in (each buzz long enough
        // for a phone's motor to be felt, as many as a pattern may hold)
        const p: number[] = [];
        for (let i = 0; i < 25; i++) p.push(24, 28);
        p.push(140);
        for (let i = 0; i < 19; i++) p.push(14, 34);
        navigator.vibrate(p);
      };
      pulse();
      this.timer = window.setInterval(pulse, 2600);
    }
  }
}
