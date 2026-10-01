import { restPose, type Pose } from '../render/pose';
import type { EyeDraw } from '../render/renderer';
import { Smooth, Wobble, clamp, fbm1, lerp, rand, smoothstep, chance } from '../util/math';

export type EarMood = 'sleep' | 'relaxed' | 'forward' | 'side' | 'back' | 'flat';
export type TailMood = 'still' | 'tip' | 'twitch' | 'lash';

const DEG = Math.PI / 180;

/**
 * Turns high-level intentions ("ears back", "look at the finger", "slow blink") into a Pose every
 * frame, adding the small involuntary motion that makes a body look alive: breathing with sighs,
 * ear flicks, settling, saccades.
 */
export class Animator {
  readonly pose: Pose = restPose();
  readonly eyeA: EyeDraw = { open: 0, squint: 0, pupil: 0.35, gazeX: 0, gazeY: 0, alpha: 1 };
  readonly eyeB: EyeDraw = { open: 0, squint: 0, pupil: 0.35, gazeX: 0, gazeY: 0, alpha: 1 };

  // ---- intentions (set by the brain)
  sleep = 1;            // 0 awake .. 1 deep sleep
  eyeTarget = 0;        // 0..1
  squintTarget = 0;
  pupilTarget = 0.3;
  gazeTarget: { x: number; y: number } | null = null; // screen px, null = look at the viewer
  earMood: EarMood = 'sleep';
  tailMood: TailMood = 'still';
  headLift = 0;         // 0 tucked (painting) .. 1 raised to look around
  headLean: { x: number; y: number } = { x: 0, y: 0 }; // push into a hand (P px)
  headRecoil = 0;       // pull away (hiss)
  kneading = false;
  rippleTarget = 0;
  puffTarget = 0;
  breathRate = 0.33;    // Hz
  breathDepth = 0.85;
  alive = true;
  sick = 0;             // 0..1
  desatTarget = 0;
  purr = 0;             // 0..1 (drives a faint vibration of the breath curve)

  // ---- internal state
  private t = 0;
  private breathPhase = 0;
  private sighT = -1;
  private nextSigh = rand(40, 120);
  private sEye = new Smooth(0, 0.5);
  private sSquint = new Smooth(0, 0.35);
  private sPupil = new Smooth(0.3, 0.6);
  private sGx = new Smooth(0, 0.08);
  private sGy = new Smooth(0, 0.08);
  private sHeadA = new Smooth(0, 0.6);
  private sHeadX = new Smooth(0, 0.5);
  private sHeadY = new Smooth(0, 0.5);
  private sEarL = new Smooth(0, 0.18);
  private sEarR = new Smooth(0, 0.18);
  private sFoldL = new Smooth(0, 0.2);
  private sFoldR = new Smooth(0, 0.2);
  private wEarL = new Wobble(420, 11);
  private wEarR = new Wobble(420, 11);
  private wTail = new Wobble(140, 6);
  private sTail = new Smooth(0, 0.6);
  private wHead = new Wobble(90, 9);
  private sRipple = new Smooth(0, 0.4);
  private sPuff = new Smooth(0, 0.25);
  private sDesat = new Smooth(0, 3);
  private sDim = new Smooth(0, 3);
  private blink: { t: number; dur: number; depth: number; slow: boolean; hold: number } | null = null;
  private nextEarTwitch = rand(4, 14);
  private nextTailTick = rand(3, 8);
  private nextSaccade = 1;
  private saccade = { x: 0, y: 0 };
  private nextBlink = rand(3, 7);
  private swatT = -1;
  private swatDir = { x: -1, y: -0.4 };
  private kneadPhase = 0;
  private kneadAmt = new Smooth(0, 0.4);
  private earSwivel = { l: 0, r: 0 };
  // whole-cat moves
  private exit: { t: number; dir: number; dur: number; calm: boolean; onDone?: () => void } | null = null;
  private fade: { t: number; dur: number; onDone?: () => void } | null = null;
  private enter: { t: number; dur: number; onDone?: () => void } | null = null;
  hidden = false;

