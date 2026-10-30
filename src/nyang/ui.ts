import { ICONS, pix } from '../ui/hud';
import { LEVELS, dailyLevel, unlocked, type Level, type Round, type Save } from './round';
import { COATS, WEAR } from './closet';
import { UPGRADES, upLevel } from './upgrades';

const CSS = `
#ny { position: fixed; inset: 0; pointer-events: none; z-index: 4; font: 400 calc(12 * var(--fpx)) / 1.4 var(--pixel-font); letter-spacing: 0; color: #f7f0e8; word-break: keep-all; }
#ny .pill { position: absolute; top: calc(10px + env(safe-area-inset-top)); display: flex; align-items: center; gap: 6px; padding: 5px 10px;
  background: rgba(43, 36, 51, 0.82); box-shadow: 0 0 0 2px rgba(201, 148, 134, 0.85), 2px 3px 0 rgba(20, 14, 22, 0.3); }
#ny .time { left: calc(10px + env(safe-area-inset-left)); font-size: calc(16 * var(--fpx)); }
#ny .time.low { color: #ff8a8a; box-shadow: 0 0 0 2px #e8607a, 2px 3px 0 rgba(20, 14, 22, 0.3); animation: nybump 0.5s ease infinite; }
#ny .count { right: calc(56px + env(safe-area-inset-right)); }
#ny .menu { right: calc(10px + env(safe-area-inset-right)); width: 36px; height: 36px; padding: 0; justify-content: center; pointer-events: auto; cursor: pointer; border: 0; color: #f7f0e8; font: inherit; }
#ny .score { position: absolute; left: 50%; top: calc(54px + env(safe-area-inset-top)); transform: translateX(-50%); text-align: center; font-size: calc(24 * var(--fpx));
  text-shadow: 0 2px 0 #2b1e30, 0 0 6px rgba(43, 30, 48, 0.6); }
#ny .score small { display: block; font-size: calc(12 * var(--fpx)); color: #ffd6dc; min-height: 1.4em; }
#ny .score small.on { animation: nybump 0.4s ease; }
@keyframes nybump { 30% { transform: scale(1.18); } }
#ny .play { display: none; }
#ny.playing .play { display: flex; }
#ny.playing .score.play { display: block; }
#ny .pop { position: absolute; transform: translate(-50%, -50%); animation: nypop 1.4s ease-out forwards; color: #fff; text-align: center; white-space: nowrap;
  text-shadow: 0 2px 0 #2b1e30, 0 0 5px rgba(43, 30, 48, 0.7); font-size: calc(14 * var(--fpx)); }
#ny .pop i { display: block; font-style: normal; font-size: calc(11 * var(--fpx)); color: #ffe08a; }
#ny .pop.big { font-size: calc(20 * var(--fpx)); color: #ffd6dc; }
@keyframes nypop { 0% { opacity: 0; transform: translate(-50%, -20%) scale(0.5); } 15% { opacity: 1; transform: translate(-50%, -70%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -260%) scale(1); } }
#ny .big { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); font-size: calc(44 * var(--fpx)); color: #fff; text-shadow: 0 3px 0 #2b1e30, 0 0 8px rgba(43, 30, 48, 0.6);
  animation: nycount 0.95s ease-out forwards; white-space: nowrap; }
@keyframes nycount { from { transform: translate(-50%, -50%) scale(1.7); opacity: 0; } 25% { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; } }
#ny .tip { position: absolute; left: 16px; right: 16px; bottom: calc(26px + env(safe-area-inset-bottom)); text-align: center; color: #fff5e8;
  text-shadow: 0 1px 0 rgba(43, 30, 48, 0.85), 0 0 6px rgba(43, 30, 48, 0.5); opacity: 0; transition: opacity 0.6s ease; }
#ny .tip.on { opacity: 1; }
#ny .screen { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px; pointer-events: auto;
  padding: calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom)); background: linear-gradient(rgba(30, 22, 34, 0.15), rgba(30, 22, 34, 0.75)); }
#ny .screen.on { display: flex; }
#ny .logo { text-align: center; }
#ny .logo h1 { margin: 0; font-weight: 400; font-size: calc(48 * var(--fpx)); line-height: 1.1; color: #ffd6a8; text-shadow: 0 4px 0 #6b2a3a, 0 8px 0 rgba(30, 20, 34, 0.5); letter-spacing: 2px; }
#ny .logo p { margin: 8px 0 0; color: #fff5e8; text-shadow: 0 2px 0 #2b1e30; font-size: calc(14 * var(--fpx)); }
#ny .levels { display: flex; flex-direction: column; gap: 10px; width: min(330px, 100%); max-height: 46vh; overflow-y: auto; padding: 3px; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
#ny .lv.today { box-shadow: 0 0 0 2px #ffe08a, 3px 4px 0 rgba(20, 14, 22, 0.35); }
#ny .lv.today b { color: #ffe08a; }
#ny .lv { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 10px 12px; background: rgba(43, 36, 51, 0.92); box-shadow: 0 0 0 2px #c99486, 3px 4px 0 rgba(20, 14, 22, 0.35); cursor: pointer; text-align: left; border: 0; color: inherit; font: inherit; }
#ny .lv:active { transform: translateY(2px); }
#ny .lv b { font-weight: 400; color: #ffd6a8; font-size: calc(14 * var(--fpx)); }
#ny .lv span { color: #bdb2c0; grid-column: 1; }
#ny .lv .st { grid-row: 1 / span 2; grid-column: 2; align-self: center; text-align: right; color: #ffe08a; }
#ny .lv.lock { opacity: 0.55; cursor: default; }
#ny .coins { display: flex; align-items: center; gap: 6px; color: #ffe08a; text-shadow: 0 2px 0 #2b1e30; }
#ny .card { width: min(300px, calc(100vw - 48px)); padding: 18px 16px 14px; text-align: center; background: rgba(43, 36, 51, 0.95);
  box-shadow: 0 0 0 2px #e8607a, 0 0 0 4px rgba(43, 36, 51, 0.95), 4px 6px 0 rgba(20, 14, 22, 0.35); }
#ny .card h2 { margin: 4px 0 6px; font-weight: 400; color: #ffd6dc; font-size: calc(18 * var(--fpx)); }
#ny .card .stars { font-size: calc(30 * var(--fpx)); letter-spacing: 6px; color: #5a4458; }
#ny .card .stars i { font-style: normal; display: inline-block; }
#ny .card .stars i.on { color: #ffe08a; animation: nystar 0.5s ease backwards; }
@keyframes nystar { from { transform: scale(2.2) rotate(-30deg); opacity: 0; } }
#ny .card .pts { font-size: calc(26 * var(--fpx)); margin: 4px 0; }
#ny .card p { margin: 4px 0; color: #e8dccf; }
#ny .card .gold { color: #ffe08a; }
#ny .card .row { display: flex; gap: 8px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
#ny .btn { font: 400 calc(13 * var(--fpx)) / 1 var(--pixel-font); letter-spacing: 0; color: #2b2433; background: #f6cf9b; border: 0; padding: 10px 14px; cursor: pointer;
  box-shadow: 0 0 0 2px #2b2433, 0 3px 0 2px #a1724a; pointer-events: auto; }
#ny .btn:active { transform: translateY(2px); box-shadow: 0 0 0 2px #2b2433, 0 1px 0 2px #a1724a; }
#ny .btn.alt { background: #c7bddc; box-shadow: 0 0 0 2px #2b2433, 0 3px 0 2px #6c6292; }
#ny .btn.big { font-size: calc(16 * var(--fpx)); padding: 13px 22px; }
#ny .edge { position: absolute; top: 50%; transform: translateY(-50%); padding: 8px 6px; background: rgba(43, 36, 51, 0.8); color: #ffe08a; display: none;
  box-shadow: 0 0 0 2px rgba(201, 148, 134, 0.85); text-align: center; line-height: 1.2; animation: nynudge 1.2s ease-in-out infinite; }
#ny .edge.l { left: calc(4px + env(safe-area-inset-left)); }
#ny .edge.r { right: calc(4px + env(safe-area-inset-right)); }
#ny.playing .edge.on { display: block; }
@keyframes nynudge { 50% { margin-left: -3px; margin-right: 3px; } }
#ny .edge.r { animation-direction: reverse; }
#ny .mark { position: absolute; width: 20px; height: 20px; margin: -13px 0 0 -13px; border: 3px solid #ffd6dc; animation: nymark 0.45s ease-out forwards; }
#ny .mark.thing { border-color: #ffe08a; }
@keyframes nymark { from { transform: scale(0.4) rotate(45deg); opacity: 1; } to { transform: scale(1.5) rotate(45deg); opacity: 0; } }
#ny .credits .card { text-align: left; line-height: 1.65; }
#ny .credits .card p { margin: 0 0 8px; }
#ny .credits a { color: #a3b4d4; text-decoration: none; border-bottom: 1px solid rgba(163, 180, 212, 0.4); }
#ny .credits b { font-weight: 400; color: #ffebc2; }
#ny .link { background: none; border: 0; color: #bdb2c0; font: inherit; cursor: pointer; padding: 6px; text-decoration: underline; text-underline-offset: 3px; }
#ny .screen.closet { justify-content: flex-end; background: linear-gradient(rgba(30, 22, 34, 0) 35%, rgba(30, 22, 34, 0.75)); }
#ny .sheet { width: min(380px, 100%); max-height: 52vh; overflow-y: auto; padding: 12px 12px 14px; background: rgba(43, 36, 51, 0.95);
  box-shadow: 0 0 0 2px #c99486, 3px 4px 0 rgba(20, 14, 22, 0.35); -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
#ny .sheet .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
#ny .sheet .top b { font-weight: 400; color: #ffd6a8; font-size: calc(16 * var(--fpx)); }
#ny .sheet h3 { margin: 10px 0 6px; font-weight: 400; font-size: inherit; color: #bdb2c0; }
#ny .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#ny .item { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 8px 9px; background: #3a3045; border: 0; color: #f7f0e8; font: inherit; text-align: left; cursor: pointer;
  box-shadow: 0 0 0 1px rgba(201, 148, 134, 0.45); }
#ny .item em { font-style: normal; color: #ffe08a; display: flex; align-items: center; gap: 4px; }
#ny .item.own em { color: #bdb2c0; }
#ny .item.on { box-shadow: 0 0 0 2px #ffe08a; background: #4a3c52; }
#ny .item.on em { color: #9fe0a8; }
#ny .item.no { animation: nyno 0.35s ease; }
@keyframes nyno { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
#ny .tabs { display: flex; gap: 6px; }
#ny .tabs button { font: inherit; color: #bdb2c0; background: none; border: 0; padding: 4px 8px; cursor: pointer; font-size: calc(15 * var(--fpx)); }
#ny .tabs button.on { color: #ffd6a8; box-shadow: inset 0 -2px 0 #ffd6a8; }
#ny .ups { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
#ny .up { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 9px 10px; background: #3a3045; box-shadow: 0 0 0 1px rgba(201, 148, 134, 0.45); }
#ny .up b { font-weight: 400; color: #ffd6a8; }
#ny .up span { color: #bdb2c0; grid-column: 1; }
#ny .up .pips { color: #ffe08a; letter-spacing: 2px; }
#ny .up button { grid-row: 1 / span 3; grid-column: 2; align-self: center; }
#ny .titlebar { display: flex; gap: 10px; align-items: center; }
#ny .nip { position: absolute; left: 50%; top: calc(112px + env(safe-area-inset-top)); transform: translateX(-50%); padding: 4px 10px; display: none; white-space: nowrap;
  background: rgba(36, 70, 44, 0.9); color: #c9ffb0; box-shadow: 0 0 0 2px #7ed36a, 0 0 12px rgba(126, 211, 106, 0.7); animation: nybump 0.6s ease infinite; }
#ny.playing .nip.on { display: block; }
#ny .glow { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.4s ease; box-shadow: inset 0 0 60px 10px rgba(126, 211, 106, 0.55); animation: nyglow 0.9s ease-in-out infinite alternate; }
#ny .glow.on { opacity: 1; }
@keyframes nyglow { to { box-shadow: inset 0 0 90px 18px rgba(255, 182, 220, 0.5); } }
#ny .say { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); max-width: min(300px, calc(100vw - 48px)); padding: 10px 14px; background: #fff8ee; color: #3b2a33;
  font-size: calc(16 * var(--fpx)); text-align: center; box-shadow: 0 0 0 2px #3b2a33, 3px 4px 0 rgba(20, 14, 22, 0.35); animation: nysay 2.4s ease-out forwards; }
#ny .say::after { content: ''; position: absolute; right: 18px; bottom: -12px; border: 6px solid transparent; border-top-color: #3b2a33; border-left-color: #3b2a33; }
@keyframes nysay { 0% { opacity: 0; transform: translateX(-50%) scale(0.6); } 10% { opacity: 1; transform: translateX(-50%) scale(1.05); } 18% { transform: translateX(-50%) scale(1); } 85% { opacity: 1; } 100% { opacity: 0; } }
#ny .point { position: absolute; display: none; transform: translate(-50%, -100%); color: #ffe08a; font-size: calc(18 * var(--fpx)); line-height: 1.1; text-align: center; text-shadow: 0 2px 0 #2b1e30, 0 0 6px rgba(43, 30, 48, 0.8); animation: nypoint 0.8s ease-in-out infinite; }
#ny .point.on { display: block; }
@keyframes nypoint { 50% { margin-top: -8px; } }
#ny .home { position: absolute; left: 0; right: 0; top: 34%; text-align: center; font-size: calc(26 * var(--fpx)); color: #fff; text-shadow: 0 3px 0 #6b2a3a, 0 0 10px rgba(43, 30, 48, 0.7); animation: nycount 2.2s ease-out forwards; }
`;

