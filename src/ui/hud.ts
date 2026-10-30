/**
 * What is on the glass besides the room: the cat's affection level and the coins (냥) at the top,
 * the buttons for the day's missions, the shop and the album; hearts and coins popping up where
 * they are won, a word at the top when something is done, a card when a level is won; and the
 * sheets the buttons open. All in the room's own pixels and font.
 */

/** a pixel picture as an svg: rows of letters, each letter a colour ('.' none) */
export function pix(rows: string[], pal: Record<string, string>, size: number) {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (pal[c]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${(size * w) / Math.max(w, h)}" height="${(size * h) / Math.max(w, h)}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

export const ICONS = {
  heart: (s: number) => pix([
    '.KK.KK.',
    'KRRKRWK',
    'KRRRRRK',
    'KRRRRRK',
    '.KRRRK.',
    '..KRK..',
    '...K...',
  ], { K: '#5a2232', R: '#e8607a', W: '#ffd6dc' }, s),
  coin: (s: number) => pix([
    '.K...K.',
    'KYK.KYK',
    'KYYYYYK',
    'KYWYYYK',
    'KYYYYOK',
    '.KOOOK.',
    '..KKK..',
  ], { K: '#6b4a33', Y: '#f2c94c', O: '#c99430', W: '#fff4c2' }, s),
  list: (s: number) => pix([
    '.KKKKK.',
    'KWWWWWK',
    'KWGWLWK',
    'KWWWWWK',
    'KWGWLWK',
    'KWWWWWK',
    '.KKKKK.',
  ], { K: '#4a3a40', W: '#f6f1e7', G: '#5a8e4f', L: '#a99a9c' }, s),
  bag: (s: number) => pix([
    '..KKK..',
    '.K...K.',
    'KKKKKKK',
    'KPPPPPK',
    'KPPWPPK',
    'KPPPPPK',
    'KKKKKKK',
  ], { K: '#4a2a3a', P: '#e78fa7', W: '#fff0f3' }, s),
  camera: (s: number) => pix([
    '..KKK..',
    'KKKKKKK',
    'KGGGGGK',
    'KGKKKGK',
    'KGKBKGK',
    'KGKKKGK',
    'KKKKKKK',
  ], { K: '#2c2430', G: '#a7a8bb', B: '#8fb0c3' }, s),
  check: (s: number) => pix([
    '......K',
    '.....KK',
    'K...KK.',
    'KK.KK..',
    '.KKK...',
    '..K....',
  ], { K: '#5a8e4f' }, s),
  lock: (s: number) => pix([
    '..KKK..',
    '.K...K.',
    '.K...K.',
    'KKKKKKK',
    'KYYKYYK',
    'KYYYYYK',
    'KKKKKKK',
  ], { K: '#4a3a40', Y: '#cfa84a' }, s),
};

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 4; font: 400 calc(12 * var(--fpx)) / 1.4 var(--pixel-font); letter-spacing: 0; color: #f7f0e8; }
#hud .pill { position: absolute; top: calc(10px + env(safe-area-inset-top)); display: flex; align-items: center; gap: 6px; padding: 5px 9px 5px 7px;
  background: rgba(43, 36, 51, 0.82); box-shadow: 0 0 0 2px rgba(201, 148, 134, 0.85), 2px 3px 0 rgba(20, 14, 22, 0.3); pointer-events: auto; cursor: pointer; }
#hud .love { left: calc(10px + env(safe-area-inset-left)); }
#hud .coins { right: calc(10px + env(safe-area-inset-right)); }
#hud .love .bar { width: 64px; height: 6px; background: #2a2130; box-shadow: 0 0 0 1px #5a4458; position: relative; }
#hud .love .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #e8607a; transition: width 0.4s ease; }
#hud .love .lv { min-width: 34px; }
#hud .coins b { font-weight: 400; color: #ffe08a; min-width: 30px; text-align: right; }
#hud .pill.bump { animation: hudbump 0.35s ease; }
@keyframes hudbump { 30% { transform: scale(1.12); } }
#hud .btns { position: absolute; right: calc(10px + env(safe-area-inset-right)); top: calc(52px + env(safe-area-inset-top)); display: flex; flex-direction: column; gap: 9px; }
#hud .btn { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; position: relative; background: rgba(43, 36, 51, 0.82);
  box-shadow: 0 0 0 2px rgba(201, 148, 134, 0.85), 2px 3px 0 rgba(20, 14, 22, 0.3); pointer-events: auto; cursor: pointer; border: 0; padding: 0; }
