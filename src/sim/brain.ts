import type { Avatar } from './avatar';
import type { CatAudio } from '../audio/audio';
import type { Haptic } from '../platform/haptics';
import type { Hint } from '../ui/hint';
import type { Contact } from '../input/pointer';
import type { CatState } from './state';
import { GRAIN_TOLERANT, ZONE_LIKE, type Zone } from './zones';
import { THRESH, chooseErrand, crepuscular, needs, nightness, runErrand } from './life';
import { chance, clamp, rand, smoothstep } from '../util/math';

export type Mode = 'sleep' | 'doze' | 'rest' | 'alert' | 'enjoy' | 'annoyed' | 'angry' | 'leaving' | 'away' | 'arriving' | 'dead' | 'gone';

export interface Senses {
  zoneAt(px: number, py: number): Zone;
  grainAt(px: number, py: number): [number, number];
  /** screen position of the head, for leaning into a hand */
  headScreen(): { x: number; y: number };
  viewW(): number;
  motionShake: boolean; // can the phone itself be shaken?
  /** which ear a touch at this point is on (default: the painting's left half is the left ear) */
  earSide?(px: number, py: number): 'L' | 'R';
  /** is a touch at this point on the nose */
  noseAt?(px: number, py: number): boolean;
}

const HINT = {
  pet: '고양이 머리나 볼을 손가락으로 살며시 쓰다듬어 보세요',
  foodShake: '휴대폰을 흔들면 사료 봉지 소리가 나요',
  foodScrub: '빈 곳을 좌우로 빠르게 문지르면 사료를 부어 줄 수 있어요',
  water: '빈 곳을 길게 누르고 있으면 물을 따라요',
  litter: '빈 곳을 아래로 쓸어내리면 화장실 모래를 치워요',
  sulk: '고양이가 기분이 상해서 구석으로 가 버렸어요. 조금 내버려 두면 마음이 풀릴 거예요',
  sulkTouch: '아직 삐져 있어요. 조금 더 기다렸다가 살며시 다가가 보세요',
  madeUp: '고양이가 마음을 풀었어요. 화해했어요',
  away: '고양이는 잠시 자리를 비웠어요',
  sick: '고양이가 아파요. 밥과 물을 챙겨 주세요',
  dead: '고양이가 더 이상 숨을 쉬지 않아요. 오래 눌러 작별 인사를 할 수 있어요',
  gone: '창가가 비었어요. 빈 곳을 오래 누르면 새 고양이가 찾아올지도 몰라요',
  notify: '고양이가 당신을 부를 수 있게 알림을 허용해 주세요',
};

/** the first time a hand annoys it for a reason, what the reason was (once for each) */
const WHY: Record<string, string> = {
  against: '털을 거꾸로 쓸면 싫어해요. 머리에서 꼬리 쪽으로 쓰다듬어 주세요',
  tail: '꼬리를 만지는 건 싫어해요',
  belly: '배를 만지는 건 아직 싫어해요',
  paw: '발을 만지는 건 싫어해요',
  face: '얼굴 한가운데보다는 볼이나 턱 밑을 좋아해요',
  rough: '너무 빠르게 쓰다듬으면 싫어해요. 천천히 쓰다듬어 주세요',
  over: '오래 쓰다듬으니 귀찮아해요. 잠깐 쉬게 해 주세요',
};

/** how long each voice lasts (s), for a mouth to move with when the sound itself is not playing */
const VOICE_LEN: Record<string, number> = { trill: 0.29, meow: 0.65, meowSoft: 0.44, meowPlead: 0.92, chirp: 0.11, grumble: 0.41 };

/**
 * The cat's mind while you're looking: moods that rise and fade, a body that wants food and
 * sleep, and a relationship with you that every touch nudges.
 */
const asleepNow = (m: string) => m === 'sleep' || m === 'doze';

export class Brain {
  mode: Mode = 'sleep';
  private modeT = 0;
  // fast emotions, 0..1
  pleasure = 0;
  irritation = 0;
  fear = 0;
  arousal = 0;
  stim = 0; // seconds of recent petting, for overstimulation
  sleepDepth = 1;
  purr = 0;
  /** awake, how long yet (s of nobody touching it, by night the quicker) before it nods off: a
   *  few minutes of sitting about, looking round, a thing or two of its own, by day; less at night */
  private wantSleepIn = rand(90, 240);
  /** how long yet this sleep lasts before it wakes of itself (s) */
  private napLeft = rand(600, 1500);
  private peekIn = rand(40, 160);
  private lastTouch = -1e9;
  /** when it last asked for more (see tidyUp), and till when it is asking */
  private askedAt = -1e9;
  private askingUntil = 0;
  /** asking for more now: eyes open on you, ears up (mood.ts) */
  get asking() {
    return this.time < this.askingUntil && this.mode === 'enjoy' && this.time - this.lastTouch > 0.3;
  }
  /** the hands on it this time: how long all told, how long against the lie of its fur, and
   *  where (seconds by zone); when they have been gone a moment, a cat often puts its coat to
   *  rights where it was touched */
  private session = { t: 0, against: 0, zones: {} as Partial<Record<Zone, number>>, endedAt: -1, bit: false };
  /** what made the hands on it unpleasant of late (a tally for each reason, fading), and whether
   *  it has been said this time it was annoyed */
  private why: Record<string, number> = {};
  private whySaid = false;
  private lastToy = -1e9;
  private touchCount = 0;
  private pokes: number[] = [];
  private taps: number[] = [];
  private hissAt = -1e9;
  private angryUntil = 0;
  private askIn = rand(3, 8);
  private peekEye = 0;
  /** asleep under a hand it trusts, not woken by it (so it purrs in its sleep) */
  private drowsy = false;
  private glance: { x: number; y: number; until: number } | null = null;
  private attention: { x: number; y: number; until: number } | null = null;
  private errandWait = 0;
  private arrivalCue = -1;
  private time = 0;
  private hadPurred = false;
  private wantNotifyAsk = false;
  t = 0;
  /** set by the app: called when the brain wants the notification permission prompt on next tap */
  onWantNotify: () => void = () => {};
  /** called when the motion permission would help (iOS) */
  onWantMotion: () => void = () => {};

  constructor(
    private s: CatState,
    private anim: Avatar,
    private audio: CatAudio,
    private haptic: Haptic,
    private hint: Hint,
    private senses: Senses,
  ) {}

  get state() {
    return this.s;
  }

  private earSide(c: Contact) {
    return this.senses.earSide ? this.senses.earSide(c.px, c.py) : c.px < 120 ? 'L' : 'R';
  }