  // ---------------------------------------------------------------- actions
  doBlink(slow = false) {
    if (this.blink) return;
    this.blink = slow
      ? { t: 0, dur: 1.55, depth: 0.95, slow: true, hold: 0.35 }
      : { t: 0, dur: 0.24, depth: 1, slow: false, hold: 0.03 };
  }
  twitchEar(which: 'L' | 'R' | 'both', strength = 1) {
    const k = (w: Wobble) => w.kick(rand(5, 8) * strength * (chance(0.5) ? 1 : 0.8));
    if (which !== 'R') k(this.wEarL);
    if (which !== 'L') k(this.wEarR);
  }
  /** turn the ears a bit towards a point on screen (sounds, taps) */
  swivelEars(amount: number) {
    this.earSwivel.l = clamp(amount, -1, 1);
    this.earSwivel.r = clamp(amount, -1, 1);
  }
  flickTail(strength = 1) {
    this.wTail.kick(-rand(1.6, 2.4) * strength);
  }
  jolt(strength = 1) {
    // startle: whole head jerks up a little
    this.wHead.kick(rand(1.2, 1.8) * strength);
    this.twitchEar('both', 1.2 * strength);
  }
  swat(dirX = -1, dirY = -0.35) {
    const l = Math.hypot(dirX, dirY) || 1;
    this.swatDir = { x: dirX / l, y: dirY / l };
    this.swatT = 0;
  }
  sigh() {
    if (this.sighT < 0) this.sighT = 0;
  }
  /** leave the window. dir: -1 left, 1 right. calm: gets up and goes rather than bolting */
  bolt(dir: number, onDone?: () => void, calm = false) {
    if (this.exit || this.hidden) return;
    this.exit = { t: 0, dir, dur: calm ? 1.25 : 0.62, calm, onDone };
  }
  /** a body that slowly isn't there any more */
  fadeAway(onDone?: () => void) {
    this.fade = { t: 0, dur: 4.5, onDone };
  }
  /** come back into view (a slow focus-in, as if the window had misted over) */
  arrive(onDone?: () => void) {
    this.hidden = false;
    this.exit = null;
    this.enter = { t: 0, dur: 2.2, onDone };
  }
  setHidden(h: boolean) {
    this.hidden = h;
    if (h) this.exit = null;
    this.enter = null;
  }
  get busy() {
    return !!this.exit || !!this.enter;
  }

