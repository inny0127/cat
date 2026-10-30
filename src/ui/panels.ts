import { PIX, RAMPS } from '../cat3d/pixclass';
import { CATALOG, SLOT_NAMES, type Item, type Look, type Slot } from '../game/shop';
import { CHECKIN, MISSIONS, levelOf, type Game, type Mission } from '../game/progress';
import { ICONS, pix } from './hud';

const PANEL_CSS = `
#sheet .sec { margin: 6px 0 4px; color: #bdb2c0; }
#sheet .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-bottom: 10px; }
#sheet .day { padding: 5px 0 4px; text-align: center; background: #3a2e3e; box-shadow: 0 0 0 1px #5a4458; color: #bdb2c0; font-size: calc(10 * var(--fpx)); }
#sheet .day.got { background: #5a3a48; color: #ffe08a; box-shadow: 0 0 0 1px #e8607a; }
#sheet .day.today { box-shadow: 0 0 0 2px #ffe08a; }
#sheet .day svg { display: block; margin: 2px auto; }
#sheet .mis { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; align-items: center; padding: 9px 10px; margin-bottom: 7px; background: #3a2e3e; box-shadow: 0 0 0 1px #5a4458; }
#sheet .mis.done { box-shadow: 0 0 0 2px #cfa84a; }
#sheet .mis.claimed { opacity: 0.55; }
#sheet .mis .bar { grid-column: 1; height: 6px; background: #2a2130; box-shadow: 0 0 0 1px #5a4458; position: relative; }
#sheet .mis .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #62908f; }
#sheet .mis.done .bar i { background: #cfa84a; }
#sheet .mis .side { grid-row: 1 / span 2; grid-column: 2; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
#sheet .mis .rw { color: #ffe08a; display: flex; align-items: center; gap: 3px; }
#sheet .note { color: #9a8790; text-align: center; margin: 8px 0 2px; }
#sheet .tabs { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 8px; }
#sheet .tab { flex: none; padding: 6px 9px; background: #3a2e3e; box-shadow: 0 0 0 1px #5a4458; color: #bdb2c0; cursor: pointer; border: 0; font: inherit; }
#sheet .tab.on { background: #f6cf9b; color: #2b2433; box-shadow: 0 0 0 2px #2b2433; }
#sheet .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
#sheet .it { padding: 9px 8px 8px; background: #3a2e3e; box-shadow: 0 0 0 1px #5a4458; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
#sheet .it.worn { box-shadow: 0 0 0 2px #e8607a; }
#sheet .it .sw { display: flex; height: 26px; box-shadow: 0 0 0 1px #1d1420; }
#sheet .it .sw i { width: 14px; }
#sheet .it .look { height: 30px; display: flex; align-items: center; }
#sheet .it .hudbtn { width: 100%; display: flex; gap: 4px; justify-content: center; align-items: center; }
#sheet .it.locked { opacity: 0.6; }
`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = PANEL_CSS;
  document.head.appendChild(st);
}

/** the day's missions, and the week of coming in a row: into the sheet's body */
export function missionsHtml(g: Game) {
  style();
  const wk = (g.streak - 1) % 7;
  const week = CHECKIN.map((c, i) => `<div class="day ${i <= wk ? 'got' : ''} ${i === wk ? 'today' : ''}">${i + 1}일${ICONS.coin(12)}${c}</div>`).join('');
  const rows = g.missions.map((m, i) => missionRow(m, i)).join('');
  return `<div class="sec">출석 ${g.streak}일째${g.streak >= 7 ? ' · 일주일 개근!' : ''}</div><div class="week">${week}</div>
    <div class="sec">오늘의 할 일</div>${rows}<div class="note">할 일은 매일 새로 와요. 내일도 만나요!</div>`;
}