  /** decide how we find the cat when the window is opened (away: how long since it was last
   *  open, seconds) */
  wake(now: number, firstEver: boolean, away = 0) {
    const s = this.s;
    this.time = now;
    if (!s.alive) {
      this.setMode(s.buried ? 'gone' : 'dead');
      this.anim.setHidden(s.buried);
      if (!s.buried) this.later(2.5, () => this.hint.show(HINT.dead, 7000));
      else this.later(2, () => this.hint.show(HINT.gone, 7000));
      return;
    }
    if (s.where === 'away') {
      if (!this.anim.awayAt) {
        this.setMode('away');
        this.anim.setHidden(true);
        return;
      }
      // a body with a room keeps to it: away, the cat is somewhere in it all the same (at the bowl,
      // in the box, sulking in a corner); out and about the house, it is about the room, and home
      // by its own way of it
      this.anim.setHidden(false);
      const why = s.awayReason ?? 'wander';
      this.anim.awayAt(why);
      if (why !== 'wander') {
        this.setMode('away');
        if (why === 'sulk') this.sulkFrom = now - 60;
        return;
      }
      s.where = 'bed';
      s.awayReason = null;
    }
    this.anim.setHidden(false);
    const n = needs(s);
    // (by the clock on the wall: now is the brain's own time, seconds since the page opened)
    const nightly = nightness(Date.now());
    if (firstEver) {
      // (the first time: awake in its bed, and it has seen you, a new face at the glass, and comes
      // up to it to look at you, curious; a cat that does not know you yet, deep asleep, would only
      // start at the first touch)
      this.toAwake('rest');
      this.later(1.2, () => this.anim.greet?.(0.1));
      return;
    }
    // back after a while: it has seen you, and is glad of it as far as it is fond of you, and the
    // longer you were gone (a look round from it after a minute; after a quarter of an hour, all
    // of a hello)
    const glad = clamp((s.trust - 0.15) / 0.6) * clamp(away / 900);
    if (n.food || n.water || (s.trust > 0.35 && s.lonely > 0.6 && chance(0.6))) {
      this.toAwake('alert');
      if (s.trust > 0.3) { this.later(0.8, () => this.say('trill')); this.chatter(away); }
      // (missing you, gone an hour or more: as often as not it has been sat at the glass waiting
      // for you all the while, and there you are)
      if (!n.food && !n.water && away > 3600 && s.trust > 0.45 && this.anim.waited && chance(0.5)) {
        this.anim.waited(Math.max(glad, 0.5));
        return;
      }
      // (up to the glass to see you: hungry, you are why it is glad)
      if (glad > 0.1 || n.food || n.water) this.later(1, () => this.anim.greet?.(Math.max(glad, 0.3)));
      return;
    }
    // (a cat fond of you, after long enough, as often as not gets up out of its nap for you)
    if (chance((0.72 + nightly * 0.2) * (1 - 0.35 * glad))) {
      this.toSleep(rand(0.6, 1));
      // (asleep, it heard you come all the same: an eye opens on you in a moment, and if it trusts
      // you a slow blink, before it goes back to sleep)
      if (glad > 0.05) this.greetPeek = rand(1.5, 4);
    } else {
      this.toAwake('rest');
      if (glad > 0.2 && chance(0.35 + 0.65 * glad)) {
        this.later(0.9, () => this.say('trill'));
        this.chatter(away);
        this.later(1, () => this.anim.greet?.(glad));
      }
    }
  }
  /** an eye opened on you this soon after you came back (s; 0: none) */
  private greetPeek = 0;

  /** back after a long day away (five hours and more), a cat fond of you has a deal to say about
   *  it: after its first hello, as it comes up to the glass, a meow and a trill and a chirp, one
   *  after another (the more of a talker it is, the more) */
  private chatter(away: number) {
    if (away < 5 * 3600 || this.s.trust < 0.45) return;
    const n = Math.round((2 + Math.random() * 2) * (0.6 + 0.6 * this.s.personality.voice));
    let t = 1.9;
    for (let i = 0; i < n; i++) {
      t += rand(0.6, 1.3);
      const r = Math.random();
      const what = r < 0.35 ? 'meow' : r < 0.65 ? 'trill' : r < 0.85 ? 'chirp' : 'meowSoft';
      this.later(t, () => this.say(what));
    }
  }

  // ------------------------------------------------------------------ input events
  touchStart(c: Contact) {
    if (this.mode === 'away' && this.anim.inRoom && this.s.alive) {
      // (sulking in its corner: that is another thing)
      if (this.s.awayReason === 'sulk') {
        this.awayTouch();
        return;
      }
      // at the bowl, the water, the tray: a hand on it there is a hand on it like any other (it
      // gets on with what it was doing under it, and is about the room again after)
      this.s.where = 'bed';
      this.s.awayReason = null;
      this.toAwake('rest', true);
    }
    if (this.inert) return;
    const zone = this.senses.zoneAt(c.px, c.py);
    this.lastTouch = this.time;
    this.touchCount++;
    // (asked for more, and a hand back on it before long: glad of it, the purr straight up again,
    // and as often as not a slow blink)
    if (this.time - this.askedAt < 8 && this.mode === 'enjoy' && zone !== 'tail' && zone !== 'paw' && zone !== 'belly') {
      this.askedAt = -1e9;
      this.askingUntil = 0;
      this.pleasure = clamp(this.pleasure + 0.25);
      this.purr = Math.max(this.purr, 0.5);
      if (chance(0.6)) this.later(rand(0.6, 1.2), () => { if (this.mode === 'enjoy') this.anim.doBlink(true); });
    }
    if ((this.mode === 'sleep' || this.mode === 'doze') && this.s.trust > 0.65 && this.irritation < 0.2
      && zone !== 'tail' && zone !== 'paw' && zone !== 'belly' && zone !== 'none') {
      // so sure of the hand that it is not worth waking for: an ear turned to it, an eye opened a
      // slit and shut again, and it sleeps on under it, more lightly, and before long purrs in its
      // sleep (its tail, its paws and its belly it keeps to itself, asleep or not)
      this.anim.twitchEar('both', 0.35);
      this.setMode('doze');
      this.sleepDepth = Math.min(this.sleepDepth, 0.56);
      this.drowsy = true;
      this.peekEye = 0.22;
      this.later(rand(1.1, 1.8), () => { if (this.mode === 'doze' || this.mode === 'sleep') this.peekEye = 0; });
    } else if (this.mode === 'sleep' || this.mode === 'doze') {
      const deep = this.sleepDepth;
      // a hand out of nowhere: startle, harder when deeply asleep or not trusting
      const startle = deep * (0.35 + 0.45 * clamp(0.5 - this.s.trust)) * (1 - 0.35 * (this.s.personality.bold ?? 0));
      this.fear = clamp(this.fear + startle * (this.s.trust < 0.2 ? 1.2 : 0.6));
      this.irritation = clamp(this.irritation + startle * 0.15);
      if (startle > 0.25) this.anim.jolt(startle * 1.4);
      else this.anim.twitchEar('both', 0.8);
      this.toAwake(this.s.trust > 0.4 && zone !== 'tail' && zone !== 'paw' ? 'rest' : 'alert');
      this.peekEye = 0;
    } else if (this.mode !== 'angry' && this.anim.unseen) {
      // awake, and a hand on it it never saw coming (round behind it, its head turned away): a
      // start, the ears flicked, and round to see whose it is; less of one, the surer of you it is.
      // Seen coming, it takes it as it comes
      const u = this.anim.unseen(c.sx, c.sy);
      const k = clamp((u - 0.5) * 2) * (1 - 0.6 * clamp(this.s.trust)) * (1 - 0.4 * (this.s.personality.bold ?? 0));
      if (k > 0.12) {
        this.anim.jolt(0.25 + 0.6 * k);
        this.anim.twitchEar('both', 0.5 + 0.4 * k);
        this.fear = clamp(this.fear + 0.2 * k);
      }
    }
    // its belly offered (rolled over before you, flat out, asleep on its back) and a hand put on
    // it: a trap, the hand hugged and bitten at and kicked, and let go. Half a game and half
    // meant: for as long as it has the hand, no harm done; a hand left on its belly after, that is
    // another thing
    if (zone === 'belly' && this.mode !== 'angry' && this.s.trust > 0.25 && this.anim.bellyTrap?.()) {
      this.trapUntil = this.time + 3.2;
      this.arousal = clamp(this.arousal + 0.35);
      this.irritation = clamp(this.irritation + 0.05);
    }
    if (this.mode === 'angry' && this.time - this.hissAt < 2.5) {
      // you touched it right after it hissed
      this.leave('sulk');
    }
  }
  /** a hand in its trap till then (see touchStart) */
  private trapUntil = -1;

