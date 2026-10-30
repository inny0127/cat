import { ICONS, pix } from '../ui/hud';
import { LEVELS, unlocked, type Round, type Save } from './round';

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
#ny .levels { display: flex; flex-direction: column; gap: 10px; width: min(330px, 100%); }
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
  /** a room chosen to play (its index) */
  onPlay: ((i: number) => void) | null = null;
  /** back to the rooms */
  onMenu: (() => void) | null = null;

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
      <div class="edge l"></div><div class="edge r"></div>
      <div class="tip"></div>
      <div class="screen title"></div>
      <div class="screen end"></div>
      <div class="screen credits"></div>`;
    document.body.appendChild(el);
    this.timeEl = el.querySelector('.time') as HTMLElement;
    this.scoreEl = el.querySelector('.score') as HTMLElement;
    this.comboEl = el.querySelector('.score small') as HTMLElement;
    this.countEl = el.querySelector('.count') as HTMLElement;
    this.tipEl = el.querySelector('.tip') as HTMLElement;
    this.title = el.querySelector('.title') as HTMLElement;
    this.edgeL = el.querySelector('.edge.l') as HTMLElement;
    this.edgeR = el.querySelector('.edge.r') as HTMLElement;
    this.end = el.querySelector('.end') as HTMLElement;
    const credits = el.querySelector('.credits') as HTMLElement;
    for (const s of [this.title, this.end, credits]) s.addEventListener('pointerdown', (e) => e.stopPropagation());
    credits.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName !== 'A') credits.classList.remove('on'); });
    const menu = el.querySelector('.menu') as HTMLElement;
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    menu.addEventListener('click', (e) => { e.stopPropagation(); this.onMenu?.(); });
    this.title.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-credits]')) { this.credits(credits); return; }
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
    const cards = LEVELS.map((L, i) => {
      const open = unlocked(save, i), st = save.stars[L.id] ?? 0;
      return `<button class="lv ${open ? '' : 'lock'}" data-lv="${i}"><b>${i + 1}. ${L.name}</b><span>${open ? L.blurb : '앞 방에서 별을 하나 따면 열려요'}</span>
        <div class="st">${open ? `${'★'.repeat(st)}<span style="color:#5a4458">${'★'.repeat(3 - st)}</span><br><small style="color:#bdb2c0">${save.best[L.id] ? `최고 ${save.best[L.id].toLocaleString('ko-KR')}` : ''}</small>` : ICONS.lock(18)}</div></button>`;
    }).join('');
    this.title.innerHTML = `<div class="logo">${PAW(40)}<h1>냥아치</h1><p>집사 오기 전에 다 엎어라!</p></div>
      <div class="levels">${cards}</div><div class="coins">${ICONS.coin(18)}${save.coins.toLocaleString('ko-KR')}냥</div>
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
  }
}
