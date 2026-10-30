import { NIGHTS, nightOpen, today, type Save } from './game';
import { COATS, allStars, coatOf, coatOpen } from './coats';
import { BADGES } from './journal';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 3; font: 400 calc(12 * var(--fpx)) / 1.4 var(--pixel-font); color: #f2ecff; letter-spacing: 0; word-break: keep-all;
  text-shadow: 0 var(--fpx) 0 rgba(10, 8, 20, 0.9); -webkit-user-select: none; user-select: none; }
#hud .bar { position: absolute; top: calc(8px + env(safe-area-inset-top)); left: calc(10px + env(safe-area-inset-left)); right: calc(10px + env(safe-area-inset-right)); display: none; justify-content: space-between; align-items: flex-start; }
#hud.playing .bar { display: flex; }
#hud .clock { font-size: calc(14 * var(--fpx)); color: #c8d4ff; }
#hud .goals, #hud .gl { font-size: calc(11 * var(--fpx)); color: #c8d4ff; line-height: 1.55; margin-top: 2px; }
#hud .goals div, #hud .gl div { display: flex; align-items: center; gap: 7px; }
#hud .goals i, #hud .gl i { width: 7px; height: 7px; flex: none; box-shadow: 0 0 0 2px #8f9ac8; }
#hud .goals .done, #hud .gl .done { color: #ffd27a; }
#hud .goals .done i, #hud .gl .done i { background: #ffd27a; box-shadow: 0 0 0 2px #ffd27a; }
#hud .gl { display: inline-block; text-align: left; margin: 6px 0 2px; }
#hud .clock small { display: block; font-size: calc(11 * var(--fpx)); color: #8f9ac8; }
#hud .score { text-align: center; font-size: calc(18 * var(--fpx)); }
#hud .score small { display: block; font-size: calc(12 * var(--fpx)); color: #ffd27a; min-height: 1.4em; }
#hud .pause { pointer-events: auto; width: 34px; height: 34px; border: 0; background: rgba(20, 18, 40, 0.6); color: #f2ecff; font: inherit; box-shadow: 0 0 0 2px rgba(150, 160, 230, 0.5); cursor: pointer; }
#hud .held { position: absolute; left: 50%; top: calc(52px + env(safe-area-inset-top)); transform: translateX(-50%); color: #ffb8c6; display: none; white-space: nowrap; }
#hud .held.on { display: block; animation: hpulse 1s ease-in-out infinite; }
@keyframes hpulse { 50% { opacity: 0.55; } }
#hud .mark { position: absolute; transform: translate(-50%, -100%); font-size: calc(16 * var(--fpx)); display: none; }
#hud .mark.q { color: #ffe27a; }
#hud .mark.x { color: #ff5a6e; }
#hud .say { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; color: #e6f0ff; font-size: calc(12 * var(--fpx)); animation: hsay 1.3s ease-out forwards; }
#hud .say.edge { color: #ffd27a; }
@keyframes hsay { 0% { opacity: 0; transform: translate(-50%, -30%); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -110%); } }
#hud .toast { position: absolute; left: 50%; top: 32%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; font-size: calc(16 * var(--fpx)); animation: htoast 1.5s ease-out forwards; }
#hud .toast b { display: block; font-weight: 400; font-size: calc(22 * var(--fpx)); color: #ffd27a; }
@keyframes htoast { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } 20% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -80%); } }
#hud .ncard { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; animation: hcard 3.2s ease-in-out forwards; }
#hud .ncard small { display: block; color: #8f9ac8; font-size: calc(12 * var(--fpx)); letter-spacing: 2px; }
#hud .ncard b { display: block; font-weight: 400; color: #ffd27a; font-size: calc(26 * var(--fpx)); margin: 2px 0 6px; text-shadow: 0 3px 0 #3a2050; }
#hud .ncard .gl { font-size: calc(11 * var(--fpx)); }
@keyframes hcard { 0% { opacity: 0; transform: translate(-50%, -40%); } 12% { opacity: 1; transform: translate(-50%, -50%); } 78% { opacity: 1; } 100% { opacity: 0; } }
#hud .tip { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); transform: translateX(-50%); width: min(80vw, 520px); text-align: center; color: #e6f0ff; opacity: 0; transition: opacity 0.5s ease; }
#hud .tip.on { opacity: 1; }
#hud .stick { position: absolute; width: 110px; height: 110px; margin: -55px 0 0 -55px; border-radius: 50%; box-shadow: inset 0 0 0 2px rgba(200, 210, 255, 0.35); display: none; }
#hud .stick i { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(200, 210, 255, 0.28); }
#hud .btns { position: absolute; right: calc(14px + env(safe-area-inset-right)); bottom: calc(16px + env(safe-area-inset-bottom)); display: none; width: 180px; height: 170px; }
#hud.playing.touch .btns { display: block; }
#hud .b { position: absolute; pointer-events: auto; border-radius: 50%; border: 0; background: rgba(30, 26, 56, 0.55); box-shadow: 0 0 0 2px rgba(190, 200, 255, 0.45); color: #f2ecff; font: inherit; touch-action: none; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.1; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
/* (each button a label round a switch no one sees: on an iPhone a tap on it ticks, felt) */
#hud .b input { visibility: hidden; position: absolute; left: 0; top: 0; margin: 0; pointer-events: none; }
#hud .b.on { background: rgba(255, 170, 190, 0.45); box-shadow: 0 0 0 3px #ffb8c6; }
#hud .b.pounce { right: 0; bottom: 0; width: 92px; height: 92px; font-size: calc(13 * var(--fpx)); }
#hud .b.jump { right: 104px; bottom: 6px; width: 62px; height: 62px; }
#hud .b.listen { right: 12px; bottom: 106px; width: 58px; height: 58px; }
#hud .charge { position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); width: 120px; height: 8px; box-shadow: 0 0 0 2px rgba(200, 210, 255, 0.5); display: none; }
#hud .charge i { display: block; height: 100%; width: 0; background: #ffb8c6; }
#hud .charge.on { display: block; }
#hud .screen { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 12px; pointer-events: auto; padding: 16px;
  background: radial-gradient(ellipse at center, rgba(8, 8, 20, 0.35), rgba(8, 8, 20, 0.85)); overflow-y: auto; }