  touchEnd(c: Contact, tap: boolean) {
    if (this.inert) return;
    if (tap) this.poke(c);
    if (this.hadPurred && !this.s.notifyAsked && !this.wantNotifyAsk) {
      this.wantNotifyAsk = true;
      this.later(1.2, () => {
        this.hint.show(HINT.notify, 6000);
        this.onWantNotify();
      });
    }
  }

  private poke(c: Contact) {
    const zone = this.senses.zoneAt(c.px, c.py);
    this.pokes = this.pokes.filter((t) => this.time - t < 4);
    this.pokes.push(this.time);
    // a boop on the nose, once, from a hand it trusts, awake and at its ease: the face screwed up a
    // moment, a lick of the nose and a shake of the head, and (as often as not) a mrrp; no harm done
    if (this.pokes.length <= 2 && this.s.trust > 0.35 && (this.mode === 'rest' || this.mode === 'alert' || this.mode === 'enjoy')
      && this.senses.noseAt?.(c.px, c.py) && this.anim.booped?.()) {
      this.irritation = clamp(this.irritation + 0.03);
      this.haptic.tap('light');
      if (chance(0.4)) this.say('trill', { delay: 1.15 });
      return;
    }
    const rough = 0.1 + 0.07 * (this.pokes.length - 1) + (zone === 'face' ? 0.12 : 0);
    this.irritation = clamp(this.irritation + rough * (this.s.trust < 0 ? 1.4 : 1));
    // (the twitch of it under the fingertip, felt)
    this.haptic.tap('light');
    this.anim.twitchEar(zone === 'ear' ? this.earSide(c) : 'both', 1.2);
    if (zone === 'face') this.anim.doBlink();
    if (zone === 'tail') this.anim.flickTail(1.5);
    this.s.trust = clamp(this.s.trust - 0.004 * this.pokes.length, -1, 1);
    if (this.mode === 'sleep' || this.mode === 'doze') this.toAwake('alert');
  }

  /** up of its own accord to come to you (the room long open and untouched, the radio on): from a
   *  doze, or a light sleep, it wakes for it; deep asleep, it does not (true if awake now) */
  rouse() {
    if (this.mode === 'rest' || this.mode === 'alert') return true;
    if ((this.mode === 'doze' || this.mode === 'sleep') && this.sleepDepth < 0.75) {
      this.toAwake('rest');
      return true;
    }
    return false;
  }

  glassTap(sx: number, sy: number) {
    if (this.inert) return;
    this.taps = this.taps.filter((t) => this.time - t < 5);
    this.taps.push(this.time);
    const hx = this.senses.headScreen().x;
    this.anim.swivelEars(clamp((sx - hx) / 300, -1, 1));
    this.anim.twitchEar('both', 0.7);
    if (this.mode === 'sleep' || this.mode === 'doze') {
      if (chance(1 - this.sleepDepth * 0.7)) this.toAwake('alert');
      return;
    }
    this.attention = { x: sx, y: sy, until: this.time + rand(1.5, 3) };
    this.arousal = clamp(this.arousal + 0.2);
    if ((this.mode === 'rest' || this.mode === 'alert') && this.taps.length < 3 && chance(0.55)) this.anim.puzzled?.();
    if (this.taps.length > 3) this.irritation = clamp(this.irritation + 0.07);
  }

  /** thunder rolling in through the glass (loud 0 .. 1): a near clap startles it, out of a light
   *  sleep too, the ears back and the fur up a moment; a far one only turns its ears */
  thunder(loud: number) {
    if (this.inert) return;
    this.anim.twitchEar('both', 0.4 + loud);
    if (this.mode === 'sleep' || this.mode === 'doze') {
      if (!chance(loud * (1 - this.sleepDepth * 0.6))) return;
      this.toAwake('alert');
    }
    // (never enough on its own to send it off sulking)
    // (a bold cat is less put out by it, a timid one more)
    this.fear = Math.max(this.fear, Math.min(0.7, this.fear + 0.5 * loud * (1 - 0.4 * (this.s.personality.bold ?? 0))));
    this.arousal = clamp(this.arousal + 0.3 * loud);
    if (loud > 0.45) this.anim.jolt(loud);
  }

  knock(sx: number, sy: number) {
    // knocking on the glass is calling the cat
    if (this.mode === 'away' && this.s.alive) {
      if (this.s.awayReason === 'sulk') this.anim.sulkHeard?.();
      if (this.s.awayReason !== 'sulk' || this.s.trust > 0.5) {
        this.s.awayUntil = Math.min(this.s.awayUntil, this.s.lastTick + rand(8, 25) * 1000);
        if (this.s.trust > 0.2 && chance(0.6)) this.say('meowSoft', { far: !this.anim.inRoom, delay: rand(0.8, 2) });
      }
      return;
    }
    this.glassTap(sx, sy);
    if (this.mode === 'rest' || this.mode === 'alert') {
      this.attention = { x: sx, y: sy, until: this.time + 3 };
      if (this.s.trust > 0.3 && chance(0.4)) this.say('chirp');
    }
  }

  /** a toy moved about before its eyes (the ball of wool under a finger, now at sx, sy): it wakes
   *  to it out of a light sleep, its eyes follow it, it stays up for it, and being played with is
   *  company */
  toy(sx: number, sy: number, dt: number) {
    if (this.inert) return;
    if (this.mode === 'sleep' || this.mode === 'doze') {
      if (chance(dt * 0.6 * (1 - this.sleepDepth * 0.8))) this.toAwake('alert');
      return;
    }
    this.lastToy = this.time;
    this.attention = { x: sx, y: sy, until: this.time + 0.5 };
    this.arousal = clamp(this.arousal + dt * 0.3);
    // (a good game tires a cat: the nap after it comes the sooner)
    this.wantSleepIn = Math.max(8, this.wantSleepIn - dt * 0.25);
    if (this.mode === 'rest') this.setMode('alert');
    const s = this.s;
    s.lonely = Math.max(0, s.lonely - dt * 0.006);
    s.trust = clamp(s.trust + dt * 0.0006 * (1 - s.trust), -1, 1);
  }

  hover(sx: number, sy: number) {
    if (this.mode === 'alert' || this.mode === 'rest') this.attention = { x: sx, y: sy, until: this.time + 0.6 };
  }

  /** a rattle of kibble (shake or scrub) */
  kibble(strength: number) {
    const s = this.s;
    if (!s.alive) return;
    const before = s.food;
    s.food = clamp(s.food + 0.22 * (0.6 + strength));
    this.audio.play('kibbleShake', { gain: 0.5 + strength * 0.4, pan: rand(-0.3, 0.3) });
    if (before < 0.98 && s.food >= 0.98) this.audio.play('kibblePour', { gain: 0.7, delay: 0.15 });
    this.haptic.tap('light');
    s.stats.feeds++;
    s.hints.food = (s.hints.food ?? 0) + 1;
    if (this.mode === 'away') return;
    // the best sound in the world
    const hungry = s.hunger > 0.3;
    this.anim.twitchEar('both', 1.2);
    this.anim.swivelEars(0.6);
    if (this.mode === 'sleep' || this.mode === 'doze') {
      if (hungry || chance(0.5)) this.toAwake('alert');
    }
    if (hungry) {
      this.arousal = clamp(this.arousal + 0.5);
      if (before < 0.05) s.trust = clamp(s.trust + 0.025 * s.personality.warmth, -1, 1);
      if (!this.chatterCooldown()) this.say(chance(0.5) ? 'trill' : 'meowSoft', { delay: 0.4 });
      // goes to eat shortly; the hungrier the sooner
      this.errandWait = 2.2 - 1.4 * this.keenToEat();
    }
  }