  // ---------------------------------------------------------------- frame
  update(dt: number) {
    this.t += dt;
    const p = this.pose;
    const awake = 1 - this.sleep;

    // breathing: quicker inhale, longer exhale with a pause; occasional sigh
    let rate = this.breathRate, depth = this.breathDepth;
    if (this.sighT >= 0) {
      this.sighT += dt;
      const s = Math.sin(clamp(this.sighT / 3.2) * Math.PI);
      rate *= 1 - 0.45 * s;
      depth *= 1 + 1.3 * s;
      if (this.sighT > 3.2) this.sighT = -1;
    } else if (this.alive && (this.nextSigh -= dt) < 0) {
      this.nextSigh = rand(50, 160) * (0.6 + this.sleep * 0.6);
      this.sigh();
    }
    if (!this.alive) depth = 0;
    this.breathPhase = (this.breathPhase + dt * rate) % 1;
    const ph = this.breathPhase;
    const wave = ph < 0.4 ? smoothstep(0, 0.4, ph) : 1 - smoothstep(0.4, 0.92, ph);
    const purrBuzz = this.purr * 0.035 * Math.sin(this.t * 2 * Math.PI * 26);
    p.breath = (wave - 0.35) * depth + purrBuzz;

    // eyes
    let open = this.eyeTarget;
    if (!this.alive) open = 0;
    const eyeTime = open > this.sEye.x ? lerp(0.25, 1.1, this.sleep) : 0.35;
    let eo = this.sEye.to(open, dt, eyeTime);
    if (this.alive && open > 0.25 && !this.blink && (this.nextBlink -= dt) < 0) {
      // cats blink rarely and slowly; relaxed cats slow-blink
      this.nextBlink = rand(4, 11);
      this.doBlink(this.squintTarget > 0.25 && chance(0.4));
    }
    if (this.blink) {
      const b = this.blink;
      b.t += dt;
      const half = (b.dur - b.hold) / 2;
      let k: number;
      if (b.t < half) k = smoothstep(0, half, b.t);
      else if (b.t < half + b.hold) k = 1;
      else k = 1 - smoothstep(half + b.hold, b.dur, b.t);
      eo *= 1 - k * b.depth;
      if (b.t >= b.dur) {
        if (b.slow) this.sEye.x *= 0.82; // eyes stay softer after a slow blink
        this.blink = null;
      }
    }
    const sq = this.sSquint.to(this.squintTarget, dt);
    const pu = this.sPupil.to(this.pupilTarget, dt, this.pupilTarget > this.sPupil.x ? 0.7 : 0.35);
    // gaze: saccades around the target
    if ((this.nextSaccade -= dt) < 0) {
      this.nextSaccade = rand(0.6, 2.8);
      this.saccade = { x: rand(-0.06, 0.06), y: rand(-0.04, 0.05) };
    }
    const g = this.gazeLocal ?? { x: 0, y: 0 };
    const gx = this.sGx.to(g.x + this.saccade.x * awake, dt);
    const gy = this.sGy.to(g.y + this.saccade.y * awake, dt);
    for (const e of [this.eyeA, this.eyeB]) {
      e.open = eo;
      e.squint = sq * (eo > 0.05 ? 1 : 0);
      e.pupil = pu;
      e.gazeX = gx;
      e.gazeY = gy;
    }
    this.eyeB.open = eo * 0.94;
    p.eyeOpen = eo;

    // head: lift / lean / recoil, plus a little drift while awake
    const drift = awake * 0.4 + 0.08;
    const nA = fbm1(this.t * 0.13 + 3.1) * 0.022 * drift;
    const nX = fbm1(this.t * 0.11 + 7.7) * 1.2 * drift;
    const nY = fbm1(this.t * 0.09 + 1.3) * 1.0 * drift;
    const lift = this.headLift;
    const headA = lift * 8 * DEG - this.headRecoil * 4 * DEG + nA + this.headLean.y * -0.006;
    const headX = -lift * 3 + this.headLean.x + this.headRecoil * 5 + nX;
    const headY = -lift * 5 + this.headLean.y * 0.5 - this.headRecoil * 4 + nY;
    const ht = this.headRecoil > 0.3 ? 0.12 : lerp(0.45, 0.9, this.sleep);
    p.headAngle = this.sHeadA.to(headA, dt, ht) + this.wHead.step(dt) * 0.05;
    p.headX = this.sHeadX.to(headX, dt, ht);
    p.headY = this.sHeadY.to(headY, dt, ht) - this.wHead.x * 2.5;

    // ears
    let el = 0, er = 0, fold = 0;
    switch (this.earMood) {
      case 'sleep': el = 4; er = 6; break;
      case 'relaxed': el = 0; er = 0; break;
      case 'forward': el = -9; er = -10; break;
      case 'side': el = 10; er = 14; fold = 0.25; break;
      case 'back': el = 22; er = 30; fold = 0.5; break;
      case 'flat': el = 38; er = 46; fold = 1; break;
    }
    el += this.earSwivel.l * 8;
    er += this.earSwivel.r * 10;
    this.earSwivel.l *= Math.exp(-dt * 0.6);
    this.earSwivel.r *= Math.exp(-dt * 0.6);
    if (this.alive && (this.nextEarTwitch -= dt) < 0) {
      this.nextEarTwitch = this.sleep > 0.5 ? rand(5, 26) : rand(3, 10);
      const which = chance(0.5) ? 'L' : chance(0.6) ? 'R' : 'both';
      this.twitchEar(which, this.sleep > 0.5 ? 0.7 : 1);
      if (chance(0.25)) setTimeout(() => this.twitchEar(which, 0.6), 140);
    }
    const earT = this.earMood === 'flat' || this.earMood === 'back' ? 0.09 : 0.22;
    p.earLAngle = this.sEarL.to(el * DEG, dt, earT) + this.wEarL.step(dt) * 0.06;
    p.earRAngle = this.sEarR.to(er * DEG, dt, earT) + this.wEarR.step(dt) * 0.06;
    p.earLFold = this.sFoldL.to(fold, dt);
    p.earRFold = this.sFoldR.to(fold, dt);

    // tail tip
    let tailBase = 0;
    if (this.alive && (this.nextTailTick -= dt) < 0) {
      switch (this.tailMood) {
        case 'still': this.nextTailTick = rand(8, 30); if (this.sleep < 0.8 && chance(0.4)) this.flickTail(0.4); break;
        case 'tip': this.nextTailTick = rand(1.5, 4); this.flickTail(0.6); break;
        case 'twitch': this.nextTailTick = rand(0.5, 1.4); this.flickTail(1); break;
        case 'lash': this.nextTailTick = rand(0.35, 0.7); this.flickTail(1.8); break;
      }
    }
    if (this.tailMood === 'lash') tailBase = -6 * DEG;
    p.tailAngle = this.sTail.to(tailBase, dt) + this.wTail.step(dt) * 0.11;

    // paw: kneading while purring, or a swat
    const ka = this.kneadAmt.to(this.kneading ? 1 : 0, dt);
    this.kneadPhase += dt * 1.25 * 2 * Math.PI;
    p.pawSqueeze = ka * 0.045 * Math.max(0, Math.sin(this.kneadPhase));
    let sx = 0, sy = ka * 1.2 * Math.max(0, Math.sin(this.kneadPhase + 1));
    if (this.swatT >= 0) {
      this.swatT += dt;
      const t = this.swatT;
      const out = t < 0.09 ? smoothstep(0, 0.09, t) : 1 - smoothstep(0.12, 0.42, t);
      sx += this.swatDir.x * 22 * out;
      sy += this.swatDir.y * 22 * out - 6 * out;
      if (t > 0.42) this.swatT = -1;
    }
    p.pawX = sx;
    p.pawY = sy;

    // skin and fur
    p.rippleAmp = this.sRipple.to(this.rippleTarget, dt) * 1.9;
    p.ripplePhase += dt * 14;
    p.puff = this.sPuff.to(this.puffTarget, dt, this.puffTarget > this.sPuff.x ? 0.12 : 1.2);

    // colour: sickness and death drain it
    p.desat = this.sDesat.to(this.desatTarget, dt);
    p.dim = this.sDim.to(this.sick * 0.06 + (this.alive ? 0 : 0.05), dt);

    this.updateWhole(dt);
  }