function missionRow(m: Mission, i: number) {
  const done = m.got >= m.need;
  const btn = m.claimed ? `<button class="hudbtn" disabled>받음</button>` : done ? `<button class="hudbtn" data-claim="${i}">받기</button>` : `<span>${Math.floor(m.got)}/${m.need}</span>`;
  return `<div class="mis ${done ? 'done' : ''} ${m.claimed ? 'claimed' : ''}"><div>${MISSIONS[m.kind].say(m.need)}</div>
    <div class="side"><span class="rw">${ICONS.coin(12)}${m.reward}</span>${btn}</div>
    <div class="bar"><i style="width:${Math.round((Math.min(m.got, m.need) / m.need) * 100)}%"></i></div></div>`;
}

const SLOTS: Slot[] = ['wall', 'rug', 'bed', 'curtain', 'neck', 'head'];

/** the shop's things in one place, with what can be done with each: into the sheet's body */
export function shopHtml(g: Game, slot: Slot) {
  style();
  const level = levelOf(g.love).level;
  const tabs = SLOTS.map((s) => `<button class="tab ${s === slot ? 'on' : ''}" data-tab="${s}">${SLOT_NAMES[s]}</button>`).join('');
  const items = CATALOG.filter((i) => i.slot === slot).map((it) => itemCard(g, it, level)).join('');
  return `<div class="tabs">${tabs}</div><div class="grid">${items}</div><div class="note">레벨이 오르면 새 물건이 열려요</div>`;
}

function itemCard(g: Game, it: Item, level: number) {
  const owned = g.owned.includes(it.id), worn = g.worn[it.slot] === it.id, locked = level < it.lv;
  const btn = worn
    ? (it.optional ? `<button class="hudbtn" data-wear="${it.id}">벗기</button>` : `<button class="hudbtn" disabled>사용 중</button>`)
    : owned ? `<button class="hudbtn" data-wear="${it.id}">${it.optional ? '착용' : '사용하기'}</button>`
    : locked ? `<button class="hudbtn" disabled>${ICONS.lock(12)}Lv ${it.lv}</button>`
    : `<button class="hudbtn" data-buy="${it.id}" ${g.coins < it.price ? 'disabled' : ''}>${ICONS.coin(12)}${it.price}</button>`;
  return `<div class="it ${worn ? 'worn' : ''} ${locked && !owned ? 'locked' : ''}">${picture(it)}<div>${it.name}</div>${btn}</div>`;
}

/** what a thing looks like in the shop: a room colour as its ramp, an accessory drawn */
function picture(it: Item) {
  if (it.look) return `<div class="look">${lookIcon(it.look, RAMPS[PIX[it.color ?? 'bookRed']])}</div>`;
  const ramp = Object.values(it.ramps ?? {})[0] ?? RAMPS[{ wall: PIX.wall, rug: PIX.rug, bed: PIX.bed, curtain: PIX.curtain }[it.slot as 'wall'] ?? 0];
  return `<div class="sw">${ramp.map((c) => `<i style="background:${c}"></i>`).join('')}</div>`;
}

function lookIcon(look: Look, ramp: string[]) {
  const pal = { K: '#2c1d27', A: ramp[1], B: ramp[3], C: ramp[4], Y: '#f2c94c', W: '#fff4c2', G: '#5a8e4f' };
  const s = 28;
  switch (look) {
    case 'collar': return pix(['.........', '.BBBBBBB.', 'BAAAAAAAB', '.BBBYBBB.', '....Y....', '...YWY...', '....Y....'], pal, s);
    case 'bandana': return pix(['BBBBBBBBB', '.BCBBBCB.', '..BBBBB..', '...BCB...', '....B....'], pal, s);
    case 'bow': return pix(['BB.....BB', 'BCB...BCB', 'BBBBABBBB', 'BCB...BCB', 'BB.....BB'], pal, s);
    case 'flower': return pix(['...BB....', '..BCCB...', '.BBYYBB..', '..BYYB...', '...BB.G..', '......G..', '.....G...'], pal, s);
    case 'beanie': return pix(['....C....', '...CCC...', '..BBBBB..', '.BBCBBCB.', 'BBBBBBBBB', 'AAAAAAAAA', 'AKAKAKAKA'], pal, s);
    case 'crown': return pix(['B...B...B', 'BB.BBB.BB', 'BBBBBBBBB', 'BCBGBRBCB', 'AAAAAAAAA'], { ...pal, R: '#e8607a' }, s);
  }
}
