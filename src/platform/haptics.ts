import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Feel the purr through the glass. Native builds use the Taptic engine / vibrator; browsers that
 * support navigator.vibrate (Android Chrome) get a buzzing pattern. iOS Safari has no web haptics.
 */
export class Haptic {
  readonly native = Capacitor.isNativePlatform();
  private purrOn = false;
  private timer = 0;
  private level = 0;

  get webVibrate() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  tap(kind: 'light' | 'medium' | 'heavy' = 'light') {
    if (this.native) {
      void Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (this.webVibrate) {
      navigator.vibrate(kind === 'heavy' ? 40 : kind === 'medium' ? 22 : 10);
    }
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
        // purring comes in breaths: a long rumble out, a softer one in
        const p: number[] = [];
        for (let i = 0; i < 26; i++) p.push(9, 31);
        p.push(120);
        for (let i = 0; i < 18; i++) p.push(6, 34);
        navigator.vibrate(p);
      };
      pulse();
      this.timer = window.setInterval(pulse, 2600);
    }
  }
}
