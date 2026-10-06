/** what the things a cat does mean, said the first time it does each (most telling first) */
export const FIRSTS: Record<string, string> = {
  hunch: '등을 웅크리고 있어요. 몸이 안 좋다는 신호예요',
  blink: "천천히 눈을 깜빡였어요. 고양이식 '좋아해'예요",
  bonk: '머리를 콩 부딪쳐 와요. 당신을 정말 좋아한다는 인사예요',
  purr: '골골송을 불러요. 기분이 아주 좋대요',
  knead: '꾹꾹이를 해요. 아기 고양이 때처럼 편하고 행복하대요',
  rub: '손가락에 볼을 비벼요. 당신에게 자기 냄새를 묻히는 중이에요',
  bite: "살짝 깨물었어요. '좋았어, 이제 그만'이라는 뜻이에요",
  airlick: '꼬리 뿌리를 긁어 주자 허공을 날름날름 핥아요. 너무 좋대요',
  thump: '누워서 꼬리로 바닥을 탁탁 쳐요. 짜증 났다는 뜻이에요',
  grumble: '낮게 웅얼거려요. 슬슬 그만하라는 경고예요',
  arch: '등을 아치처럼 세웠어요. 무섭지만 맞서겠다는 뜻이에요',
  slink: '몸을 낮추고 살금살금 걸어요. 아직 겁이 나나 봐요',
  beg: '빈 밥그릇 옆에서 당신을 봐요. 밥 달라는 뜻이에요',
  lead: '앞에 와서 울더니 밥그릇 쪽으로 가며 돌아봐요. 따라오래요',
  more: '손을 떼자 머리를 내밀며 쳐다봐요. 더 쓰다듬어 달래요',
  trap: '와락 끌어안고 뒷발로 팡팡! 고양이 배는 원래 함정이에요',
  wrestle: '쥐 인형을 끌어안고 뒷발로 팡팡 차요. 사냥 놀이예요',
  sleeppurr: '자면서도 골골거려요. 당신 손이 편한가 봐요',
  back: '배를 드러내고 자요. 여기가 아주 안전하대요',
  flop: '발라당 누워 배를 보여요. 마음을 푹 놓았다는 뜻이에요',
  greet: '꼬리를 바짝 세우고 와요. 반갑다는 인사예요',
  silent: '소리 없이 야옹했어요. 아주 가까운 사이에만 하는 인사예요',
  flehmen: '입을 벌리고 멍하니 있어요. 냄새를 맛보는 중이에요',
  claw: "발톱을 갈아요. 손질이자 '여긴 내 자리'라는 표시예요",
  bunt: "기둥에 볼을 비벼요. 냄새로 '내 거'라고 적어 두는 거예요",
  snub: '등을 돌리고 앉았어요. 아직 조금 삐졌대요',
  chatter: '턱을 떨며 짹짹거려요. 사냥하고 싶어 근질근질한가 봐요',
  stare: '빈 곳을 빤히 봐요. 고양이 눈에만 보이는 게 있나 봐요',
  tilt: '고개를 갸웃했어요. 무슨 소리인지 궁금한가 봐요',
  zoomies: '우다다! 남는 힘을 한꺼번에 쏟아내는 중이에요',
  blep: '혀끝이 쏙 나왔어요. 넣는 걸 깜빡했나 봐요',
  loaf: '식빵을 굽고 있어요. 앞발을 쏙 넣고 느긋하게 쉬는 중이에요',
  seewith: '당신이 보는 곳이 궁금했나 봐요. 따라와서 같이 봐요',
  sniff: '코앞에 온 당신 냄새를 킁킁 맡아요. 아는 냄새인지 보나 봐요',
  shy: '빤히 보니 눈을 피해요. 고양이끼리 빤히 보는 건 실례래요',
  ambush: '상자에 몸을 숨기고 노려요. 곧 튀어나올 거예요!',
  glance: '그루밍하다 멈칫! 뭔가 눈에 띄었나 봐요',
  earsound: '자면서도 귀만 소리 쪽으로 돌려요. 다 듣고 있어요',
  snore: '쌔근쌔근 코를 골아요. 아주 깊이, 마음 놓고 자는 중이에요',
  huff: '조르다 대답이 없자 한숨을 쉬어요. 조금 서운한가 봐요',
  cool: '바닥에 길게 누웠어요. 더워서 시원한 곳을 찾았대요',
};

/** the line at the foot of the screen, as far as the first words need it */
export interface Line {
  show(text: string, ms?: number): void;
  readonly visible: boolean;
  readonly text: string;
}

/**
 * The first time the cat does each of the things in FIRSTS (and you are there to see it), a word
 * on what it means: one at a time, a good while apart, never over anything else being said; and
 * if something that mattered more is said over it at once, before it could be read, it is as if it
 * had not been said (the next time the cat does it, then). What has been said is kept in the saved
 * hints `said()` gives, under 'first <what>'.
 */
export class Firsts {
  /** till the next may be said (the first a while after the app opens) */
  private wait = 30;
  /** the word just put up, and how long ago */
  private up: { k: string; t: number } | null = null;
  constructor(private readonly said: () => Record<string, number>, private readonly line: Line) {}

  /** seen: what it is doing or has just done; ok: whether you are there to see it */
  update(dt: number, seen: Set<string>, ok: boolean) {
    const said = this.said(), up = this.up;
    if (up && (up.t += dt) < 3 && this.line.text !== FIRSTS[up.k]) {
      delete said['first ' + up.k];
      this.up = null;
      this.wait = 20;
    } else if (up && up.t >= 3) this.up = null;
    this.wait -= dt;
    if (this.wait > 0 || !seen.size || !ok || this.line.visible) return null;
    const k = Object.keys(FIRSTS).find((k) => seen.has(k) && !said['first ' + k]);
    if (!k) return null;
    said['first ' + k] = 1;
    this.line.show(FIRSTS[k], 6000);
    this.up = { k, t: 0 };
    this.wait = 90;
    return k;
  }
}
