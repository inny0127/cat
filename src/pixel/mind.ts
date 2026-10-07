import * as THREE from 'three';
import type { Nerves } from './nerves';
import { SC_AZ, SC_EL, dirOf } from './midbrain';

/** what each thing it sees is called, in a word or two */
const NAMES: Record<string, string> = {
  dot: '빨간 점', yarn: '털실', wand: '깃털', mouse: '쥐 인형', pompom: '방울', bug: '벌레', bird: '새',
  glint: '햇빛 조각', you: '당신', hand: '손', window: '창', food: '밥그릇', water: '물그릇',
  pointer: '레이저 포인터', goal: '가 볼 곳',
};
/** what it might have a mind to do */
const DOING: Record<string, string> = {
  yawn: '하품', groom: '그루밍', 'groom chest': '가슴 그루밍', wash: '세수', stretch: '기지개', sneeze: '재채기',
  scratch: '귀 긁기', stare: '멍하니 보기', window: '당신 앞으로', wander: '냄새 맡으러', rub: '볼 비비기',
  claw: '발톱 갈기', pompom: '방울 치기', top: '스크래쳐 꼭대기', sun: '햇살 낮잠', warm: '라디에이터 옆',
  'by you': '당신 곁에서 낮잠', play: '털실 놀이', tease: '깃털 놀이', fish: '쥐 인형 꺼내기', gift: '쥐 인형 선물', wrestle: '쥐 인형 레슬링', crab: '게걸음 콩콩',
  ask: '놀자고 조르기', box: '상자', tail: '꼬리 쫓기', zoomies: '우다다', sill: '창턱', bed: '침대로',
  investigate: '살펴보기', wait: '기다리기', chase: '빨간 점 쫓기', hunt: '벌레 사냥', greet: '반가워하기', beg: '밥 달라기',
  paw: '유리 두드리기', snub: '등 돌리기', startle: '깜짝', sulk: '삐짐', trap: '손 붙잡기', 'to bed': '침대로',
  'look with you': '같이 보러 가기', boop: '코 인사', knead: '꾹꾹이', wake: '잠 깨기',
  sniff: '당신 냄새 맡기', shy: '눈 피하기', ambush: '매복', 'look up': '멈칫하고 보기',
  cool: '시원한 바닥에서 쉬기', huff: '시무룩', scent: '공기 냄새 맡기',
};

/** what is on its mind besides what it sees: the will to hunt, what it has a mind to do next,
 *  what it wonders at, what it looks for at this hour */
export interface MindState {
  intent: string | null;
  doing: string | null;
  /** asleep: what it dreams of just now, if anything */
  dream?: string | null;
  /** its strongest urges just now, and how much of them all each is */
  urges?: { key: string; share: number }[];
  /** what it has learnt most about comes of the things it does with you, and how much keener (or
   *  less keen) on each it is for it */
  lessons?: { key: string; by: number }[];
  wonder: string | null;
  expects: { laser: number; wand: number; yarn: number; pet: number; food?: number };
  /** how lively it is (what it takes into its head, how often: whim.ts), and how drowsy */
  pace?: number;
  sleepy?: number;
  /** what its midbrain makes of what it looks at (midbrain.ts's Valence: 0 .. 1 each) */
  feel?: { approach: number; withdraw: number; freeze: number; curious: number };
}

/**
 * The cat's mind, opened (three fingers on the glass at once, the M key, or ?mind in the address):
 * the room as its eyes have it, drawn from where they are along the way they look, wide, without
 * the cat in it, small and in the room's own pixels; on it, a mark on each thing its neurons fire
 * for (the harder, the bigger), the one it attends to ringed; and under it, in a line or two, what
 * it attends to, how much it has a mind to hunt, what it has in mind to do, what it wonders at,
 * what it looks for at this hour.
 */