#hud .btn:active, #hud .pill:active { transform: translateY(1px); }
#hud .btn .badge { position: absolute; right: -6px; top: -6px; min-width: 16px; height: 16px; padding: 0 3px; box-sizing: border-box; background: #e8607a; color: #fff;
  font: 400 calc(10 * var(--fpx)) / 16px var(--pixel-font); text-align: center; box-shadow: 0 0 0 2px #2b2433; display: none; }
#hud .btn .badge.on { display: block; animation: hudbump 0.6s ease infinite alternate; }
#hud .btn.hide { display: none; }
#hud .pop { position: absolute; display: flex; align-items: center; gap: 2px; transform: translate(-50%, -50%); animation: hudpop 1.25s ease-out forwards;
  color: #fff; text-shadow: 0 1px 0 #2b1e30, 0 0 4px rgba(43, 30, 48, 0.6); white-space: nowrap; }
@keyframes hudpop { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.6); } 15% { opacity: 1; transform: translate(-50%, -60%) scale(1.1); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0px)), -260%) scale(0.95); } }
#hud .toast { position: absolute; left: 50%; top: calc(56px + env(safe-area-inset-top)); transform: translate(-50%, -8px); opacity: 0; transition: opacity 0.35s ease, transform 0.35s ease;
  padding: 7px 12px; background: rgba(43, 36, 51, 0.9); box-shadow: 0 0 0 2px #cfa84a, 2px 3px 0 rgba(20, 14, 22, 0.3); text-align: center;
  width: max-content; max-width: calc(100vw - 150px); word-break: keep-all; }
#hud .toast span + span { margin-left: 6px; }
#hud .toast.on { opacity: 1; transform: translate(-50%, 0); }
#hud .card { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%) scale(0.85); opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease;
  width: min(260px, calc(100vw - 64px)); padding: 18px 16px 14px; text-align: center; background: rgba(43, 36, 51, 0.95); box-shadow: 0 0 0 2px #e8607a, 0 0 0 4px rgba(43, 36, 51, 0.95), 4px 6px 0 rgba(20, 14, 22, 0.35);
  pointer-events: none; }