  /** gaze in eye-local units, set from the screen target by the app each frame */
  gazeLocal: { x: number; y: number } | null = null;

  private updateWhole(dt: number) {
    const p = this.pose;
    p.blurX = 0; p.blurY = 0; p.focus = 0; p.stretch = 0; p.gAngle = 0;
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      const k = clamp(f.t / f.dur);
      p.gx = 0; p.gy = 0;
      p.alpha = 1 - smoothstep(0, 1, k);
      p.focus = k * 6;
      p.shadow = 1 - k;
      if (k >= 1) {
        this.fade = null;
        this.hidden = true;
        f.onDone?.();
      }
      return;
    }
    if (this.exit) {
      const e = this.exit;
      e.t += dt;
      const t = e.t;
      // crouch, spring, gone: ease-in acceleration out of the frame
      const lead = e.calm ? 0.35 : 0.12;
      const crouch = smoothstep(0, lead, t) * (1 - smoothstep(lead, lead + 0.1, t));
      const k = smoothstep(lead, e.dur, t);
      const travel = k * k * (e.calm ? 760 : 900);
      const prevTravel = this.lastTravel;
      this.lastTravel = travel;
      const v = (travel - prevTravel) / Math.max(dt, 1e-3);
      p.gx = e.dir * travel;
      // calm: rises first (the body lifts off its bed), then walks off with a bob
      const rise = e.calm ? smoothstep(0, lead + 0.15, t) * 10 : 0;
      p.gy = crouch * 3 - Math.sin(k * Math.PI) * (e.calm ? 6 : 14) - rise + (e.calm ? Math.sin(t * 15) * 1.5 * k : 0);
      p.stretchDirX = e.dir; p.stretchDirY = 0;
      p.stretch = -crouch * 0.03 + Math.min(e.calm ? 0.08 : 0.18, v / 9000);
      p.blurX = e.dir * Math.min(e.calm ? 70 : 140, v * (e.calm ? 0.022 : 0.03));
      p.gAngle = -e.dir * k * 0.08;
      p.shadow = 1 - k;
      p.alpha = 1 - smoothstep(0.8, 1, t / e.dur);
      if (t >= e.dur) {
        this.exit = null;
        this.hidden = true;
        this.lastTravel = 0;
        p.gx = 0; p.gy = 0;
        e.onDone?.();
      }
      return;
    }
    if (this.enter) {
      const e = this.enter;
      e.t += dt;
      const k = clamp(e.t / e.dur);
      p.alpha = smoothstep(0, 0.45, k);
      p.focus = (1 - smoothstep(0.05, 0.9, k)) * 9;
      p.gx = 0;
      p.gy = (1 - smoothstep(0, 0.7, k)) * -4;
      p.stretchDirX = 0; p.stretchDirY = 1;
      p.stretch = Math.sin(smoothstep(0.3, 1, k) * Math.PI) * -0.012;
      p.shadow = smoothstep(0.2, 1, k);
      if (k >= 1) {
        this.enter = null;
        e.onDone?.();
      }
      return;
    }
    p.gx = 0; p.gy = 0;
    p.alpha = this.hidden ? 0 : 1;
    p.shadow = 1;
  }
  private lastTravel = 0;
}
