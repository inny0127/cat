import * as THREE from 'three';
import { pix, ICONS } from '../ui/hud';

/** what the hunt needs of the room round it */
export interface Arena {
  /** a world point on the screen (css px), and whether it is on it */
  toScreen(p: THREE.Vector3): { x: number; y: number; on: boolean };
  /** a place on the floor for a butterfly: open, on the screen, a little way from the cat */
  spot(): THREE.Vector3;
  /** is the cat on it: a forepaw or its nose at it */
  catches(p: THREE.Vector3): boolean;
  /** the laser pointer taken up (or put down) */
  laser(on: boolean): void;
  /** the cat woken and made ready, if it can be (false: it cannot play now) */
  ready(): boolean;
  sound(name: string, o?: { gain?: number; rate?: number; delay?: number }): void;
  tap(): void;
}

const LEN = 30;
const CSS = `
#hud .hunt { position: absolute; left: 50%; top: calc(56px + env(safe-area-inset-top)); transform: translateX(-50%); display: none; gap: 10px; align-items: center;
  padding: 6px 12px; background: rgba(43, 36, 51, 0.88); box-shadow: 0 0 0 2px #e8607a, 2px 3px 0 rgba(20, 14, 22, 0.3); font-size: calc(14 * var(--fpx)); }
#hud .hunt.on { display: flex; }
#hud .hunt .time { color: #ffe08a; min-width: 36px; text-align: right; }
#hud .hunt .time.low { color: #ff8a8a; animation: hudbump 0.5s ease infinite; }
#hud .fly { position: absolute; transform: translate(-50%, -100%); pointer-events: none; filter: drop-shadow(0 2px 0 rgba(30, 20, 34, 0.45)); }
#hud .fly i { display: block; animation: hudfly 0.32s steps(1) infinite; }
@keyframes hudfly { 50% { transform: scaleX(0.55); } }
#hud .fly.gold i { filter: drop-shadow(0 0 3px #ffe08a); }
#hud .count { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); font-size: calc(48 * var(--fpx)); color: #fff; text-shadow: 0 3px 0 #2b1e30, 0 0 8px rgba(43, 30, 48, 0.6); pointer-events: none; animation: hudcount 0.9s ease-out forwards; }
@keyframes hudcount { from { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } 25% { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; } }
`;

const FLY = (wing: string, dark: string, s: number) => pix([
  'KK.....KK',
  'KWK...KWK',
  'KWWK.KWWK',
  '.KWWKWWK.',
  '..KWKWK..',
  '.KWWKWWK.',
  '.KK.K.KK.',
], { K: dark, W: wing }, s);

interface Fly { p: THREE.Vector3; el: HTMLDivElement; gold: boolean; t: number; seed: number }

/**
 * A hunt: thirty seconds, the laser pointer in your hand, butterflies settling on the floor here and
 * there; lead the cat onto them with the red dot, and each it pounces on is caught (a golden one is
 * worth three); caught one after another quickly, a combo. At the end, what it caught, the coins
 * for them, and the best so far.
 */
export class Hunt {
  running = false;
  private t = 0;
  private score = 0;
  private combo = 0;
  private lastCatch = -9;
  private flies: Fly[] = [];
  private bar: HTMLDivElement;
  private timeEl: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private starting = -1;
  /** it ended: what was caught, and the best combo */
  onEnd: ((score: number, bestCombo: number) => void) | null = null;
  private bestCombo = 0;

