import type { App } from '../app';
import { stepLife } from '../sim/life';
import { clearState } from '../sim/state';

/** Only with ?debug in the URL: live numbers and time travel for testing the cat's life. */
export class Debug {
  private out: HTMLPreElement;
  constructor(private app: App) {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:9;font:11px/1.35 ui-monospace,monospace;color:#5c463a;' +
      'background:rgba(255,251,250,.86);padding:6px 8px;border-radius:6px;max-width:320px;pointer-events:auto';
    this.out = document.createElement('pre');
    this.out.style.margin = '0 0 4px';
    el.appendChild(this.out);
    const btn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:11px monospace;margin:1px;padding:2px 5px';
      b.onclick = (e) => { e.stopPropagation(); fn(); };
      el.appendChild(b);
    };
    const s = () => this.app.state;
    const warp = (h: number) => {
      stepLife(s(), h * 3600_000, true);
      this.app.brain.wake(performance.now() / 1000, false);
    };
    btn('+1h', () => warp(1));
    btn('+6h', () => warp(6));
    btn('+24h', () => warp(24));
    btn('feed', () => this.app.brain.kibble(1));
    btn('water', () => { s().water = 1; });
    btn('scoop', () => this.app.brain.scoop());
    btn('trust+', () => { s().trust = Math.min(1, s().trust + 0.25); });
    btn('trust-', () => { s().trust = Math.max(-1, s().trust - 0.25); });
    btn('hungry', () => { s().hunger = 0.9; s().food = 0; });
    btn('sick', () => { s().health = 0.4; });
    btn('kill', () => { s().health = 0.001; s().hunger = 1; s().thirst = 1; warp(0.5); });
    btn('wake', () => this.app.brain.wake(performance.now() / 1000, false));
    btn('reset', () => { clearState(); location.reload(); });
    document.body.appendChild(el);
  }

  update() {
    const s = this.app.state, b = this.app.brain;
    const f = (v: number) => v.toFixed(2);
    this.out.textContent =
      `mode ${b.mode}  sleep ${f(b.sleepDepth)}\n` +
      `pleasure ${f(b.pleasure)} irrit ${f(b.irritation)} fear ${f(b.fear)}\n` +
      `stim ${b.stim.toFixed(0)}s purr ${f(b.purr)}\n` +
      `trust ${f(s.trust)} lonely ${f(s.lonely)} health ${f(s.health)}\n` +
      `hunger ${f(s.hunger)} thirst ${f(s.thirst)} bladder ${f(s.bladder)}\n` +
      `food ${f(s.food)} water ${f(s.water)} litter ${f(s.litter)}\n` +
      `where ${s.where}${s.awayReason ? ' (' + s.awayReason + ')' : ''} gen ${s.generation} ${s.personality.coat}`;
  }
}