export class Mind {
  open = false;
  /** its eyes, as a camera: a wide view (most of what it sees sharp, the far edges left out) */
  readonly cam = new THREE.PerspectiveCamera(100, 2, 0.03, 30);
  /** where on the screen its view is drawn (css px, from the top left) */
  readonly rect = { x: 0, y: 0, w: 192, h: 96 };
  private readonly el: HTMLDivElement;
  private readonly marks: HTMLCanvasElement;
  private readonly lines: HTMLDivElement;
  private readonly p = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const el = (this.el = document.createElement('div'));
    el.style.cssText = 'position:fixed;z-index:8;pointer-events:none;display:none;right:8px;top:calc(8px + env(safe-area-inset-top));font:400 calc(10 * var(--fpx, 1px))/1.45 var(--pixel-font);'
      + 'color:#fff5e8;text-shadow:0 1px 0 rgba(43,30,48,.9);';
    const frame = document.createElement('div');
    frame.style.cssText = 'position:relative;border:2px solid rgba(255,245,232,.85);box-shadow:0 0 0 2px rgba(43,30,48,.55);';
    const marks = (this.marks = document.createElement('canvas'));
    marks.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;image-rendering:pixelated';
    frame.appendChild(marks);
    el.appendChild(frame);
    const lines = (this.lines = document.createElement('div'));
    lines.style.cssText = 'margin-top:4px;background:rgba(43,36,51,.72);padding:3px 6px;border-radius:2px;white-space:pre-wrap;word-break:keep-all';
    el.appendChild(lines);
    document.body.appendChild(el);
    this.place();
    addEventListener('resize', () => this.place());
  }

  /** its view's size and place: a little across a phone held upright, at the top right */
  private place() {
    const w = Math.round(Math.min(240, Math.max(150, innerWidth * 0.46)));
    const h = Math.round(w / 2);
    this.rect.w = w;
    this.rect.h = h;
    this.el.style.width = `${w + 4}px`;
    const frame = this.el.firstElementChild as HTMLDivElement;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    this.marks.width = w;
    this.marks.height = h;
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.style.display = on ? 'block' : 'none';
  }

  /** each frame it is open: its eyes where they are, looking where they look; the marks and the
   *  lines */
  update(N: Nerves, m: MindState) {
    if (!this.open) return;
    // (where its view is on the screen just now, as laid out)
    const b = (this.el.firstElementChild as HTMLDivElement).getBoundingClientRect();
    this.rect.x = Math.round(b.left + 2);
    this.rect.y = Math.round(b.top + 2);
    const cam = this.cam;
    cam.aspect = this.rect.w / this.rect.h;
    cam.position.copy(N.eye);
    cam.up.copy(this.up);
    cam.lookAt(this.p.copy(N.eye).add(N.gaze));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // the marks: each thing its neurons fire for, where its eyes have it
    const g = this.marks.getContext('2d');
    if (!g) return;
    const W = this.marks.width, H = this.marks.height;
    g.clearRect(0, 0, W, H);
    // the colliculus: where its neurons fire, warm over the view, as wide as each neuron's bit of it
    const S = N.sc;
    if (N.awake >= 0.3) {
      const cell = Math.max(2, Math.round((5 / cam.fov) * H));
      for (let r = 0; r < SC_EL; r++) {
        for (let c = 0; c < SC_AZ; c++) {
          const f = S.f[r * SC_AZ + c];
          if (f < 0.12) continue;
          const d = dirOf(c, r);
          const q = this.p.set(Math.sin(d.az) * Math.cos(d.el), Math.sin(d.el), Math.cos(d.az) * Math.cos(d.el)).add(N.eye).project(cam);
          if (q.z > 1 || Math.abs(q.x) > 1.1 || Math.abs(q.y) > 1.1) continue;
          const x = Math.round((q.x * 0.5 + 0.5) * W), y = Math.round((-q.y * 0.5 + 0.5) * H);
          g.fillStyle = `rgba(255,128,64,${(0.12 + 0.4 * f).toFixed(2)})`;
          g.fillRect(x - (cell >> 1), y - (cell >> 1), cell, cell);
        }
      }
    }
    for (const u of N.units.values()) {
      if (N.awake < 0.3 || u.a < 0.04 || (!u.here && u.conf < 0.05)) continue;
      const q = this.p.copy(u.conf > 0.2 ? u.belief : u.seen).project(cam);
      if (q.z > 1 || Math.abs(q.x) > 1.1 || Math.abs(q.y) > 1.1) continue;
      const x = Math.round((q.x * 0.5 + 0.5) * W), y = Math.round((-q.y * 0.5 + 0.5) * H);
      const r = Math.round(2 + 5 * u.a);
      const on = N.attending === u;
      g.fillStyle = on ? 'rgba(255,214,102,.9)' : `rgba(255,245,232,${(0.35 + 0.5 * u.a).toFixed(2)})`;
      g.fillRect(x - Math.floor(r / 2), y - Math.floor(r / 2), r, r);
      if (on) {
        // (ringed, square, a pixel wide, with a little room)
        g.strokeStyle = 'rgba(255,214,102,.95)';
        g.lineWidth = 1;
        g.strokeRect(x - r - 2.5, y - r - 2.5, 2 * r + 5, 2 * r + 5);
      }
    }
    // the lines
    const A = N.attending;
    const pct = (k: number) => `${Math.round(k * 100)}%`;
    const top = (['laser', 'wand', 'yarn', 'pet', 'food'] as const).reduce((a, b) => ((m.expects[b] ?? 0) > (m.expects[a] ?? 0) ? b : a), 'laser');
    const looks = (m.expects[top] ?? 0) > 0.25 ? { laser: '레이저 놀이', wand: '깃털 놀이', yarn: '털실 놀이', pet: '쓰다듬기', food: '밥' }[top] : null;
    // (its mood in a word: keyed up, at its ease, drowsy, or quiet)
    const mood = m.pace === undefined ? null : m.pace > 0.85 ? '들뜸' : m.pace > 0.4 ? '느긋함' : (m.sleepy ?? 0) > 0.35 ? '나른함' : '차분함';
    // (its eyes on something it knows nothing of: a thing that moved, or one that stands out of the
    // room; or on a thing it knows, its midbrain's or its attention's)
    const eyesOn = N.place === 'move' ? '움직임' : N.place === 'still' ? '눈에 띄는 것' : S.on && S.peak > 0.5 ? NAMES[S.on] ?? S.on : A ? NAMES[A.id] ?? A.id : '-';
    const F = m.feel;
    const rows = [
      ...(mood ? [`기분  ${mood}`] : []),
      `보는 것  ${eyesOn}`,
      ...(F && N.awake >= 0.3 ? [`신경망  다가감 ${pct(F.approach)} · 물러섬 ${pct(F.withdraw)} · 멈춤 ${pct(F.freeze)} · 호기심 ${pct(F.curious)}`] : []),
      `사냥 욕구  ${pct(N.hunt)}`,
      `하려는 것  ${m.intent ? DOING[m.intent] ?? m.intent : m.doing ? DOING[m.doing] ?? m.doing : '-'}`,
    ];
    if (m.urges?.length && !m.intent && !m.doing) rows.push(`끌리는 것  ${m.urges.map((u) => `${DOING[u.key] ?? u.key} ${Math.round(u.share * 100)}%`).join(', ')}`);
    if (N.awake < 0.3) rows.splice(0, rows.length, '잠들었어요', ...(m.dream ? [`꿈  ${NAMES[m.dream] ?? m.dream}`] : []));
    if (m.wonder) rows.push(`궁금한 것  ${NAMES[m.wonder] ?? m.wonder}`);
    if (m.lessons?.length && N.awake >= 0.3) rows.push(`배운 것  ${m.lessons.map((l) => `${DOING[l.key] ?? l.key} ${l.by > 0 ? '+' : '-'}${Math.round(Math.abs(l.by) * 100)}%`).join(', ')}`);
    if (looks) rows.push(`기다리는 것  ${looks}`);
    const text = rows.join('\n');
    if (this.lines.textContent !== text) this.lines.textContent = text;
  }
}