const PAW = (s: number) => pix([
  '.KK.KK.',
  'KPPKPPK',
  'KPPKPPK',
  '.KK.KK.',
  '..KKK..',
  '.KPPPK.',
  'KPPPPPK',
  '.KKKKK.',
], { K: '#2b2433', P: '#ffb5c2' }, s);

/**
 * What the game puts on the glass: its name and the rooms to choose from; while playing, the time,
 * the points and the run of quick knocks, the count of what is down; points popping up where things
 * come down; and at the end, the card with the stars.
 */
export class NyangUi {
  readonly el: HTMLDivElement;
  private timeEl: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private countEl: HTMLElement;
  private tipEl: HTMLElement;
  private title: HTMLElement;
  private end: HTMLElement;
  private lastCombo = 0;
  private edgeL: HTMLElement;
  private edgeR: HTMLElement;
  private edgeN = [-1, -1];
  private nipEl: HTMLElement;
  private glowEl: HTMLElement;
  private pointEl: HTMLElement;
  private nipN = -1;
  /** a room chosen to play (its index) */
  onPlay: ((i: number) => void) | null = null;
  /** back to the rooms */
  onMenu: (() => void) | null = null;
  /** the wardrobe opened (or shut), and a thing in it chosen */
  onCloset: ((open: boolean) => void) | null = null;
  onPick: ((id: string) => void) | null = null;
  onUp: ((id: string) => void) | null = null;
  private tab: 'wear' | 'up' = 'wear';
  private shown: Save | null = null;
  private closetEl: HTMLElement;

  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.id = 'ny';
    el.innerHTML = `
      <div class="pill time play">0:60</div>
      <div class="pill count play">0 / 0</div>
      <button class="pill menu play" aria-label="그만하기">${pix(['KKKKK', '.....', 'KKKKK', '.....', 'KKKKK'], { K: '#f7f0e8' }, 16)}</button>
      <div class="score play">0<small></small></div>
      <div class="glow"></div>
      <div class="nip"></div>
      <div class="point">톡!<br>▼</div>
      <div class="edge l"></div><div class="edge r"></div>
      <div class="tip"></div>
      <div class="screen title"></div>
      <div class="screen end"></div>
      <div class="screen credits"></div>
      <div class="screen closet"></div>`;
    document.body.appendChild(el);
    this.timeEl = el.querySelector('.time') as HTMLElement;
    this.scoreEl = el.querySelector('.score') as HTMLElement;
    this.comboEl = el.querySelector('.score small') as HTMLElement;
    this.countEl = el.querySelector('.count') as HTMLElement;
    this.tipEl = el.querySelector('.tip') as HTMLElement;
    this.title = el.querySelector('.title') as HTMLElement;
    this.edgeL = el.querySelector('.edge.l') as HTMLElement;
    this.nipEl = el.querySelector('.nip') as HTMLElement;
    this.glowEl = el.querySelector('.glow') as HTMLElement;
    this.pointEl = el.querySelector('.point') as HTMLElement;
    this.edgeR = el.querySelector('.edge.r') as HTMLElement;
    this.end = el.querySelector('.end') as HTMLElement;
    const credits = el.querySelector('.credits') as HTMLElement;
    this.closetEl = el.querySelector('.closet') as HTMLElement;
    for (const s of [this.title, this.end, credits, this.closetEl]) s.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.closetEl.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-close]')) { this.onCloset?.(false); return; }
      const tab = t.closest<HTMLElement>('[data-tab]');
      if (tab && this.shown) { this.tab = tab.dataset.tab as 'wear' | 'up'; this.showCloset(this.shown); return; }
      const up = t.closest<HTMLElement>('[data-up]');
      if (up) { this.onUp?.(up.dataset.up!); return; }
      const b = t.closest<HTMLElement>('[data-pick]');
      if (b) this.onPick?.(b.dataset.pick!);
    });
    credits.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName !== 'A') credits.classList.remove('on'); });
    const menu = el.querySelector('.menu') as HTMLElement;
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => { e.stopPropagation(); this.onMenu?.(); });
    this.title.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-credits]')) { this.credits(credits); return; }
      if ((e.target as HTMLElement).closest('[data-closet]')) { this.onCloset?.(true); return; }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lv]');
      if (b && !b.classList.contains('lock')) this.onPlay?.(+b.dataset.lv!);
    });
    this.end.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (!b) return;
      if (b.dataset.go === 'menu') this.onMenu?.();
      else this.onPlay?.(+b.dataset.go!);
    });
  }

  /** the title, and the rooms */
  showTitle(save: Save) {
    this.el.classList.remove('playing');
    this.end.classList.remove('on');
    this.closetEl.classList.remove('on');
    const card = (L: Level, i: number, open: boolean, cls = '') => {
      const st = save.stars[L.id] ?? 0;
      return `<button class="lv ${open ? '' : 'lock'} ${cls}" data-lv="${i}"><b>${i < LEVELS.length ? `${i + 1}. ` : ''}${L.name}</b><span>${open ? L.blurb : '앞 방에서 별을 하나 따면 열려요'}</span>
        <div class="st">${open ? `${'★'.repeat(st)}<span style="color:#5a4458">${'★'.repeat(3 - st)}</span><br><small style="color:#bdb2c0">${save.best[L.id] ? `최고 ${save.best[L.id].toLocaleString('ko-KR')}` : ''}</small>` : ICONS.lock(18)}</div></button>`;
    };
    const cards = card(dailyLevel(new Date()), LEVELS.length, true, 'today') + LEVELS.map((L, i) => card(L, i, unlocked(save, i))).join('');
    this.title.innerHTML = `<div class="logo">${PAW(40)}<h1>냥아치</h1><p>집사 오기 전에 다 엎어라!</p></div>
      <div class="levels">${cards}</div>
      <div class="titlebar"><div class="coins">${ICONS.coin(18)}${save.coins.toLocaleString('ko-KR')}냥</div><button class="btn alt" data-closet>옷장 · 강화</button></div>
      <button class="link" data-credits>만든 것들</button>`;
    this.title.classList.add('on');
  }

  /** who made what it is made of */
  private credits(el: HTMLElement) {
    el.innerHTML = `<div class="card">
      <p><b>냥아치: 집사 오기 전에</b></p>
      <p>고양이 3D 모델 <b>“3d modelling my cat: Fripouille”</b><br>
      만든 이 <a href="https://sketchfab.com/guillaume.bolis.neko" target="_blank" rel="noopener">guillaume bolis</a> ·
      <a href="https://sketchfab.com/3d-models/3d-modelling-my-cat-fripouille-0ab14bf98e754f8d90fe1bf1c84ca66c" target="_blank" rel="noopener">원본</a><br>
      <a href="https://creativecommons.org/licenses/by/4.0/deed.ko" target="_blank" rel="noopener">CC BY 4.0</a> 라이선스로 공유된 모델이에요.</p>
      <p>이 앱을 위해 뼈대를 새로 심고, 자세와 걸음, 점프와 냥냥펀치, 입과 눈을 새로 만들고, 코 밑에서 턱까지를 짧게, 머리와 눈을 크게, 다리를 조금 굵게 고쳐서 픽셀아트로 다시 칠했어요. (원작자가 이 앱을 보증하는 것은 아니에요.)</p>
      <p>글자 <b>Galmuri</b> · 만든 이 <a href="https://github.com/quiple/galmuri" target="_blank" rel="noopener">이민서(quiple)</a><br>
      <a href="./fonts/OFL.txt" target="_blank" rel="noopener">SIL 오픈 폰트 라이선스 1.1</a>로 공유된 글꼴에서 이 앱이 쓰는 글자만 추려 이름을 바꿔(Window Pixel) 썼어요.</p>
      <p style="color:#bdb2c0">방, 물건, 그림, 소리는 이 앱을 위해 만들었어요. 아무 곳이나 누르면 닫혀요.</p></div>`;
    el.classList.add('on');
  }

  /** the wardrobe: the coats and the things to wear, what each costs, what is owned and on */
  showCloset(save: Save) {
    this.title.classList.remove('on');
    const row = (id: string, name: string, price: number, on: boolean) => {
      const owned = price === 0 || save.owned.includes(id);
      const what = on ? '입는 중' : owned ? '갖고 있음' : `${ICONS.coin(12)}${price}`;
      return `<button class="item ${on ? 'on' : ''} ${owned ? 'own' : ''}" data-pick="${id}"><span>${name}</span><em>${what}</em></button>`;
    };
    const coats = COATS.map((c) => row(c.id, c.name, c.price, save.coat === c.id)).join('');
    const of = (slot: 'neck' | 'head') => WEAR.filter((w) => w.slot === slot).map((w) => row(w.id, w.name, w.price, save[slot] === w.id)).join('');
    const top = this.closetEl.querySelector('.sheet')?.scrollTop ?? 0;
    this.shown = save;
    const ups = UPGRADES.map((u) => {
      const lv = upLevel(save.up, u.id), max = lv >= u.costs.length;
      return `<div class="up"><b>${u.name} <span class="pips">${'■'.repeat(lv)}<span style="color:#5a4458">${'■'.repeat(u.costs.length - lv)}</span></span></b>
        <span>${u.what(lv)}${max ? '' : ` → ${u.what(lv + 1)}`}</span>
        <button class="btn ${max ? 'alt' : ''}" data-up="${u.id}" ${max ? 'disabled' : ''}>${max ? '최고' : `${ICONS.coin(12)}${u.costs[lv]}`}</button></div>`;
    }).join('');
    const body = this.tab === 'wear'
      ? `<h3>털색</h3><div class="grid">${coats}</div>
      <h3>목에</h3><div class="grid">${of('neck')}</div>
      <h3>머리에</h3><div class="grid">${of('head')}</div>`
      : `<div class="ups">${ups}</div>`;
    this.closetEl.innerHTML = `<div class="sheet"><div class="top"><div class="tabs"><button data-tab="wear" class="${this.tab === 'wear' ? 'on' : ''}">옷장</button><button data-tab="up" class="${this.tab === 'up' ? 'on' : ''}">강화</button></div><span class="coins">${ICONS.coin(16)}${save.coins.toLocaleString('ko-KR')}냥</span></div>
      ${body}
      <div class="row"><button class="btn" data-close>다 골랐어요</button></div></div>`;
    (this.closetEl.querySelector('.sheet') as HTMLElement).scrollTop = top;
    this.closetEl.classList.add('on');
  }

  /** a thing in the wardrobe that cannot be had (yet): a shake of it */
  deny(id: string) {
    const b = this.closetEl.querySelector<HTMLElement>(`[data-pick="${id}"], [data-up="${id}"]`);
    if (!b) return;
    b.classList.remove('no');
    void b.offsetWidth;
    b.classList.add('no');
  }

  /** a round begun: the bar shown, the title put away */
  startRound() {
    this.title.classList.remove('on');
    this.end.classList.remove('on');
    this.el.classList.add('playing');
    this.lastCombo = 0;
  }

  /** a number big in the middle, a moment (the count before the start) */
  big(s: string) {
    const d = document.createElement('div');
    d.className = 'big';
    d.textContent = s;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  /** the round as it stands */
  show(r: Round, down: number, all: number) {
    const left = Math.ceil(r.left);
    this.timeEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.timeEl.classList.toggle('low', r.left < 10 && !r.over);
    this.scoreEl.firstChild!.textContent = r.score.toLocaleString('ko-KR');
    const c = r.comboLive;
    if (c !== this.lastCombo) {
      this.comboEl.textContent = c > 1 ? `콤보 x${c}!` : '';
      this.comboEl.classList.remove('on');
      void this.comboEl.offsetWidth;
      if (c > 1) this.comboEl.classList.add('on');
      this.lastCombo = c;
    }
    this.countEl.innerHTML = `${ICONS.check(12)} ${down} / ${all}`;
  }

  /** how many things are still to be had off the screen either side */
  edges(l: number, r: number) {
    if (l !== this.edgeN[0]) { this.edgeL.innerHTML = `◀<br>${l}`; this.edgeL.classList.toggle('on', l > 0); }
    if (r !== this.edgeN[1]) { this.edgeR.innerHTML = `▶<br>${r}`; this.edgeR.classList.toggle('on', r > 0); }
    this.edgeN = [l, r];
  }

  /** the catnip's frenzy: how long it has left (0: over) */
  frenzy(left: number) {
    const n = Math.ceil(left);
    if (n === this.nipN) return;
    this.nipN = n;
    this.nipEl.textContent = `캣닢 타임! 점수 x2 · ${n}`;
    this.nipEl.classList.toggle('on', n > 0);
    this.glowEl.classList.toggle('on', n > 0);
  }

  /** a word said, in a bubble (their people, come home) */
  say(s: string) {
    const d = document.createElement('div');
    d.className = 'say';
    d.textContent = s;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  /** a finger pointing at a point on the screen, to tap there (none: away) */
  point(x: number | null, y = 0) {
    this.pointEl.classList.toggle('on', x !== null);
    if (x === null) return;
    this.pointEl.style.left = `${x}px`;
    this.pointEl.style.top = `${y}px`;
  }

  /** points popping up where a thing came down */
  pop(x: number, y: number, pts: number, name: string, big = false) {
    const d = document.createElement('div');
    d.className = `pop ${big ? 'big' : ''}`;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.innerHTML = `+${pts.toLocaleString('ko-KR')}<i>${name}</i>`;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1450);
  }

  /** where a tap told the cat to go (or what at) */
  mark(x: number, y: number, thing: boolean) {
    const d = document.createElement('div');
    d.className = `mark ${thing ? 'thing' : ''}`;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 500);
  }

  /** a word at the foot of the screen a while */
  tip(s: string, ms = 4000) {
    this.tipEl.textContent = s;
    this.tipEl.classList.add('on');
    clearTimeout(this.tipT);
    this.tipT = window.setTimeout(() => this.tipEl.classList.remove('on'), ms);
  }
  private tipT = 0;

  /** they are home */
  home() {
    const d = document.createElement('div');
    d.className = 'home';
    d.textContent = '딸깍… 집사가 돌아왔다!';
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 2300);
  }

  /** the end of a round: the stars, the points, what came of it, and what next */
  showEnd(r: Round, i: number, record: boolean, coins: number, all: number, nextOpen: boolean) {
    this.el.classList.remove('playing');
    const st = r.stars;
    const stars = [0, 1, 2].map((k) => `<i class="${k < st ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.3}s">★</i>`).join('');
    const say = st === 3 ? '완벽한 냥아치!' : st === 2 ? '집사가 할 말을 잃었어요' : st === 1 ? '꽤 어질렀어요' : '집사가 눈치채지도 못했어요…';
    this.end.innerHTML = `<div class="card"><h2>${say}</h2><div class="stars">${stars}</div>
      <div class="pts">${r.score.toLocaleString('ko-KR')}</div>${record ? '<p class="gold">새 최고 기록!</p>' : ''}
      <p>엎은 것 ${r.downs} / ${all} · 깨뜨린 것 ${r.breaks} · 최고 콤보 x${r.best}</p>
      <p class="gold">+${coins}냥</p>
      <div class="row"><button class="btn alt" data-go="menu">방 고르기</button><button class="btn" data-go="${i}">다시 하기</button>
      ${i + 1 < LEVELS.length ? `<button class="btn" data-go="${i + 1}" ${nextOpen ? '' : 'disabled style="opacity:.5"'}>다음 방 ▶</button>` : ''}</div></div>`;
    this.end.classList.add('on');
  }

  hideAll() {
    this.title.classList.remove('on');
    this.end.classList.remove('on');
    this.closetEl.classList.remove('on');
  }
}