#hud .card.on { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
#hud .card h3 { margin: 8px 0 2px; font-size: calc(16 * var(--fpx)); font-weight: 400; color: #ffd6dc; }
#hud .card p { margin: 4px 0; color: #e8dccf; }
#hud .card .gold { color: #ffe08a; }
#hud .card .go { margin-top: 10px; }
#hud .card .beat { animation: hudbeat 0.9s ease infinite; display: inline-block; }
@keyframes hudbeat { 0%, 100% { transform: scale(1); } 15% { transform: scale(1.18); } 30% { transform: scale(1); } 45% { transform: scale(1.1); } }
#hud .confetti { position: absolute; top: -12px; animation: hudfall linear forwards; }
@keyframes hudfall { to { transform: translate(var(--dx), 110vh) rotate(var(--r)); } }
.hudbtn { font: 400 calc(12 * var(--fpx)) / 1 var(--pixel-font); letter-spacing: 0; color: #2b2433; background: #f6cf9b; border: 0; padding: 8px 12px; cursor: pointer;
  box-shadow: 0 0 0 2px #2b2433, 0 3px 0 2px #a1724a; }
.hudbtn:active { transform: translateY(2px); box-shadow: 0 0 0 2px #2b2433, 0 1px 0 2px #a1724a; }
.hudbtn[disabled] { background: #6b5f6e; color: #b9adbb; box-shadow: 0 0 0 2px #2b2433; cursor: default; }
#sheet { position: fixed; inset: 0; z-index: 5; background: rgba(30, 22, 34, 0.55); opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
  font: 400 calc(12 * var(--fpx)) / 1.45 var(--pixel-font); letter-spacing: 0; color: #f7f0e8; word-break: keep-all; }
#sheet.on { opacity: 1; pointer-events: auto; }
#sheet .box { position: absolute; left: 50%; bottom: 0; width: min(420px, 100vw); max-height: 78vh; transform: translate(-50%, 24px); transition: transform 0.3s ease;
  display: flex; flex-direction: column; background: #2b2433; box-shadow: 0 0 0 2px #c99486; padding-bottom: env(safe-area-inset-bottom); }
#sheet.on .box { transform: translate(-50%, 0); }
#sheet .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px 8px; color: #f6cf9b; font-size: calc(14 * var(--fpx)); }
#sheet .head .coins { display: flex; align-items: center; gap: 5px; color: #ffe08a; font-size: calc(12 * var(--fpx)); }
#sheet .body { overflow-y: auto; padding: 4px 14px 10px; -webkit-overflow-scrolling: touch; }
#sheet .foot { padding: 8px 14px 14px; display: flex; justify-content: center; }
`;

export interface Pop { x: number; y: number; text: string; icon?: 'heart' | 'coin'; }

export class Hud {
  readonly el: HTMLDivElement;
  private lvEl: HTMLSpanElement;
  private barEl: HTMLElement;
  private coinEl: HTMLElement;
  private toastEl: HTMLDivElement;
  private cardEl: HTMLDivElement;
  private badges: Record<string, HTMLElement> = {};
  private btns: Record<string, HTMLButtonElement> = {};
  private toasts: { html: string; ms: number }[] = [];
  private toastUntil = 0;
  private pops = 0;
  private shownCoins = -1;
  private cardTimer = 0;
  private coinTarget = 0;
  private coinRaf = 0;
  /** a button pressed: 'missions', 'shop', 'album', 'love', 'coins' */
  onPress: ((what: string) => void) | null = null;
  /** the level card's own button */
  onCard: (() => void) | null = null;
  readonly sheet: Sheet;

  constructor(parent: HTMLElement = document.body) {
    if (!document.getElementById('hud-css')) {
      const st = document.createElement('style');
      st.id = 'hud-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = this.el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = `
      <div class="pill love" data-k="love">${ICONS.heart(18)}<span class="lv">Lv 1</span><span class="bar"><i style="width:0%"></i></span></div>
      <div class="pill coins" data-k="coins">${ICONS.coin(18)}<b>0</b></div>
      <div class="btns">
        <button class="btn" data-k="missions" aria-label="오늘의 할 일">${ICONS.list(24)}<span class="badge"></span></button>
        <button class="btn" data-k="shop" aria-label="상점">${ICONS.bag(24)}<span class="badge"></span></button>
        <button class="btn hide" data-k="album" aria-label="사진첩">${ICONS.camera(24)}<span class="badge"></span></button>
      </div>
      <div class="toast"></div>
      <div class="card"></div>`;
    parent.appendChild(el);
    this.lvEl = el.querySelector('.lv') as HTMLSpanElement;
    this.barEl = el.querySelector('.bar i') as HTMLElement;
    this.coinEl = el.querySelector('.coins b') as HTMLElement;
    this.toastEl = el.querySelector('.toast') as HTMLDivElement;
    this.cardEl = el.querySelector('.card') as HTMLDivElement;
    for (const b of el.querySelectorAll<HTMLElement>('[data-k]')) {
      const k = b.dataset.k!;
      if (b instanceof HTMLButtonElement) this.btns[k] = b;
      const badge = b.querySelector('.badge') as HTMLElement | null;
      if (badge) this.badges[k] = badge;
      // (a press here is not a touch on the glass)
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onPress?.(k); });
    }
    this.cardEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.cardEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('.go')) this.onCard?.();
      this.cardEl.classList.remove('on');
    });
    this.sheet = new Sheet();
  }

  /** the affection level, and how far into it (0 .. 1) */
  setLove(level: number, frac: number) {
    this.lvEl.textContent = `Lv ${level}`;
    this.barEl.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
  }

  /** the coins, counted up (or down) to the new number */
  setCoins(n: number, bump = true) {
    this.coinTarget = n;
    if (this.shownCoins < 0) { this.shownCoins = n; this.coinEl.textContent = n.toLocaleString('ko-KR'); return; }
    if (bump) this.bump('coins');
    if (this.coinRaf) return;
    const tick = () => {
      const d = this.coinTarget - this.shownCoins;
      if (Math.abs(d) < 1) { this.shownCoins = this.coinTarget; this.coinRaf = 0; }
      else { this.shownCoins += Math.sign(d) * Math.max(1, Math.floor(Math.abs(d) * 0.18)); this.coinRaf = requestAnimationFrame(tick); }
      this.coinEl.textContent = Math.round(this.shownCoins).toLocaleString('ko-KR');
    };
    this.coinRaf = requestAnimationFrame(tick);
  }

  bump(k: 'love' | 'coins') {
    const el = this.el.querySelector(`.${k}`) as HTMLElement;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /** the number on a button's badge (0: none) */
  badge(k: string, n: number) {
    const b = this.badges[k];
    if (!b) return;
    b.textContent = n > 9 ? '9+' : n > 0 ? String(n) : '!';
    b.classList.toggle('on', n !== 0);
  }

  show(k: string, on: boolean) {
    this.btns[k]?.classList.toggle('hide', !on);
  }

  /** a heart or a coin (and a word) popping up at a point on the screen and floating away */
  pop(p: Pop) {
    if (this.pops > 14) return;
    const d = document.createElement('div');
    d.className = 'pop';
    d.style.left = `${p.x}px`;
    d.style.top = `${p.y}px`;
    d.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 40)}px`);
    d.innerHTML = `${p.icon ? ICONS[p.icon](16) : ''}<span>${p.text}</span>`;
    this.el.appendChild(d);
    this.pops++;
    setTimeout(() => { d.remove(); this.pops--; }, 1300);
  }

  /** a word at the top, a while (others after it, in turn) */
  toast(html: string, ms = 2600) {
    this.toasts.push({ html, ms });
    this.nextToast();
  }
  private nextToast() {
    if (performance.now() < this.toastUntil || !this.toasts.length) return;
    const t = this.toasts.shift()!;
    this.toastEl.innerHTML = t.html;
    this.toastEl.classList.add('on');
    this.toastUntil = performance.now() + t.ms + 400;
    setTimeout(() => this.toastEl.classList.remove('on'), t.ms);
    setTimeout(() => this.nextToast(), t.ms + 420);
  }

  /** a card in the middle (a level won): its lines, and a button on it, if any; hearts falling */
  card(html: string, button?: string) {
    this.cardEl.innerHTML = html + (button ? `<div class="go"><button class="hudbtn">${button}</button></div>` : '');
    this.cardEl.classList.add('on');
    // (put away by itself after a while, if not tapped)
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.cardEl.classList.remove('on'), 7000);
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = `${Math.random() * 100}vw`;
      c.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 120)}px`);
      c.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 720)}deg`);
      c.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      c.style.animationDelay = `${Math.random() * 0.5}s`;
      c.innerHTML = Math.random() < 0.6 ? ICONS.heart(10 + Math.random() * 8) : ICONS.coin(10 + Math.random() * 6);
      this.el.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }
  }
  get carding() {
    return this.cardEl.classList.contains('on');
  }
  closeCard() {
    this.cardEl.classList.remove('on');
  }
}

