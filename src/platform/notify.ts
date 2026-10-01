import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Planned } from '../sim/forecast';
export { forecast, type Planned } from '../sim/forecast';

/**
 * Local notifications: real scheduled ones in the native (Capacitor) app; in a browser, best
 * effort while the page stays alive in the background.
 */
export class Notifier {
  readonly native = Capacitor.isNativePlatform();
  private timers: number[] = [];

  get permission(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (this.native) return 'default';
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  /** call from inside a user gesture */
  async ask(): Promise<boolean> {
    try {
      if (this.native) {
        const r = await LocalNotifications.requestPermissions();
        return r.display === 'granted';
      }
      if (!('Notification' in window)) return false;
      if (Notification.permission === 'granted') return true;
      return (await Notification.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  async schedule(plan: Planned[]) {
    await this.cancel();
    if (!plan.length) return;
    if (this.native) {
      try {
        await LocalNotifications.schedule({
          notifications: plan.map((p, i) => ({
            id: 100 + i,
            title: p.title,
            body: p.body,
            schedule: { at: new Date(p.at), allowWhileIdle: true },
            extra: { kind: p.kind },
          })),
        });
      } catch {
        /* permission missing */
      }
      return;
    }
    if (this.permission !== 'granted') return;
    const now = Date.now();
    for (const p of plan) {
      const wait = p.at - now;
      if (wait > 2 ** 31 - 1) continue;
      this.timers.push(window.setTimeout(() => void this.show(p), Math.max(0, wait)));
    }
  }

  private async show(p: Planned) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(p.title, { body: p.body, icon: './icons/icon-192.png', tag: 'cat-' + p.kind, badge: './icons/badge-96.png' });
      else new Notification(p.title, { body: p.body, icon: './icons/icon-192.png', tag: 'cat-' + p.kind });
    } catch {
      /* the browser refused */
    }
  }

  async cancel() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    if (this.native) {
      try {
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      } catch {
        /* nothing scheduled */
      }
    }
  }
}
