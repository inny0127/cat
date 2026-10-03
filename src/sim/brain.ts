import type { Avatar } from './avatar';
import type { CatAudio } from '../audio/audio';
import type { Haptic } from '../platform/haptics';
import type { Hint } from '../ui/hint';
import type { Contact } from '../input/pointer';
import type { CatState } from './state';
import { GRAIN_TOLERANT, ZONE_LIKE, type Zone } from './zones';
import { THRESH, chooseErrand, needs, nightness, runErrand } from './life';
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
}

const HINT = {
  pet: '손가락으로 살며시 쓰다듬어 보세요',
  foodShake: '휴대폰을 흔들면 사료 봉지 소리가 나요',
  foodScrub: '빈 곳을 좌우로 빠르게 문지르면 사료를 부어 줄 수 있어요',
  water: '빈 곳을 길게 누르고 있으면 물을 따라요',
  litter: '빈 곳을 아래로 쓸어내리면 화장실 모래를 치워요',
  sulk: '고양이가 기분이 상해서 가 버렸어요. 시간이 지나면 돌아올 거예요',
  away: '고양이는 잠시 자리를 비웠어요',
  sick: '고양이가 아파요. 밥과 물을 챙겨 주세요',
  dead: '고양이가 더 이상 숨을 쉬지 않아요. 오래 눌러 작별 인사를 할 수 있어요',
  gone: '창가가 비었어요. 빈 곳을 오래 누르면 새 고양이가 찾아올지도 몰라요',
  notify: '고양이가 당신을 부를 수 있게 알림을 허용해 주세요',
};

/** how long each voice lasts (s), for a mouth to move with when the sound itself is not playing */
const VOICE_LEN: Record<string, number> = { trill: 0.29, meow: 0.65, meowSoft: 0.44, meowPlead: 0.92, chirp: 0.11 };