  /** how keen it is on its dinner just now (0 .. 1): hungry, and keyed up (the kibble rattled) */
  private keenToEat() {
    return clamp((this.s.hunger - 0.4) / 0.4) * clamp(this.arousal / 0.5);
  }

  pouring = false;
  pourStart() {
    if (!this.s.alive) return;
    this.pouring = true;
    this.anim.swivelEars(0.4);
    this.anim.twitchEar('both', 0.6);
    this.s.hints.water = (this.s.hints.water ?? 0) + 1;
    if (this.s.thirst > 0.35 && this.s.water < 0.1) this.s.trust = clamp(this.s.trust + 0.015, -1, 1);
  }
  pourEnd() {
    this.pouring = false;
    this.audio.pour(false);
    if (this.s.thirst > 0.35 && this.mode !== 'away' && this.s.alive) this.errandWait = Math.max(this.errandWait, 1.8);
  }

  scoop() {
    if (!this.s.alive) return;
    const before = this.s.litter;
    this.s.litter = clamp(this.s.litter - 0.4);
    this.audio.play('scoop', { gain: 0.6 });
    this.s.hints.litter = (this.s.hints.litter ?? 0) + 1;
    if (before > THRESH.litterDirty) this.s.trust = clamp(this.s.trust + 0.01, -1, 1);
    if (this.mode !== 'away') this.anim.twitchEar('both', 0.5);
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, now: number, contacts: Contact[]) {
    this.time = now;
    this.t += dt;
    this.modeT += dt;
    this.runLater(dt);
    const s = this.s;

    if (this.pouring) {
      s.water = clamp(s.water + dt * 0.45);
      this.audio.pour(true, s.water);
      if (s.water >= 1) this.pourEnd();
    }

    if (this.mode === 'dead' || this.mode === 'gone') {
      this.applyDead(dt);
      return;
    }
    if (this.mode === 'away') {
      this.updateAway(dt, contacts.length > 0);
      return;
    }
    if (this.mode === 'leaving' || this.mode === 'arriving') {
      // (a body that never got where it was going: it stays, and is itself again)
      if (this.modeT > 20) this.toAwake('rest', true);
      this.express(dt, []);
      return;
    }

    // ---- touch
    const touching = contacts.length > 0;
    for (const c of contacts) this.feel(c, dt);
    if (touching) {
      this.lastTouch = now;
      this.stim += dt * (1 + 0.4 * (contacts.length - 1));
      s.stats.petSeconds += dt;
      s.lastPetAt = Date.now();
      this.session.t += dt;
      this.session.endedAt = -1;
    } else {
      this.stim = Math.max(0, this.stim - dt * 0.6);
      if (this.session.t > 0 && this.session.endedAt < 0) this.session.endedAt = now;
      this.tidyUp(now);
    }

    // ---- emotions settle
    const calm = s.trust > 0.3 ? 1.3 : 1;
    this.irritation = Math.max(0, this.irritation - dt * (touching ? 0.01 : 0.045 * calm));
    this.pleasure = Math.max(0, this.pleasure - dt * (touching ? 0.04 : 0.09));
    this.fear = Math.max(0, this.fear - dt * 0.06 * calm);
    this.arousal = Math.max(0, this.arousal - dt * 0.05);
    this.settleFright(dt, touching);

    // ---- thresholds
    const hissAt = 0.68 - 0.18 * clamp(-s.trust) + 0.1 * clamp(s.trust);
    if ((this.irritation > hissAt || (touching && this.fear > 0.72)) && now - this.hissAt > 4) this.hiss(contacts);
    // (getting cross under a hand, short of a hiss: a low grumble, a word of warning; now and then,
    // not over and over)
    else if (touching && this.irritation > 0.34 && this.irritation < hissAt - 0.05 && now - this.grumbleAt > this.grumbleGap && now - this.hissAt > 4) {
      this.grumbleAt = now;
      this.grumbleGap = rand(6, 12);
      this.grumbled = true;
      this.say('grumble', { delay: rand(0, 0.3) });
    }
    if (this.irritation > 0.93 || this.fear > 0.93) this.leave('sulk');
    if (this.mode === 'angry' && now > this.angryUntil) this.setMode(this.irritation > 0.4 ? 'annoyed' : 'alert');

    // ---- what annoyed it, said once for each reason the first time it does
    for (const k in this.why) this.why[k] *= Math.exp(-dt / 20);
    if (this.irritation < 0.15) this.whySaid = false;
    else if (touching && this.irritation > 0.3 && !this.whySaid) this.sayWhy();

    // ---- a love bite: a good long while under a hand it likes, nearly enough of it, and it says
    // so, fondly: the mouth on the finger, gently, a moment, and a lick after (once a session; and
    // it settles it a little: a cat that has said so minds the next while less)
    if (touching && this.mode === 'enjoy' && !this.session.bit && s.trust > 0.5 && this.pleasure > 0.5 && this.irritation < 0.25) {
      const tol = (22 + 75 * clamp(s.trust)) * s.personality.tolerance;
      if (this.stim > tol * 0.82 && chance(dt * 0.6) && this.anim.loveBite?.()) {
        this.session.bit = true;
        this.stim = Math.max(0, this.stim - 8);
        if (chance(0.4)) this.later(1.3, () => this.say('trill'));
      }
    }

    // ---- mode from feelings while awake
    if (this.mode !== 'sleep' && this.mode !== 'doze' && this.mode !== 'angry') {
      if (touching && this.pleasure > 0.45 && this.irritation < 0.35) this.setMode('enjoy');
      else if (this.irritation > 0.32) this.setMode('annoyed');
      else if (this.mode === 'enjoy' && (!touching && now - this.lastTouch > 6)) this.setMode('rest');
      else if (this.mode === 'annoyed' && this.irritation < 0.18) this.setMode('rest');
    }

    // ---- sleep cycle and the body's errands
    this.updateRest(dt, touching);
    // (hiss() or leave() above may have changed the mode this frame)
    if ((this.mode as Mode) !== 'leaving') this.updateNeeds(dt, touching);

    this.express(dt, contacts);
  }