#hud .screen.on { display: flex; }
#hud .screen > :first-child { margin-top: auto; }
#hud .screen > :last-child { margin-bottom: auto; }
#hud h1 { margin: 0; font-weight: 400; font-size: calc(44 * var(--fpx)); color: #ffd27a; text-shadow: 0 4px 0 #3a2050, 0 0 18px rgba(255, 210, 122, 0.35); letter-spacing: 2px; }
#hud .sub { color: #c8d4ff; margin-top: -4px; }
#hud .nights { display: flex; flex-direction: column; gap: 8px; width: min(340px, 92vw); }
#hud .nt { pointer-events: auto; display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 9px 12px; text-align: left; border: 0; font: inherit; color: inherit; background: rgba(28, 24, 52, 0.9); box-shadow: 0 0 0 2px #7f86c8; cursor: pointer; }
#hud .nt b { font-weight: 400; color: #ffd27a; font-size: calc(14 * var(--fpx)); }
#hud .nt span { color: #a9b0d8; grid-column: 1; }
#hud .nt em { grid-row: 1 / span 2; grid-column: 2; align-self: center; font-style: normal; color: #ffd27a; text-align: right; }
#hud .nt.lock { opacity: 0.5; }
#hud .nt small { color: #8f9ac8; }
#hud .nt.day { box-shadow: 0 0 0 2px #ffd27a; background: rgba(48, 36, 60, 0.92); }
#hud .how { width: min(340px, 92vw); color: #a9b0d8; text-align: left; line-height: 1.6; }
#hud .how b { color: #e6f0ff; font-weight: 400; }
#hud .card { width: min(320px, 90vw); padding: 16px; text-align: center; background: rgba(28, 24, 52, 0.94); box-shadow: 0 0 0 2px #7f86c8, 4px 5px 0 rgba(0, 0, 0, 0.35); }
#hud .card h2 { margin: 0 0 6px; font-weight: 400; color: #ffd27a; font-size: calc(18 * var(--fpx)); }
#hud .card .stars { font-size: calc(30 * var(--fpx)); letter-spacing: 6px; color: #3e3a66; }
#hud .card .stars i { font-style: normal; }
#hud .card .stars i.on { color: #ffd27a; }
#hud .card p { margin: 4px 0; color: #c8d4ff; }
#hud .row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
#hud .btn { pointer-events: auto; font: 400 calc(13 * var(--fpx)) / 1 var(--pixel-font); color: #1c1830; background: #ffd27a; border: 0; padding: 11px 16px; cursor: pointer; box-shadow: 0 0 0 2px #1c1830, 0 3px 0 2px #a07a30; }
#hud .btn.alt { background: #b8c0f0; box-shadow: 0 0 0 2px #1c1830, 0 3px 0 2px #5a64a8; }
#hud .btn:active { transform: translateY(2px); }
#hud .rot { color: #8f9ac8; }
#hud .card.jr { width: min(520px, 94vw); }
#hud .tot { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
#hud .tot div { background: rgba(255, 255, 255, 0.04); padding: 5px 4px; }
#hud .tot span { display: block; color: #8f9ac8; font-size: calc(10 * var(--fpx)); }
#hud .tot b { font-weight: 400; color: #f2ecff; font-size: calc(15 * var(--fpx)); }
#hud .bds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; text-align: left; }
#hud .bd { padding: 5px 7px; box-shadow: 0 0 0 1px #3e3a66; opacity: 0.55; }
#hud .bd.on { opacity: 1; box-shadow: 0 0 0 2px #ffd27a; }
#hud .bd b { display: block; font-weight: 400; color: #ffd27a; font-size: calc(11 * var(--fpx)); }
#hud .bd span { color: #a9b0d8; font-size: calc(10 * var(--fpx)); }
#hud .coats { display: flex; gap: 6px; align-items: center; justify-content: center; flex-wrap: wrap; width: min(340px, 92vw); }
#hud .coats > span { width: 100%; text-align: center; color: #a9b0d8; }
#hud .coat { pointer-events: auto; width: 34px; height: 34px; padding: 0; border: 0; cursor: pointer; position: relative; box-shadow: 0 0 0 2px #3e3a66; background: none; }
#hud .coat i { position: absolute; inset: 3px; }
#hud .coat.on { box-shadow: 0 0 0 3px #ffd27a; }
#hud .coat.lock i { opacity: 0.18; }
#hud .coat em { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: calc(10 * var(--fpx)); color: #c8d4ff; }
@media (max-height: 520px) {
  #hud h1 { font-size: calc(30 * var(--fpx)); }
  #hud .screen { gap: 8px; }
  #hud .nights { display: grid; grid-template-columns: repeat(3, 1fr); width: min(760px, 96vw); }
  #hud .nt { grid-template-columns: 1fr; padding: 7px 10px; }
  #hud .nt span { font-size: calc(11 * var(--fpx)); line-height: 1.3; }
  #hud .nt em { grid-row: auto; grid-column: 1; text-align: left; }
  #hud .how { width: min(760px, 96vw); columns: 2; font-size: calc(11 * var(--fpx)); }
  #hud .goals { font-size: calc(10 * var(--fpx)); line-height: 1.45; }
  #hud .coats { width: min(760px, 96vw); }
  #hud .coats > span { width: auto; margin-right: 6px; }
  #hud .coat { width: 28px; height: 28px; }
  #hud .screen.old .how, #hud .screen.old .sub { display: none; }
  #hud .card.jr { width: min(720px, 96vw); }
  #hud .tot { grid-template-columns: repeat(8, 1fr); }
  #hud .bds { grid-template-columns: repeat(4, 1fr); }
  #hud .nt.day { grid-column: 1 / -1; grid-template-columns: auto 1fr auto; align-items: center; gap: 2px 12px; }
  #hud .nt.day span { grid-column: 2; }
  #hud .nt.day em { grid-column: 3; grid-row: 1; text-align: right; }
  #hud .card { padding: 10px 16px; }
}
`;

/**
 * What is laid over the cat's view: the clock to dawn, the points and the run of catches, what is
 * in the mouth; over the things hunted, a ? when they suspect and a ! when they are off; the
 * sounds they make, written where they come from (at the edge, when it is off to one side); the
 * stick under the thumb and the buttons; and the screens: the nights to choose, the pause, the
 * dawn's reckoning.
 */
export class Hud {
  readonly el: HTMLDivElement;
  readonly btn: { pounce: HTMLElement; jump: HTMLElement; listen: HTMLElement };
  private clockEl: HTMLElement;
  private goalsEl: HTMLElement;
  private scoreEl: HTMLElement;
  private heldEl: HTMLElement;
  private tipEl: HTMLElement;
  private stickEl: HTMLElement;
  private chargeEl: HTMLElement;
  private screen: HTMLElement;
  private marks: HTMLElement[] = [];
  onStart: ((i: number) => void) | null = null;
  onPause: (() => void) | null = null;
  onChoice: ((c: string) => void) | null = null;

  constructor() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.id = 'hud';
    el.innerHTML = `
      <div class="bar"><div><div class="clock"></div><div class="goals"></div></div><div class="score">0<small></small></div><button class="pause" aria-label="멈춤">II</button></div>
      <div class="held">생쥐를 물고 있어요 → 집사 침대로!</div>
      <div class="charge"><i></i></div>
      <div class="stick"><i></i></div>
      <div class="btns"><label class="b listen" role="button" aria-label="귀 기울이기"><input type="checkbox" switch tabindex="-1" aria-hidden="true">귀</label><label class="b jump" role="button" aria-label="점프"><input type="checkbox" switch tabindex="-1" aria-hidden="true">점프</label><label class="b pounce" role="button" aria-label="덮치기"><input type="checkbox" switch tabindex="-1" aria-hidden="true">꾹<br>덮치기</label></div>
      <div class="tip"></div>
      <div class="screen"></div>`;
    document.body.appendChild(el);
    const q = (s: string) => el.querySelector(s) as HTMLElement;
    this.clockEl = q('.clock');
    this.goalsEl = q('.goals');
    this.scoreEl = q('.score');
    this.heldEl = q('.held');
    this.tipEl = q('.tip');
    this.stickEl = q('.stick');
    this.chargeEl = q('.charge');
    this.screen = q('.screen');
    this.btn = { pounce: q('.b.pounce'), jump: q('.b.jump'), listen: q('.b.listen') };
    for (const i of this.el.querySelectorAll<HTMLInputElement>('.b input')) i.addEventListener('focus', () => i.blur());
    q('.pause').addEventListener('pointerdown', (e) => e.stopPropagation());
    q('.pause').addEventListener('click', () => this.onPause?.());
    this.screen.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.screen.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n],[data-c]');
      if (!b || b.classList.contains('lock')) return;
      if (b.dataset.n) this.onStart?.(+b.dataset.n);
      else this.onChoice?.(b.dataset.c!);
    });
  }

  /** the nights to choose from */
  title(save: Save) {
    this.el.classList.remove('playing');
    const T = today(), tOpen = nightOpen(save, -1), tStars = save.stars[T.id] ?? 0;
    const day = `<button class="nt day ${tOpen ? '' : 'lock'}" data-n="-1"><b>${T.name}</b><span>${tOpen ? T.blurb : '첫 번째 밤에서 별을 하나 따면 열려요'}</span>
      <em>${'★'.repeat(tStars)}<span style="color:#3e3a66">${'★'.repeat(3 - tStars)}</span><br><small>${save.best[T.id] ? `오늘 최고 ${save.best[T.id].toLocaleString('ko-KR')}` : '매일 새로운 밤'}</small></em></button>`;
    const cards = day + NIGHTS.map((N, i) => {
      const open = nightOpen(save, i), st = save.stars[N.id] ?? 0;
      const done = N.goals.filter((_, k) => ((save.goals?.[N.id] ?? 0) >> k) & 1).length;
      const best = save.best[N.id] ? `최고 ${save.best[N.id].toLocaleString('ko-KR')}` : '';
      return `<button class="nt ${open ? '' : 'lock'}" data-n="${i}"><b>${N.name}</b><span>${open ? N.blurb : '앞의 밤에서 별을 하나 따면 열려요'}</span>
        <em>${'★'.repeat(st)}<span style="color:#3e3a66">${'★'.repeat(3 - st)}</span><br><small>${best}${best && done ? ' · ' : ''}${done ? `도전 ${done}/${N.goals.length}` : ''}</small></em></button>`;
    }).join('');
    const wide = innerWidth > innerHeight;
    // (once a night has been played, the how-to is let go on a short screen)
    this.screen.classList.toggle('old', Object.keys(save.best).length > 0);
    this.show(`<h1>밤사냥</h1><div class="sub">집사가 잠든 밤, 고양이의 눈으로 사냥을</div>
      <div class="nights">${cards}</div>
      <div class="how"><b>왼쪽</b> 끌어서 걷기 (살짝: 살금살금 · 끝까지: 달리기)<br><b>오른쪽</b> 끌어서 둘러보기<br><b>덮치기</b> 꾹 눌러 씰룩씰룩, 놓으면 덮쳐요 (톡: 냥펀치)<br><b>귀</b> 누르고 있으면 소리가 보여요</div>
      ${this.coats(save)}
      ${wide ? '' : '<div class="rot">가로로 돌리면 더 넓게 보여요</div>'}`);
  }

  /** the coats to wear: a swatch each (fur over sock; a calico both sides), the locked ones with
   *  the stars they want */
  private coats(save: Save) {
    const on = coatOf(save), have = allStars(save);
    const sw = COATS.map((c) => {
      const open = coatOpen(save, c), L = c.left, R = c.right ?? c.left;
      const bg = `linear-gradient(90deg, ${hex(L.fur)} 0 50%, ${hex(R.fur)} 50%) top / 100% 58% no-repeat, linear-gradient(90deg, ${hex(L.sock)} 0 50%, ${hex(R.sock)} 50%)`;
      return `<button class="coat ${c === on ? 'on' : ''} ${open ? '' : 'lock'}" data-c="coat:${c.id}" aria-label="${c.name}"><i style="background:${bg}"></i>${open ? '' : `<em>★${c.stars}</em>`}</button>`;
    }).join('');
    return `<div class="coats"><span>내 고양이: ${on.name} · 별 ${have}개</span>${sw}<button class="btn alt" data-c="journal" style="margin-left:10px">수첩</button><button class="btn alt" data-c="sound">${save.mute ? '소리 끔' : '소리 켬'}</button></div>`;
  }

  playing(touch: boolean) {
    this.hideScreen();
    this.el.classList.add('playing');
    this.el.classList.toggle('touch', touch);
  }

  pause(mute: boolean) {
    this.show(`<div class="card"><h2>잠깐 멈춤</h2>
      <div class="row"><button class="btn" data-c="resume">계속하기</button></div>
      <div class="row"><button class="btn alt" data-c="retry">처음부터</button><button class="btn alt" data-c="menu">밤 고르기</button><button class="btn alt" data-c="sound">${mute ? '소리 끔' : '소리 켬'}</button></div></div>`);
  }

  /** a night begun: its name over the clock's first hour, and what it asks */
  card(name: string, goals: string[]) {
    this.el.querySelector('.ncard')?.remove();
    const d = document.createElement('div');
    d.className = 'ncard';
    d.innerHTML = `<small>AM 2:00</small><b>${name}</b><div class="gl">${Hud.goalList(goals.map((text) => ({ text, done: false })))}</div>`;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 3300);
  }

  /** the night's challenges, by the clock (done ones lit) */
  goals(list: { text: string; done: boolean }[]) {
    this.goalsEl.innerHTML = Hud.goalList(list);
  }
  private static goalList(list: { text: string; done: boolean }[]) {
    return list.map((g) => `<div class="${g.done ? 'done' : ''}"><i></i>${g.text}</div>`).join('');
  }

  /** dawn: the night's reckoning */
  end(o: { name: string; score: number; stars: number; record: boolean; caught: Record<string, number>; gifts: number; best: number; wakes: number; i: number; next: boolean; goals: { text: string; done: boolean }[]; knocked: number; coats: string[]; badges: string[] }) {
    this.el.classList.remove('playing');
    const stars = [0, 1, 2].map((k) => `<i class="${k < o.stars ? 'on' : ''}">★</i>`).join('');
    const say = o.stars === 3 ? '전설의 사냥꾼!' : o.stars === 2 ? '훌륭한 사냥이었어요' : o.stars === 1 ? '나쁘지 않은 밤' : '내일 밤엔 더 잘할 거예요';
    this.show(`<div class="card"><p>${o.name} · 새벽 5시</p><h2>${say}</h2><div class="stars">${stars}</div>
      <p style="font-size:calc(24 * var(--fpx));color:#f2ecff">${o.score.toLocaleString('ko-KR')}</p>${o.record ? '<p style="color:#ffd27a">새 최고 기록!</p>' : ''}
      <p>나방 ${o.caught.moth} · 귀뚜라미 ${o.caught.cricket} · 생쥐 ${o.caught.mouse}${o.caught.spider ? ` · 거미 ${o.caught.spider}` : ''}</p>
      <p>선물 ${o.gifts} · 최고 연속 ${o.best}${o.knocked ? ` · 떨어뜨림 ${o.knocked}` : ''}${o.wakes ? ` · 집사 깨움 ${o.wakes}` : ''}</p>
      <div class="gl">${Hud.goalList(o.goals)}</div>
      ${o.coats.map((n) => `<p style="color:#ffd27a">새 털색: ${n}! (밤 고르기에서 바꿔 입어요)</p>`).join('')}
      ${o.badges.map((n) => `<p style="color:#ffd27a">새 배지: ${n}!</p>`).join('')}
      <div class="row"><button class="btn alt" data-c="menu">밤 고르기</button><button class="btn" data-n="${o.i}">다시 하기</button>${o.i >= 0 && o.i + 1 < NIGHTS.length ? `<button class="btn ${o.next ? '' : 'lock'}" data-n="${o.i + 1}" ${o.next ? '' : 'style="opacity:.5"'}>다음 밤</button>` : ''}</div></div>`);
  }

  /** the hunting journal: counts across every night, and the badges, won and to win */
  journal(save: Save) {
    const t = save.totals ?? {}, n = (k: string) => (t[k] ?? 0).toLocaleString('ko-KR');
    const won = new Set(save.badges ?? []);
    const rows = [['나방', n('moth')], ['귀뚜라미', n('cricket')], ['생쥐', n('mouse')], ['거미', n('spider')], ['선물', n('gifts')], ['떨어뜨린 물건', n('knocked')], ['최고 연속', n('bestChain')], ['보낸 밤', n('nights')]];
    const badges = BADGES.map((b) => `<div class="bd ${won.has(b.id) ? 'on' : ''}"><b>${won.has(b.id) ? '★' : '☆'} ${b.name}</b><span>${b.how}</span></div>`).join('');
    this.show(`<div class="card jr"><h2>사냥 수첩</h2>
      <div class="tot">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      <p style="margin-top:8px">배지 ${won.size}/${BADGES.length}</p>
      <div class="bds">${badges}</div>
      <div class="row"><button class="btn" data-c="menu">돌아가기</button></div></div>`);
  }

  private show(html: string) {
    this.screen.innerHTML = html;
    this.screen.classList.add('on');
  }
  hideScreen() {
    this.screen.classList.remove('on');
  }

  /** the bar: the clock, the points, the run */
  bar(clock: string, left: number, score: number, chain: number) {
    this.clockEl.innerHTML = `AM ${clock}<small>${left < 20 ? '곧 새벽!' : ''}</small>`;
    this.scoreEl.firstChild!.textContent = score.toLocaleString('ko-KR');
    (this.scoreEl.querySelector('small') as HTMLElement).textContent = chain > 1 ? `${chain}연속 x${Math.min(3, 1 + 0.5 * (chain - 1))}` : '';
  }

  held(on: boolean) {
    this.heldEl.classList.toggle('on', on);
  }

  /** the stick under the thumb (none: away) */
  stick(s: { ox: number; oy: number; x: number; y: number } | null) {
    this.stickEl.style.display = s ? 'block' : 'none';
    if (!s) return;
    this.stickEl.style.left = `${s.ox}px`;
    this.stickEl.style.top = `${s.oy}px`;
    let dx = s.x - s.ox, dy = s.y - s.oy;
    const m = Math.hypot(dx, dy);
    if (m > 55) { dx *= 55 / m; dy *= 55 / m; }
    (this.stickEl.firstElementChild as HTMLElement).style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** the wiggle's wind-up (null: none) */
  charge(c: number | null) {
    this.chargeEl.classList.toggle('on', c !== null);
    if (c !== null) (this.chargeEl.firstElementChild as HTMLElement).style.width = `${Math.min(100, c * 100)}%`;
  }

  /** the ? and ! over things (screen points; the rest hidden) */
  setMarks(list: { x: number; y: number; k: 'q' | 'x' }[]) {
    while (this.marks.length < list.length) {
      const d = document.createElement('div');
      d.className = 'mark';
      this.el.appendChild(d);
      this.marks.push(d);
    }
    this.marks.forEach((d, i) => {
      const m = list[i];
      if (!m) { d.style.display = 'none'; return; }
      d.style.display = 'block';
      d.className = `mark ${m.k}`;
      d.textContent = m.k === 'q' ? '?' : '!';
      d.style.left = `${m.x}px`;
      d.style.top = `${m.y}px`;
    });
  }

  /** a sound written where it came from (edge: off to one side, written at the edge that way) */
  say(word: string, x: number, y: number, edge: boolean) {
    const d = document.createElement('div');
    d.className = `say ${edge ? 'edge' : ''}`;
    d.textContent = word;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1350);
  }

  toast(head: string, line: string) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = `${line}<b>${head}</b>`;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1550);
  }

  tip(s: string, ms = 4000) {
    this.tipEl.textContent = s;
    this.tipEl.classList.add('on');
    clearTimeout(this.tipT);
    this.tipT = window.setTimeout(() => this.tipEl.classList.remove('on'), ms);
  }
  private tipT = 0;
}