/**
 * The cat's mind while you're looking: moods that rise and fade, a body that wants food and
 * sleep, and a relationship with you that every touch nudges.
 */
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
  private wantSleepIn = rand(25, 70);
  /** how long yet this sleep lasts before it wakes of itself (s) */
  private napLeft = rand(600, 1500);
  private peekIn = rand(40, 160);
  private lastTouch = -1e9;
  private lastToy = -1e9;
  private touchCount = 0;
  private pokes: number[] = [];
  private taps: number[] = [];
  private hissAt = -1e9;
  private angryUntil = 0;
  private askIn = rand(3, 8);
  private peekEye = 0;
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

  /** decide how we find the cat when the window is opened */
  wake(now: number, firstEver: boolean) {
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
      this.setMode('away');
      this.anim.setHidden(true);
      return;
    }
    this.anim.setHidden(false);
    const n = needs(s);
    const nightly = nightness(now);
    if (firstEver) {
      this.toSleep(1);
      return;
    }
    if (n.food || n.water || (s.trust > 0.35 && s.lonely > 0.6 && chance(0.6))) {
      this.toAwake('alert');
      if (s.trust > 0.3) this.later(0.8, () => this.say('trill'));
      return;
    }
    if (chance(0.72 + nightly * 0.2)) this.toSleep(rand(0.6, 1));
    else this.toAwake('rest');
  }

  // ------------------------------------------------------------------ input events
  touchStart(c: Contact) {
    if (this.inert) return;
    const zone = this.senses.zoneAt(c.px, c.py);
    this.lastTouch = this.time;
    this.touchCount++;
    if (this.mode === 'sleep' || this.mode === 'doze') {
      const deep = this.sleepDepth;
      // a hand out of nowhere: startle, harder when deeply asleep or not trusting
      const startle = deep * (0.35 + 0.45 * clamp(0.5 - this.s.trust));
      this.fear = clamp(this.fear + startle * (this.s.trust < 0.2 ? 1.2 : 0.6));
      this.irritation = clamp(this.irritation + startle * 0.15);
      if (startle > 0.25) this.anim.jolt(startle * 1.4);
      else this.anim.twitchEar('both', 0.8);
      this.toAwake(this.s.trust > 0.4 && zone !== 'tail' && zone !== 'paw' ? 'rest' : 'alert');
      this.peekEye = 0;
    }
    if (this.mode === 'angry' && this.time - this.hissAt < 2.5) {
      // you touched it right after it hissed
      this.leave('sulk');
    }
  }

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
    const rough = 0.1 + 0.07 * (this.pokes.length - 1) + (zone === 'face' ? 0.12 : 0);
    this.irritation = clamp(this.irritation + rough * (this.s.trust < 0 ? 1.4 : 1));
    this.anim.twitchEar(zone === 'ear' ? this.earSide(c) : 'both', 1.2);
    if (zone === 'face') this.anim.doBlink();
    if (zone === 'tail') this.anim.flickTail(1.5);
    this.s.trust = clamp(this.s.trust - 0.004 * this.pokes.length, -1, 1);
    if (this.mode === 'sleep' || this.mode === 'doze') this.toAwake('alert');
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
    this.fear = Math.max(this.fear, Math.min(0.7, this.fear + 0.5 * loud));
    this.arousal = clamp(this.arousal + 0.3 * loud);
    if (loud > 0.45) this.anim.jolt(loud);
  }

  knock(sx: number, sy: number) {
    // knocking on the glass is calling the cat
    if (this.mode === 'away' && this.s.alive) {
      if (this.s.awayReason !== 'sulk' || this.s.trust > 0.5) {
        this.s.awayUntil = Math.min(this.s.awayUntil, this.s.lastTick + rand(8, 25) * 1000);
        if (this.s.trust > 0.2 && chance(0.6)) this.say('meowSoft', { far: true, delay: rand(0.8, 2) });
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
      this.errandWait = 2.2; // goes to eat shortly
    }
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
    } else {
      this.stim = Math.max(0, this.stim - dt * 0.6);
    }

    // ---- emotions settle
    const calm = s.trust > 0.3 ? 1.3 : 1;
    this.irritation = Math.max(0, this.irritation - dt * (touching ? 0.01 : 0.045 * calm));
    this.pleasure = Math.max(0, this.pleasure - dt * (touching ? 0.04 : 0.09));
    this.fear = Math.max(0, this.fear - dt * 0.06 * calm);
    this.arousal = Math.max(0, this.arousal - dt * 0.05);

    // ---- thresholds
    const hissAt = 0.68 - 0.18 * clamp(-s.trust) + 0.1 * clamp(s.trust);
    if ((this.irritation > hissAt || (touching && this.fear > 0.72)) && now - this.hissAt > 4) this.hiss(contacts);
    if (this.irritation > 0.93 || this.fear > 0.93) this.leave('sulk');
    if (this.mode === 'angry' && now > this.angryUntil) this.setMode(this.irritation > 0.4 ? 'annoyed' : 'alert');

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
    const speed = Math.hypot(c.vx, c.vy);
    let base = ZONE_LIKE[zone] + (s.personality.likes[zone] ?? 0);
    const trust = s.trust;
    if (base >= 0) base *= 0.3 + 0.7 * smoothstep(-0.6, 0.55, trust);
    else base *= 1.25 - 0.45 * clamp(trust);
    if (trust < -0.15) base -= 0.35 * clamp(-trust * 2);
    let p = base;
    // how it's done
    if (speed < 25) p += 0.02; // a resting hand
    else if (speed < 260) p += 0.06;
    else if (speed < 650) p -= 0.15 * (speed - 260) / 390;
    else p -= 0.15 + Math.min(0.7, (speed - 650) / 700);
    if (speed > 40 && !GRAIN_TOLERANT[zone]) {
      const [gx, gy] = this.senses.grainAt(c.px, c.py);
      const along = (c.vx * gx + c.vy * gy) / speed;
      if (along < -0.3) p -= 0.38 * -along;
      else if (along > 0.3) p += 0.07;
    }
    if (c.press > 0.8) p -= 0.15;
    // too much of a good thing
    const tol = (22 + 75 * clamp(trust)) * s.personality.tolerance;
    const over = Math.max(0, this.stim - tol) / 18;
    p -= over;
    if (this.mode === 'angry') p = Math.min(p, -0.4);
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
        const mins = 2 + 18 * this.irritation * (1 - 0.6 * clamp(s.trust)) + rand(0, 3);
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
      // gets up and pads off: a slower exit, footsteps instead of claws
      this.anim.headLift = 1;
      this.anim.eyeTarget = 0.9;
      this.later(0.9, () => {
        this.audio.series('step', 4, 0.22, { gain: 0.5, pan: -0.4 });
        this.anim.bolt(-1, go, true, reason);
      });
    }
  }

  private errandSounds(reason: string) {
    const far = { far: true, pan: rand(-0.8, 0.8) };
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
      this.wantSleepIn = rand(20, 60);
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
        if (n.food || n.water) this.say(urgent ? 'meowPlead' : 'meow');
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
    const tired = 0.5 + 0.5 * nightness(Date.now()) + (s.health < THRESH.sick ? 0.4 : 0);
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

  /** now and then a sleeping cat opens its eyes, checks on you, and goes back to sleep */
  private peek(dt: number) {
    this.peekIn -= dt;
    if (this.peekIn > 0) return;
    this.peekIn = rand(50, 200);
    const s = this.s;
    const a = this.anim;
    if (chance(0.5)) {
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
    this.setMode(m);
    this.wantSleepIn = rand(35, 110);
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

    // purr: builds slowly, lingers after the hand lifts
    const wantPurr = (m === 'enjoy' || (m === 'rest' && this.pleasure > 0.3)) ? smoothstep(0.28, 0.75, this.pleasure) * (1 - sick * 0.5) : 0;
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
    if (asleep) eye = this.peekEye;
    a.eyeTarget = eye;
    a.squintTarget = squint;
    a.pupilTarget = clamp(pupil);

    // gaze: you, mostly; the finger when it's interesting; now and then elsewhere
    let gaze: { x: number; y: number } | null = null;
    if (this.attention && this.time < this.attention.until) gaze = this.attention;
    else this.attention = null;
    if (!gaze && touching && (m === 'alert' || m === 'annoyed' || m === 'angry')) gaze = { x: contacts[0].sx, y: contacts[0].sy };
    if (!gaze && m === 'rest') {
      if (this.glance && this.time < this.glance.until) gaze = this.glance;
      else if (chance(dt * 0.08)) {
        const W = this.senses.viewW();
        this.glance = { x: rand(0, W), y: rand(0, W * 1.6), until: this.time + rand(1, 2.5) };
      }
    }
    a.gazeTarget = gaze;

    // ears
    if (m === 'angry') a.earMood = 'flat';
    else if (this.fear > 0.5) a.earMood = 'back';
    else if (m === 'annoyed') a.earMood = this.irritation > 0.5 ? 'back' : 'side';
    else if (asleep) a.earMood = 'sleep';
    else if (m === 'alert') a.earMood = 'forward';
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
      case 'enjoy': lift = 0.2; break;
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
  say(what: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp', o: { far?: boolean; delay?: number } = {}) {
    const v = this.s.personality.voice;
    if (!o.far && chance(0.15 * (1.2 - v))) return; // quieter cats skip some
    this.lastSay = this.time;
    const sick = this.s.health < THRESH.sick;
    const name = sick && what !== 'trill' ? 'meowSoft' : what;
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