  /** pleasantness of one contact this frame, and its effect */
  private feel(c: Contact, dt: number) {
    const s = this.s;
    const zone = this.senses.zoneAt(c.px, c.py);
    if (zone === 'none') return 0;
    this.session.zones[zone] = (this.session.zones[zone] ?? 0) + dt;
    const speed = Math.hypot(c.vx, c.vy);
    let base = ZONE_LIKE[zone] + (s.personality.likes[zone] ?? 0);
    const trust = s.trust;
    if (base >= 0) base *= 0.3 + 0.7 * smoothstep(-0.6, 0.55, trust);
    else base *= 1.25 - 0.45 * clamp(trust);
    if (trust < -0.15) base -= 0.35 * clamp(-trust * 2);
    let p = base;
    // how it's done
    let rough = 0, against = 0;
    if (speed < 25) p += 0.02; // a resting hand
    else if (speed < 260) p += 0.06;
    else if (speed < 650) rough = 0.15 * (speed - 260) / 390;
    else rough = 0.15 + Math.min(0.7, (speed - 650) / 700);
    p -= rough;
    if (speed > 40 && !GRAIN_TOLERANT[zone]) {
      const [gx, gy] = this.senses.grainAt(c.px, c.py);
      const along = (c.vx * gx + c.vy * gy) / speed;
      if (along < -0.3) { against = 0.38 * -along; p -= against; this.session.against += dt; }
      else if (along > 0.3) p += 0.07;
    }
    if (c.press > 0.8) p -= 0.15;
    // too much of a good thing
    const tol = (22 + 75 * clamp(trust)) * s.personality.tolerance;
    const over = Math.max(0, this.stim - tol) / 18;
    p -= over;
    // (what it was that it did not like, for a word on it if it comes to annoy it)
    if (p < 0) {
      const W = this.why;
      if (base < 0) W[zone] = (W[zone] ?? 0) - base * dt;
      W.against = (W.against ?? 0) + against * dt;
      W.rough = (W.rough ?? 0) + rough * dt;
      W.over = (W.over ?? 0) + over * dt;
    }
    if (this.mode === 'angry') p = Math.min(p, -0.4);
    // (a hand in its trap is its game while it lasts)
    else if (zone === 'belly' && this.time < this.trapUntil) p = Math.max(p, -0.04);
    if (s.health < THRESH.sick) p *= 0.5;

    if (p > 0) {
      this.pleasure = clamp(this.pleasure + p * dt * 0.75);
      this.irritation = Math.max(0, this.irritation - p * dt * 0.12);
      this.fear = Math.max(0, this.fear - p * dt * 0.2);
      s.trust = clamp(s.trust + p * dt * 0.0022 * s.personality.warmth * (1 - s.trust), -1, 1);
      s.lonely = Math.max(0, s.lonely - dt * 0.012);
    } else {
      const k = 0.7 + (trust < 0 ? 0.5 : 0) + over * 0.5;
      this.irritation = clamp(this.irritation - p * dt * k);
      this.pleasure = Math.max(0, this.pleasure + p * dt * 0.6);
      s.trust = clamp(s.trust + p * dt * 0.005, -1, 1);
    }
    // physical replies to where it's touched
    if (zone === 'ear' && chance(dt * 2.5)) this.anim.twitchEar(this.earSide(c), 0.8);
    if (zone === 'tail' && chance(dt * 3)) this.anim.flickTail(1);
    if (over > 0.3 && chance(dt * 1.5)) this.anim.flickTail(1.2);
    return p;
  }

  /** a hand has annoyed it: the first time for this reason, a word on what it was (against the
   *  lie of its fur, a place it does not like touched, too fast, too long) */
  private sayWhy() {
    this.whySaid = true;
    const [why, much] = Object.entries(this.why).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const text = WHY[why];
    if (!text || much < 0.1 || this.s.hints['why-' + why]) return;
    this.s.hints['why-' + why] = 1;
    this.later(0.6, () => this.hint.show(text, 5500));
  }

  private hiss(contacts: Contact[]) {
    this.hissAt = this.time;
    this.angryUntil = this.time + rand(3, 5);
    this.setMode('angry');
    this.s.stats.hisses++;
    this.s.trust = clamp(this.s.trust - 0.025, -1, 1);
    this.fear = clamp(this.fear + 0.2);
    this.purr = 0;
    if (chance(0.5)) this.audio.play('growl', { gain: 0.6 });
    this.audio.play('hiss', { gain: 0.85, delay: 0.1 });
    this.anim.hiss?.();
    this.haptic.tap('medium');
    if (contacts.length && chance(0.55 + 0.3 * clamp(-this.s.trust))) {
      this.later(0.35, () => {
        this.anim.swat(-1, -0.3);
        this.haptic.tap('heavy');
      });
    }
  }

  /** go away. 'sulk' bolts; errands leave calmly */
  leave(reason: 'sulk' | 'eat' | 'drink' | 'litter' | 'wander') {
    if (this.mode === 'leaving' || this.mode === 'away') return;
    const s = this.s;
    this.setMode('leaving');
    this.purr = 0;
    this.audio.setPurr(0);
    this.haptic.purr(0);
    const go = () => {
      const now = s.lastTick;
      if (reason === 'sulk') {
        s.where = 'away';
        s.awayReason = 'sulk';
        this.sulkFrom = this.time;
        this.sulkPokes = [];
        // (a cat you have only just met, in the first days, sulks a few minutes, not the best part
        // of half an hour: you are still finding out what it will have)
        const newness = clamp(1 - (now - s.born) / (3 * 864e5));
        const mins = (2 + 18 * this.irritation * (1 - 0.6 * clamp(s.trust)) + rand(0, 3)) * (1 - 0.7 * newness);
        s.awayUntil = now + mins * 60_000;
        s.grudgeUntil = s.awayUntil;
        s.trust = clamp(s.trust - 0.04, -1, 1);
        this.irritation *= 0.5;
        if (!s.hints.sulk) {
          s.hints.sulk = 1;
          this.later(1.5, () => this.hint.show(HINT.sulk, 6500));
        }
      } else {
        runErrand(s, reason, now);
        this.errandSounds(reason);
      }
      this.setMode('away');
    };
    if (reason === 'sulk') {
      this.audio.play('scrabble', { gain: 0.8, pan: -0.5 });
      this.anim.bolt(-1, go);
    } else {
      // gets up and pads off: a slower exit, footsteps instead of claws (to its dinner, hungry and
      // the kibble just rattled: up at once, and off at a trot)
      const keen = reason === 'eat' ? this.keenToEat() : 0;
      this.anim.headLift = 1;
      this.anim.eyeTarget = 0.9;
      this.later(0.9 - 0.6 * keen, () => {
        this.audio.series('step', 4, 0.22 - 0.08 * keen, { gain: 0.5, pan: -0.4 });
        this.anim.bolt(-1, go, true, reason, keen);
      });
    }
  }

  private errandSounds(reason: string) {
    const far = this.anim.inRoom ? { far: false, pan: reason === 'litter' ? 0.45 : -0.3 } : { far: true, pan: rand(-0.8, 0.8) };
    if (reason === 'eat') {
      this.later(rand(2.5, 4), () => this.audio.series('crunch', Math.floor(rand(10, 18)), 0.62, { ...far, gain: 0.55 }));
    } else if (reason === 'drink') {
      this.later(rand(2, 3), () => this.audio.series('lap', Math.floor(rand(16, 26)), 0.24, { ...far, gain: 0.45 }));
    } else if (reason === 'litter') {
      this.later(rand(3, 5), () => {
        this.audio.series('scratch', 5, 0.3, { ...far, gain: 0.45 });
        this.later(rand(25, 40), () => this.audio.series('scratch', 7, 0.28, { ...far, gain: 0.45 }));
      });
    }
  }

  private updateAway(dt: number, touching: boolean) {
    const s = this.s;
    if (this.anim.inRoom) {
      // sulking, and a hand kept on it a while, gently, not taken off and put back: shrugged off at
      // first, and then the sulk melts under it (a cat that hardly knows you only gets up and
      // goes to the other corner)
      if (s.awayReason === 'sulk' && s.alive) {
        if (touching) {
          this.sulkHand += dt;
          if (this.sulkHand > 2.5 + 4 * (1 - clamp(s.trust))) {
            this.sulkHand = 0;
            if (s.trust > 0.1) { this.makeUp(); return; }
            this.anim.sulkTouched?.(true);
            s.awayUntil += 25_000;
          }
        } else this.sulkHand = Math.max(0, this.sulkHand - dt * 0.5);
      }
      // in the room all along: the errand done where you saw it, or the sulk worn off, and it is
      // about the room again
      const done = s.awayReason !== 'sulk' && this.anim.errandDone === true;
      if ((done || s.lastTick >= s.awayUntil) && !touching) this.backInRoom();
      return;
    }
    this.anim.setHidden(true);
    if (this.arrivalCue >= 0) {
      this.arrivalCue -= dt;
      if (this.arrivalCue < 0) this.arrive();
      return;
    }
    if (s.lastTick >= s.awayUntil && !touching) {
      // footsteps first, then it comes into view
      this.audio.series('step', 5, 0.28, { gain: 0.35, pan: -0.5 });
      this.arrivalCue = 1.6;
    }
  }