  constructor(private readonly hud: HTMLElement, private readonly arena: Arena) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const bar = this.bar = document.createElement('div');
    bar.className = 'hunt';
    bar.innerHTML = `<span class="time">${LEN}</span><span>${FLY('#f3b0b0', '#5a2232', 18)}</span><b class="score" style="font-weight:400">0</b><span class="combo" style="color:#ffd6dc"></span>`;
    hud.appendChild(bar);
    this.timeEl = bar.querySelector('.time') as HTMLElement;
    this.scoreEl = bar.querySelector('.score') as HTMLElement;
    this.comboEl = bar.querySelector('.combo') as HTMLElement;
  }

  /** begin: a count of three, then thirty seconds of it (false: the cat cannot play now) */
  start() {
    if (this.running || !this.arena.ready()) return false;
    this.running = true;
    this.t = -3.2;
    this.starting = 3;
    this.score = this.combo = this.bestCombo = 0;
    this.lastCatch = -9;
    this.arena.laser(true);
    this.bar.classList.add('on');
    this.scoreEl.textContent = '0';
    this.comboEl.textContent = '';
    this.timeEl.textContent = String(LEN);
    this.count('3');
    return true;
  }

  private count(s: string) {
    const d = document.createElement('div');
    d.className = 'count';
    d.textContent = s;
    this.hud.appendChild(d);
    setTimeout(() => d.remove(), 950);
    this.arena.sound('coin', { gain: 0.18, rate: s === '시작!' ? 1.5 : 0.8 });
  }

  step(dt: number) {
    if (!this.running) return;
    this.t += dt;
    if (this.t < 0) {
      const n = Math.ceil(-this.t / 1.07);
      if (n < this.starting && n > 0) { this.starting = n; this.count(String(n)); }
      return;
    }
    if (this.starting > 0) { this.starting = 0; this.count('시작!'); }
    const left = Math.max(0, LEN - this.t);
    this.timeEl.textContent = String(Math.ceil(left));
    this.timeEl.classList.toggle('low', left < 5.5);
    // (two on the floor at a time, a third now and then; a golden one sometimes)
    while (this.flies.length < (this.t > 12 ? 3 : 2)) this.add();
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      f.t += dt;
      // (fluttering a little where it settled)
      const bob = 0.012 * Math.sin(f.t * 5 + f.seed);
      const at = f.p.clone();
      at.y += 0.05 + bob;
      const s = this.arena.toScreen(at);
      f.el.style.left = `${s.x}px`;
      f.el.style.top = `${s.y}px`;
      f.el.style.display = s.on ? 'block' : 'none';
      if (this.arena.catches(f.p)) this.caught(i, s);
      // (one left too long flies off, and another settles)
      else if (f.t > 9) this.remove(i);
    }
    if (left <= 0) this.end();
  }

  private add() {
    const gold = Math.random() < 0.15;
    const el = document.createElement('div');
    el.className = `fly ${gold ? 'gold' : ''}`;
    const [w, k] = gold ? ['#ffe08a', '#7a5a1a'] : ([['#f3b0b0', '#5a2232'], ['#a3d4e6', '#2b4767'], ['#c7bddc', '#463e66']] as const)[Math.floor(Math.random() * 3)];
    el.innerHTML = `<i>${FLY(w, k, 34)}</i>`;
    this.hud.appendChild(el);
    this.flies.push({ p: this.arena.spot(), el, gold, t: 0, seed: Math.random() * 6 });
  }

  private remove(i: number) {
    this.flies[i].el.remove();
    this.flies.splice(i, 1);
  }

  private caught(i: number, s: { x: number; y: number }) {
    const f = this.flies[i];
    this.combo = this.t - this.lastCatch < 4 ? this.combo + 1 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastCatch = this.t;
    const pts = f.gold ? 3 : 1;
    this.score += pts;
    this.scoreEl.textContent = String(this.score);
    this.comboEl.textContent = this.combo > 1 ? `콤보 x${this.combo}` : '';
    this.remove(i);
    // (a pop of it where it was)
    const d = document.createElement('div');
    d.className = 'pop';
    d.style.left = `${s.x}px`;
    d.style.top = `${s.y}px`;
    d.innerHTML = `${ICONS.heart(16)}<span>+${pts}${this.combo > 1 ? ` 콤보 ${this.combo}!` : ''}</span>`;
    this.hud.appendChild(d);
    setTimeout(() => d.remove(), 1300);
    this.arena.sound('coin', { gain: 0.25, rate: 1 + Math.min(0.6, this.combo * 0.08) });
    this.arena.tap();
  }

  end() {
    if (!this.running) return;
    this.running = false;
    for (let i = this.flies.length - 1; i >= 0; i--) this.remove(i);
    this.bar.classList.remove('on');
    this.arena.laser(false);
    this.onEnd?.(this.score, this.bestCombo);
  }
}