/** a sheet up from the bottom: its title, the coins at its corner, what is in it, and a button to
 *  put it away (or a tap outside it) */
export class Sheet {
  readonly el: HTMLDivElement;
  private title: HTMLElement;
  private coins: HTMLElement;
  readonly body: HTMLElement;
  onClose: (() => void) | null = null;
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'sheet';
    el.innerHTML = `<div class="box"><div class="head"><span class="t"></span><span class="coins">${ICONS.coin(14)}<b>0</b></span></div><div class="body"></div><div class="foot"><button class="hudbtn">닫기</button></div></div>`;
    document.body.appendChild(el);
    this.title = el.querySelector('.t') as HTMLElement;
    this.coins = el.querySelector('.head b') as HTMLElement;
    this.body = el.querySelector('.body') as HTMLElement;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === el || t.closest('.foot')) this.close();
    });
  }
  get open() {
    return this.el.classList.contains('on');
  }
  show(title: string) {
    this.title.textContent = title;
    this.el.classList.add('on');
  }
  setCoins(n: number) {
    this.coins.textContent = n.toLocaleString('ko-KR');
  }
  close() {
    if (!this.open) return;
    this.el.classList.remove('on');
    this.onClose?.();
  }
}

/** a Korean particle that fits the word before it: '을'/'를', '이'/'가', '은'/'는', '으로'/'로' */
export function josa(word: string, which: '을' | '이' | '은' | '으로') {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  const fin = c >= 0 && c < 11172 ? c % 28 : 0;
  if (which === '으로') return fin && fin !== 8 ? '으로' : '로';
  const pairs = { 을: ['을', '를'], 이: ['이', '가'], 은: ['은', '는'] } as const;
  return pairs[which][fin ? 0 : 1];
}