  /** when the sulk began (brain time), and the hands put on it since in its corner; how long a
   *  hand has been kept on it there, gently */
  private sulkFrom = -1e9;
  private sulkPokes: number[] = [];
  private sulkHand = 0;

  /** a hand on it while it is away in the room. At the bowl or in the box, it flicks an ear and
   *  gets on with it. Sulking in its corner, it shrugs the hand off (and a hand that will not
   *  leave it be has it up and off to the other corner, and sulking the longer); but a cat fond
   *  of you, the worst of it over, makes it up with you */
  private awayTouch() {
    const s = this.s;
    this.lastTouch = this.time;
    if (s.awayReason !== 'sulk') {
      this.anim.twitchEar('both', 0.6);
      this.anim.flickTail(0.5);
      return;
    }
    const since = this.time - this.sulkFrom;
    if (s.trust > 0.4 && since > 40 + 70 * (1 - s.trust) && chance(0.35 + 0.6 * clamp((s.trust - 0.4) / 0.4))) {
      this.makeUp();
      return;
    }
    this.sulkPokes = this.sulkPokes.filter((t) => this.time - t < 6);
    this.sulkPokes.push(this.time);
    const again = this.sulkPokes.length >= 2;
    this.anim.sulkTouched?.(again);
    this.audio.play('growl', { gain: 0.16 + (again ? 0.1 : 0), pan: -0.2 });
    this.haptic.tap(again ? 'medium' : 'light');
    // (pestered, it sulks the longer)
    s.awayUntil += (again ? 25 : 10) * 1000;
    s.grudgeUntil = Math.max(s.grudgeUntil, s.awayUntil);
    if (!s.hints.sulkTouch) {
      s.hints.sulkTouch = 1;
      this.later(1.2, () => this.hint.show(HINT.sulkTouch, 6000));
    }
  }

  /** made up: round to you in its corner, a slow blink and a trill, and itself again (not back to
   *  its bed at once: it is where it is, and a hand is welcome there now) */
  private makeUp() {
    const s = this.s;
    s.where = 'bed';
    s.awayReason = null;
    s.grudgeUntil = s.lastTick;
    this.irritation = Math.min(this.irritation, 0.1);
    this.toAwake('rest', true);
    this.anim.sulkOver?.();
    this.later(0.7, () => this.say('trill'));
    this.haptic.tap('light');
    if (!s.hints.madeUp) {
      s.hints.madeUp = 1;
      this.later(1.4, () => this.hint.show(HINT.madeUp, 5000));
    }
  }

  /** back from away, in the room all along: about it again from where it is (the avatar takes it
   *  home in its own time) */
  private backInRoom() {
    const s = this.s;
    const sulked = s.awayReason === 'sulk';
    s.where = 'bed';
    s.awayReason = null;
    this.arrivalCue = -1;
    // (sulked it out: over it)
    if (sulked) this.irritation *= 0.3;
    this.toAwake('rest', true);
    this.anim.arrive();
    if (s.trust > 0.35 && chance(sulked ? 0.4 : 0.7)) this.later(0.8, () => this.say('trill'));
    this.wantSleepIn = rand(90, 240);
  }

  private arrive() {
    const s = this.s;
    s.where = 'bed';
    s.awayReason = null;
    this.arrivalCue = -1;
    this.setMode('arriving');
    this.toAwake('rest', true);
    this.anim.arrive(() => {
      this.setMode('rest');
      this.audio.play('thump', { gain: 0.5 });
      if (s.trust > 0.35 && chance(0.7)) this.later(0.6, () => this.say('trill'));
      this.wantSleepIn = rand(90, 240);
    });
  }

  /** an errand once the body asks, when nobody is petting */
  private updateNeeds(dt: number, touching: boolean) {
    const s = this.s;
    if (this.errandWait > 0) {
      this.errandWait -= dt;
      if (this.errandWait <= 0 && !touching) {
        const e = chooseErrand(s, Date.now());
        if (e && e !== 'wander') {
          this.leave(e);
          return;
        }
      }
    }
    const idle = this.time - Math.max(this.lastTouch, this.lastToy);
    const e = s.bladder >= 1 ? 'litter' : null;
    if (e && !touching && idle > 8) {
      this.leave('litter');
      return;
    }
    // hungry or thirsty with food there: goes when left alone for a bit
    if (!touching && idle > 25 && (this.mode === 'rest' || this.mode === 'alert')) {
      const want = chooseErrand(s, Date.now());
      if (want === 'eat' || want === 'drink') {
        this.leave(want);
        return;
      }
    }
    // asking you for what only you can give
    const n = needs(s);
    if ((n.food || n.water || n.litter) && this.mode !== 'angry') {
      if (this.mode === 'sleep' || this.mode === 'doze') {
        if (this.modeT > 20 && chance(dt * 0.05)) this.toAwake('alert');
        return;
      }
      this.askIn -= dt;
      if (this.askIn <= 0) {
        const urgent = s.hunger > 0.85 || s.thirst > 0.85;
        this.askIn = urgent ? rand(10, 20) : rand(18, 40);
        // (at the bowl itself, as often as it can: over to it, a sniff, and sat by it asking you;
        // the meow is its, there)
        const what = n.food ? 'food' : 'water';
        const empty = () => (what === 'food' ? s.food : s.water) < 0.05;
        if ((n.food || n.water) && chance(0.7) && this.anim.beg?.(what, urgent, empty)) this.askIn += 8;
        else if (n.food || n.water) this.say(urgent ? 'meowPlead' : 'meow');
        else if (chance(0.5)) this.say('meowSoft');
        this.attention = null;
        this.showNeedHint(n);
      }
    }
  }

  private showNeedHint(n: ReturnType<typeof needs>) {
    const s = this.s;
    if (n.food && (s.hints.food ?? 0) < 2) {
      if (this.senses.motionShake) this.hint.show(HINT.foodShake + ' (또는 빈 곳을 좌우로 문지르기)', 6500);
      else this.hint.show(HINT.foodScrub, 6500);
      this.onWantMotion();
    } else if (n.water && (s.hints.water ?? 0) < 2) this.hint.show(HINT.water, 6500);
    else if (n.litter && (s.hints.litter ?? 0) < 2) this.hint.show(HINT.litter, 6500);
    else if (n.sick && !s.hints.sick) {
      s.hints.sick = 1;
      this.hint.show(HINT.sick, 6500);
    }
  }

  private updateRest(dt: number, touching: boolean) {
    const s = this.s;
    const idle = this.time - Math.max(this.lastTouch, this.lastToy);
    // (sleepier at night; about dawn and dusk, its liveliest hours, it stays up longer)
    const now = Date.now(), h = new Date(now).getHours() + new Date(now).getMinutes() / 60;
    const tired = (0.5 + 0.5 * nightness(now) + (s.health < THRESH.sick ? 0.4 : 0)) * (1 - 0.35 * crepuscular(h));
    if (touching) return;
    switch (this.mode) {
      case 'rest':
      case 'alert':
      case 'enjoy':
        if (idle > 4 && !needs(s).food && !needs(s).water) {
          this.wantSleepIn -= dt * tired;
          if (this.wantSleepIn <= 0) this.toSleep(0.45);
        }
        if (this.mode === 'alert' && this.modeT > rand(8, 14) && this.arousal < 0.2) this.setMode('rest');
        break;
      case 'doze':
        this.sleepDepth = Math.min(1, this.sleepDepth + dt * 0.012);
        if (this.sleepDepth > 0.65) this.setMode('sleep');
        this.peek(dt);
        this.napEnds(dt);
        break;
      case 'sleep':
        this.sleepDepth = Math.min(1, this.sleepDepth + dt * 0.01);
        this.peek(dt);
        this.napEnds(dt);
        break;
    }
  }

  /** a cat sleeps in naps, not all day at a stretch: in time it wakes of itself, yawns, gets up
   *  for a good stretch and sees what there is to do, and later sleeps again */
  private napEnds(dt: number) {
    if ((this.napLeft -= dt) > 0) return;
    this.toAwake('rest', true);
    this.anim.wakeStretch?.();
  }

  /** when it last grumbled under a hand, and how long till it may again (s); grumbled just now
   *  (for the word on it, the first time) */
  private grumbleAt = -1e9;
  private grumbleGap = 8;
  grumbled = false;

  /** a fright: the most afraid it came to, and how long since it was at its worst (s) */
  private fright = { peak: 0, since: 0, will: false };

  /** a fright got over, a cat puts itself to rights: a few licks at its shoulder, or down its
   *  chest, as if nothing had happened (its way of settling itself after a start); not every time,
   *  and when it is free to (busy, it does it when it is done, if that is soon) */
  private settleFright(dt: number, touching: boolean) {
    const F = this.fright;
    if (this.fear >= F.peak) {
      // (worse than it was: whether it will put itself to rights after, decided as it comes)
      if (F.peak < 0.3 && this.fear >= 0.3) F.will = chance(0.65);
      F.peak = this.fear;
      F.since = 0;
    } else F.since += dt;
    // (long ago now: that one is forgotten)
    if (F.since > 45) { F.peak = this.fear; F.since = 0; return; }
    if (F.peak < 0.3 || this.fear > 0.12 || F.since < 3 || touching || (this.mode !== 'rest' && this.mode !== 'alert')) return;
    if (!F.will || this.anim.tidy?.(chance(0.65) ? 'flank' : 'chest')) F.peak = this.fear;
  }

  /** the hands gone a moment after a good while on it: as often as not the cat puts its coat to
   *  rights where it was touched (more often if it was rubbed the wrong way): a paw over the face
   *  for its head, a lick down the chest, or at the flank */
  private tidyUp(now: number) {
    const S = this.session;
    if (S.endedAt < 0 || now - S.endedAt < 1.6) return;
    const { t, against, zones, bit } = S;
    this.session = { t: 0, against: 0, zones: {}, endedAt: -1, bit: false };
    if (t < 2.5 || this.mode === 'sleep' || this.mode === 'doze' || this.mode === 'angry') return;
    // (a good stroke over before it had had enough, from a hand it is fond of: it asks for more,
    // the head pushed out after the hand, a look at you and a word; not every time)
    const s = this.s, tol = (22 + 75 * clamp(s.trust)) * s.personality.tolerance;
    if (this.mode === 'enjoy' && t >= 3 && !bit && against < 0.6 && s.trust > 0.3 && this.pleasure > 0.4 && this.irritation < 0.15
      && this.stim < tol * 0.6 && !this.drowsy && now - this.askedAt > 25 && chance(0.4 + 0.4 * clamp(s.trust)) && this.anim.askMore?.()) {
      this.askedAt = now;
      this.askingUntil = now + 3.4;
      this.say(chance(0.65) ? 'trill' : 'meowSoft', { delay: 0.6 });
      return;
    }
    if (!chance(0.35 + 0.45 * clamp(against / 1.5) + 0.15 * clamp(t / 15))) return;
    let most: Zone = 'back', mt = 0;
    for (const [z, zt] of Object.entries(zones) as [Zone, number][]) if (zt > mt) { mt = zt; most = z; }
    const where = most === 'belly' || most === 'paw' ? 'chest'
      : most === 'face' || most === 'chin' || most === 'cheek' || most === 'head' || most === 'ear' ? 'face' : 'flank';
    this.anim.tidy?.(where);
  }

  /** now and then a sleeping cat opens its eyes, checks on you, and goes back to sleep (and
   *  when you have just come back, it surely does) */
  private peek(dt: number) {
    this.peekIn -= dt;
    const back = this.greetPeek > 0 && (this.greetPeek -= dt) <= 0;
    if (this.peekIn > 0 && !back) return;
    this.peekIn = rand(50, 200);
    const s = this.s;
    const a = this.anim;
    if (back || chance(0.5)) {
      this.peekEye = s.trust > 0.3 ? 0.35 : 0.55;
      this.later(rand(1.6, 3.2), () => {
        if (s.trust > 0.4 && (this.mode === 'sleep' || this.mode === 'doze')) a.doBlink(true);
        this.later(1.6, () => { this.peekEye = 0; });
      });
    } else {
      a.sigh();
      a.twitchEar(chance(0.5) ? 'L' : 'R', 0.6);
    }
  }

  private toSleep(depth: number) {
    this.sleepDepth = depth;
    this.setMode(depth > 0.65 ? 'sleep' : 'doze');
    // (a quarter of an hour to three quarters by day; longer in the night)
    this.napLeft = rand(14, 45) * 60 * (1 + 0.8 * nightness(Date.now()));
    this.wantSleepIn = rand(30, 90);
    this.peekIn = rand(30, 140);
  }

  private toAwake(m: 'rest' | 'alert', quiet = false) {
    this.sleepDepth = 0;
    this.drowsy = false;
    this.setMode(m);
    this.wantSleepIn = rand(120, 420);
    if (!quiet) this.anim.twitchEar('both', 0.5);
  }

  private setMode(m: Mode) {
    if (this.mode === m) return;
    this.mode = m;
    this.modeT = 0;
  }

  get inert() {
    return this.mode === 'dead' || this.mode === 'gone' || this.mode === 'away' || this.mode === 'leaving' || this.mode === 'arriving';
  }

  // ------------------------------------------------------------------ expression
  private express(dt: number, contacts: Contact[]) {
    const s = this.s;
    const a = this.anim;
    const m = this.mode;
    const touching = contacts.length > 0;
    const sick = clamp((THRESH.sick - s.health) / THRESH.sick * 1.6);
    const night = nightness(Date.now());

    // purr: builds slowly, lingers after the hand lifts (asleep under a hand it trusts, a softer
    // purr in its sleep; the hand long gone, that is over)
    if (this.drowsy && !touching && this.time - this.lastTouch > 25) this.drowsy = false;
    const sleepPurr = asleepNow(m) && this.drowsy ? 0.75 * smoothstep(0.12, 0.6, this.pleasure) : 0;
    const wantPurr = Math.max(sleepPurr, (m === 'enjoy' || (m === 'rest' && this.pleasure > 0.3)) ? smoothstep(0.28, 0.75, this.pleasure) : 0) * (1 - sick * 0.5);
    this.purr += (wantPurr - this.purr) * Math.min(1, dt * (wantPurr > this.purr ? 0.5 : 0.35));
    if (this.purr > 0.3) this.hadPurred = true;
    a.purr = this.purr;
    this.audio.setPurr(this.purr);
    this.haptic.purr(touching ? this.purr : 0);

    // sleep
    const asleep = m === 'sleep' || m === 'doze';
    a.sleep = asleep ? Math.max(0.5, this.sleepDepth) : 0;

    // eyes
    let eye = 0.75, squint = 0, pupil = 0.22 + night * 0.4;
    switch (m) {
      case 'sleep': case 'doze': eye = 0; break;
      case 'rest': eye = 0.62 - sick * 0.25; squint = 0.1 + this.pleasure * 0.3; break;
      case 'alert': eye = 0.95; pupil += 0.25 + this.arousal * 0.3; break;
      case 'enjoy': eye = this.pleasure > 0.85 ? 0.12 : 0.42; squint = 0.45; pupil -= 0.05; break;
      case 'annoyed': eye = 0.82; squint = 0.18; pupil += 0.15; break;
      case 'angry': eye = 1; pupil = 0.9; break;
      case 'arriving': case 'leaving': eye = 0.85; break;
    }
    pupil += this.fear * 0.6 + this.arousal * 0.2;
    const asking = this.time < this.askingUntil && !touching && m === 'enjoy';
    if (asking) { eye = 0.88; squint = 0.04; pupil += 0.12; }
    if (asleep) eye = this.peekEye;
    a.eyeTarget = eye;
    a.squintTarget = squint;
    a.pupilTarget = clamp(pupil);

    // gaze: you, mostly; the finger when it's interesting; now and then elsewhere
    let gaze: { x: number; y: number } | null = null;
    if (this.attention && this.time < this.attention.until) gaze = this.attention;
    else this.attention = null;
    if (!gaze && touching && (m === 'alert' || m === 'annoyed' || m === 'angry')) gaze = { x: contacts[0].sx, y: contacts[0].sy };
    // (now and then a glance aside; not under a hand: then it is you, or the eyes half shut)
    if (!gaze && m === 'rest' && !touching) {
      if (this.glance && this.time < this.glance.until) gaze = this.glance;
      else if (chance(dt * 0.08)) {
        const W = this.senses.viewW();
        this.glance = { x: rand(0, W), y: rand(0, W * 1.6), until: this.time + rand(1, 2.5) };
      }
    }
    a.gazeTarget = gaze;
    a.gazeAside = !!gaze && gaze === this.glance;

    // ears
    if (m === 'angry') a.earMood = 'flat';
    else if (this.fear > 0.5) a.earMood = 'back';
    else if (m === 'annoyed') a.earMood = this.irritation > 0.5 ? 'back' : 'side';
    else if (asleep) a.earMood = 'sleep';
    else if (m === 'alert') a.earMood = 'forward';
    else if (asking) a.earMood = 'forward';
    else if (m === 'enjoy') a.earMood = this.pleasure > 0.7 ? 'side' : 'relaxed';
    else a.earMood = 'relaxed';

    // tail tells the truth first
    const irr = this.irritation + Math.max(0, this.stim - 40) * 0.003;
    a.tailMood = irr > 0.62 ? 'lash' : irr > 0.42 ? 'twitch' : irr > 0.24 ? 'tip' : 'still';
    a.rippleTarget = touching && this.irritation > 0.3 ? clamp((this.irritation - 0.3) * 2.2) : 0;
    a.puffTarget = m === 'angry' ? 0.8 + this.fear * 0.2 : this.fear > 0.55 ? (this.fear - 0.55) * 2 : 0;

    // head
    let lift = 0;
    switch (m) {
      case 'alert': lift = 0.85; break;
      case 'rest': lift = 0.3; break;
      case 'annoyed': lift = 0.45; break;
      case 'angry': lift = 0.5; break;
      case 'enjoy': lift = asking ? 0.55 : 0.2; break;
      case 'leaving': lift = 1; break;
      case 'arriving': lift = 0.4; break;
    }
    if (needs(s).food || needs(s).water) lift = Math.max(lift, m === 'sleep' ? 0 : 0.7);
    a.headLift = lift * (1 - sick * 0.6);
    a.headRecoil = m === 'angry' ? 1 : this.fear > 0.6 ? 0.5 : 0;
    // leaning into a hand that strokes the head or cheek
    let lx = 0, ly = 0;
    if (touching && m === 'enjoy') {
      for (const c of contacts) {
        const z = this.senses.zoneAt(c.px, c.py);
        if (z === 'head' || z === 'cheek' || z === 'chin' || z === 'neck') {
          const h = this.senses.headScreen();
          const dx = c.sx - h.x, dy = c.sy - h.y;
          const l = Math.hypot(dx, dy) || 1;
          lx += (dx / l) * 3.5;
          ly += (dy / l) * 3.5;
        }
      }
    }
    a.headLean = { x: lx, y: ly };
    a.kneading = m === 'enjoy' && this.purr > 0.5 && s.trust > 0.3 && sick < 0.3;

    // breathing
    let rate = 0.38, depth = 0.7;
    switch (m) {
      case 'sleep': rate = 0.3; depth = 0.85; break;
      case 'doze': rate = 0.33; depth = 0.8; break;
      case 'enjoy': rate = 0.34; depth = 0.95; break;
      case 'annoyed': rate = 0.48; depth = 0.6; break;
      case 'angry': rate = 0.75; depth = 0.55; break;
      case 'alert': rate = 0.42; depth = 0.65; break;
    }
    a.breathRate = rate * (1 + sick * 0.3);
    a.breathDepth = depth * (1 - sick * 0.55);
    a.sick = sick;
    a.alive = true;
    a.desatTarget = sick * 0.32;
  }

  private applyDead(dt: number) {
    const a = this.anim;
    const s = this.s;
    a.alive = false;
    a.purr = 0;
    this.audio.setPurr(0);
    this.haptic.purr(0);
    a.eyeTarget = 0;
    a.sleep = 1;
    a.earMood = 'sleep';
    a.tailMood = 'still';
    a.headLift = 0;
    a.headRecoil = 0;
    a.kneading = false;
    a.rippleTarget = 0;
    a.puffTarget = 0;
    const since = s.diedAt ? (Date.now() - s.diedAt) / 3600_000 : 0;
    a.desatTarget = 0.45 + Math.min(0.25, since / 48);
    a.sick = 1;
    void dt;
  }

  /** long press on a dead cat: say goodbye; on an empty window: a new cat may come */
  longHold(onCat: boolean): 'goodbye' | 'adopt' | null {
    if (this.mode === 'dead' && onCat) {
      this.s.buried = true;
      this.setMode('gone');
      this.anim.fadeAway(() => this.later(2, () => this.hint.show(HINT.gone, 7000)));
      return 'goodbye';
    }
    if (this.mode === 'gone') return 'adopt';
    return null;
  }

  // ------------------------------------------------------------------ voice
  private lastSay = -1e9;
  private chatterCooldown() {
    return this.time - this.lastSay < 4;
  }
  say(what: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp' | 'grumble', o: { far?: boolean; delay?: number } = {}) {
    const v = this.s.personality.voice;
    if (!o.far && chance(0.15 * (1.2 - v))) return; // quieter cats skip some
    this.lastSay = this.time;
    const sick = this.s.health < THRESH.sick;
    const name = sick && what !== 'trill' && what !== 'grumble' ? 'meowSoft' : what;
    const dur = this.audio.play(name, { gain: (o.far ? 0.5 : 0.75) * (sick ? 0.6 : 1), far: o.far, delay: o.delay, pan: o.far ? rand(-0.7, 0.7) : -0.25 });
    // (and its mouth says it, sound or no sound; from out of the room, nothing to see)
    if (!o.far) this.anim.vocalize?.(name, dur || VOICE_LEN[name], o.delay ?? 0);
  }

  // ------------------------------------------------------------------ timers in brain time
  private queue: { t: number; fn: () => void }[] = [];
  private clock = 0;
  later(sec: number, fn: () => void) {
    this.queue.push({ t: this.clock + sec, fn });
  }
  private runLater(dt: number) {
    this.clock += dt;
    if (!this.queue.length) return;
    const due = this.queue.filter((q) => q.t <= this.clock);
    this.queue = this.queue.filter((q) => q.t > this.clock);
    for (const q of due) q.fn();
  }
}
