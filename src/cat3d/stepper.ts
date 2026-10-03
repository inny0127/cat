import * as THREE from 'three';
import { LEGS, type Leg } from './pose';

/**
 * Where in the stride each leg touches down, as a fraction of the cycle after the left hind. A
 * walking cat puts its feet down in lateral sequence (left hind, left fore, right hind, right
 * fore), each fore a little over a quarter of a cycle after the hind on its side.
 */
const WALK: Record<Leg, number> = { LH: 0, LF: 0.27, RH: 0.5, RF: 0.77 };
/** trot: diagonal pairs together */
const TROT: Record<Leg, number> = { LH: 0, RF: 0.02, RH: 0.5, LF: 0.52 };
const FRONT: Record<Leg, boolean> = { LF: true, RF: true, LH: false, RH: false };

/** stride length (m) at a speed (m/s): a slow cat takes long, unhurried steps, a quick one more
 *  of them rather than ever longer ones */
export const strideAt = (v: number) => Math.min(0.08 + 0.5 * v, 0.3 + 0.22 * v);
/** how long a paw is in the air (s): about the same at any walk, a little quicker trotting */
export const swingTimeAt = (v: number) => Math.max(0.17, Math.min(0.3, 0.3 - 0.08 * v));

const ease = (s: number) => s * s * s * (10 + s * (6 * s - 15));
/** a hump over [0,1] whose top is at `peak` */
const hump = (s: number, peak: number) => Math.sin(Math.PI * (s < peak ? 0.5 * s / peak : 0.5 + 0.5 * (s - peak) / (1 - peak)));

interface FootState {
  pos: THREE.Vector3;        // world, where the paw is (or is going)
  from: THREE.Vector3;
  to: THREE.Vector3;
  stepping: boolean;
  /** a little settling step while standing, rather than a stride */
  settle: boolean;
  s: number;                 // 0..1 through the step
  dur: number;
  height: number;
  /** output: the wrist (fore) or hock (hind) folded as the paw lifts (+), or the toes reaching
   *  forward to land (-) */
  flex: number;
  wasPlanted: boolean;
  /** 0..1 through its time on the floor in the stride, -1 when not in the stride */
  stance: number;
  /** the stride (count of the clock) whose swing this leg has taken */
  last: number;
}

/** what the stride does to the body, for the motor to lay over the posture */
export interface GaitSignals {
  /** 0 standing .. 1 striding */
  moving: number;
  /** rise and fall at the hips and at the shoulders (m), about zero */
  hipHeave: number;
  chestHeave: number;
  /** the pelvis and the chest swinging with the legs (rad) */
  hipRoll: number;
  hipYaw: number;
  chestRoll: number;
  chestYaw: number;
  /** each shoulder blade riding up as its leg takes the weight (m) */
  scapL: number;
  scapR: number;
  /** the stride as an angle (rad), for the tail and head */
  angle: number;
  /** strides per second */
  freq: number;
}

/**
 * Decides where each paw is in the world. A walking cat's legs keep a rhythm: one clock (the
 * stride's phase) runs at the cadence its speed calls for, each leg lifts when its turn in the
 * sequence comes, swings to where its stance will be centred under the body and is put down
 * there; planted paws stay exactly where they were put. Standing still, any paw left out of
 * place takes a small settling step. The stride's effect on the body (heave, sway, the shoulder
 * blades) comes out as signals.
 */
export class Stepper {
  readonly feet: Record<Leg, FootState>;
  readonly signals: GaitSignals = {
    moving: 0, hipHeave: 0, chestHeave: 0, hipRoll: 0, hipYaw: 0, chestRoll: 0, chestYaw: 0, scapL: 0, scapR: 0, angle: 0, freq: 0,
  };
  phase = 0;
  /** the stride clock, counting strides */
  private clock = 0;
  /** 0 walk .. 1 trot */
  trot = 0;
  /** strides per second last frame */
  freq = 0;
  duty = 0.7;
  /** stride length at the present speed (m) */
  stride = 0.2;
  private settleCooldown = 0;
  private moving = 0;
  private still = 1;
  private readonly fwd = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor() {
    const f = (): FootState => ({
      pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
      stepping: false, settle: false, s: 0, dur: 0.25, height: 0.03, flex: 0, wasPlanted: false, stance: -1, last: 0,
    });
    this.feet = { LF: f(), RF: f(), LH: f(), RH: f() };
  }

  /** put every paw where the pose wants it (teleport / first frame) */
  reset(home: Record<Leg, THREE.Vector3>) {
    for (const l of LEGS) {
      const F = this.feet[l];
      F.pos.copy(home[l]);
      F.stepping = false;
      F.flex = 0;
    }
  }

  private offset(l: Leg) {
    return WALK[l] * (1 - this.trot) + TROT[l] * this.trot;
  }

  /**
   * home: where the pose wants each paw, world space. planted: 0..1 per leg. vel: body velocity
   * (world, m/s); yawRate rad/s; centre: body centre on the floor, for turning; heading: the
   * body's yaw.
   */
  update(dt: number, home: Record<Leg, THREE.Vector3>, planted: Record<Leg, number>, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3, heading = 0, intent = 0) {
    const speed = Math.hypot(vel.x, vel.z);
    // turning on the spot the paws walk round circles about the middle, the hind ones the
    // larger
    const eff = Math.hypot(speed, 0.2 * yawRate);
    const wantGait = eff > 0.03 || (intent > 0.05 && eff > 0.01);
    this.moving = wantGait ? Math.min(1, this.moving + dt * 5) : Math.max(0, this.moving - dt * 3);
    // the pace is set by the speed it means to go at: getting going, the legs already keep the
    // rhythm of the walk, the first strides short
    const v = Math.max(eff, Math.min(intent, 1.2), 0.06);
    this.trot = Math.min(1, Math.max(0, (speed - 0.75) / 0.35));
    this.stride = strideAt(v);
    this.freq = v / this.stride;
    const swingT = swingTimeAt(v);
    this.duty = Math.min(0.82, Math.max(0.42, 1 - swingT * this.freq));
    const standT = this.duty / this.freq;
    if (wantGait && this.still > 0.6) {
      // setting off from a standstill: a forepaw goes first, at once; the others have had their
      // turn this stride and wait for the next (or step sooner if left behind)
      // (setting off round a turn, the forepaw on the outside of it, which has further to go)
      const lead: Leg = Math.abs(yawRate) > 0.05 ? (yawRate > 0 ? 'RF' : 'LF') : Math.random() < 0.5 ? 'LF' : 'RF';
      const duty = 0.64;
      this.clock = Math.floor(this.clock) + 2 + this.offset(lead) + duty - 0.004;
      for (const l of LEGS) {
        const x = this.clock - this.offset(l), cyc = Math.floor(x);
        this.feet[l].last = x - cyc >= duty ? cyc : cyc - 1;
      }
      this.feet[lead].last = Math.floor(this.clock - this.offset(lead)) - 1;
      this.moving = Math.max(this.moving, 0.35);
    }
    this.still = wantGait ? 0 : Math.min(1, this.still + dt);
    if (this.moving > 0) this.clock += this.freq * dt * Math.max(0.35, this.moving);
    this.phase = this.clock - Math.floor(this.clock);
    this.fwd.set(Math.sin(heading), 0, Math.cos(heading));

    for (const l of LEGS) {
      const F = this.feet[l];
      const isPlanted = planted[l] > 0.5;
      F.stance = -1;
      if (!isPlanted) {
        // held by the body: follows its pose target
        F.pos.copy(home[l]);
        F.stepping = false;
        F.flex = 0;
        F.wasPlanted = false;
        continue;
      }
      if (!F.wasPlanted) {
        // just came down to the floor: start from wherever the pose put it
        F.pos.copy(home[l]);
        F.pos.y = Math.min(F.pos.y, home[l].y);
        F.wasPlanted = true;
      }
      const off = this.offset(l);
      if (F.stepping) {
        F.s = Math.min(1, F.s + dt / F.dur);
        const s = F.s;
        if (!F.settle) {
          // keep aiming where this paw's stance will be centred under the body, as speed and
          // heading change during the swing
          this.aim(F.to, home[l], vel, yawRate, centre, (1 - s) * F.dur + standT * 0.5);
        }
        F.pos.lerpVectors(F.from, F.to, ease(s));
        F.pos.y = F.to.y + F.height * hump(s, FRONT[l] ? 0.38 : 0.45);
        // forepaw: the wrist folds at lift-off (the pads turn to face back), opens through the
        // swing and the toes reach forward to land; hind: the hock folds and the foot comes
        // through low
        const k = F.settle ? 0.45 : 1;
        if (FRONT[l]) F.flex = k * (s < 0.62 ? 0.72 * Math.sin(Math.PI * s / 0.62) : -0.22 * Math.sin(Math.PI * (s - 0.62) / 0.38));
        else F.flex = k * (s < 0.66 ? 0.78 * Math.sin(Math.PI * s / 0.66) : -0.1 * Math.sin(Math.PI * (s - 0.66) / 0.34));
        if (s >= 1) {
          F.stepping = false;
          F.flex = 0;
          F.pos.copy(F.to);
        }
        continue;
      }
      F.flex = 0;
      if (this.moving > 0) {
        const x = this.clock - off, cyc = Math.floor(x), psi = x - cyc;
        if (psi < this.duty) F.stance = psi / this.duty;
        // its turn to lift: once a stride, when the leg's phase is past its time on the floor; or
        // when it has been left behind (setting off, a change of pace), as soon as the other leg
        // of its pair is down
        const due = psi >= this.duty && F.last < cyc;
        const partner = this.feet[(FRONT[l] ? (l === 'LF' ? 'RF' : 'LF') : (l === 'LH' ? 'RH' : 'LH')) as Leg];
        // (or swung out of place by a turn on the spot)
        const off2 = this.tmp.copy(F.pos).sub(home[l]);
        off2.y = 0;
        const behind = -off2.dot(this.fwd) > 0.5 * speed * standT + 0.035 || off2.length() > 0.5 * eff * standT + 0.045;
        // (far out of place, it goes even with its partner up: a quick hop of a step)
        const stranded = off2.length() > 0.5 * eff * standT + 0.08;
        if ((due || (behind && !partner.stepping) || stranded) && this.moving > 0.3) {
          F.last = cyc;
          this.begin(F, home[l], vel, yawRate, centre, swingT, swingT + standT * 0.5,
            (FRONT[l] ? 0.026 : 0.022) + 0.014 * Math.min(1, speed), false);
        }
      }
    }
    // standing still: tidy up paws that are out of place, one at a time
    this.settleCooldown -= dt;
    if (this.moving < 0.5 && this.settleCooldown <= 0 && !LEGS.some((l) => this.feet[l].stepping)) {
      let worst: Leg | null = null, err = 0.022;
      for (const l of LEGS) {
        if (planted[l] <= 0.5) continue;
        const d = Math.hypot(this.feet[l].pos.x - home[l].x, this.feet[l].pos.z - home[l].z);
        if (d > err) { err = d; worst = l; }
      }
      if (worst) {
        this.begin(this.feet[worst], home[worst], vel, 0, centre, 0.22 + Math.min(0.12, err), 0, 0.012 + Math.min(0.016, err * 0.3), true);
        this.settleCooldown = 0.1;
      }
    }
    this.body(home);
  }

  /** where a paw should land: its place under the body `lead` seconds from now */
  private aim(out: THREE.Vector3, home: THREE.Vector3, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3, lead: number) {
    out.copy(home).addScaledVector(vel, lead);
    if (yawRate !== 0) {
      const a = yawRate * lead;
      const dx = out.x - centre.x, dz = out.z - centre.z;
      const c = Math.cos(a), s = Math.sin(a);
      out.x = centre.x + dx * c + dz * s;
      out.z = centre.z - dx * s + dz * c;
    }
    out.y = home.y;
  }

  private begin(F: FootState, home: THREE.Vector3, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3, dur: number, lead: number, height: number, settle: boolean) {
    F.from.copy(F.pos);
    F.from.y = Math.max(F.from.y, home.y);
    this.aim(F.to, home, vel, yawRate, centre, lead);
    F.s = 0;
    F.dur = dur;
    F.height = height;
    F.settle = settle;
    F.stepping = true;
  }

  /** the stride's effect on the body: highest over a leg standing straight under it, dipping
   *  over the swinging side, turning with the legs; the shoulder blades ride up over the
   *  forelegs as they take the weight */
  private body(home: Record<Leg, THREE.Vector3>) {
    const g = this.signals, f = this.feet;
    const w = this.moving;
    const support = (l: Leg) => (f[l].stance >= 0 ? Math.sin(Math.PI * f[l].stance) : 0);
    const swing = (l: Leg) => (f[l].stepping && !f[l].settle ? Math.sin(Math.PI * f[l].s) : 0);
    // how far ahead of its place under the body each paw is, in half-strides
    const half = Math.max(0.05, this.stride * 0.5);
    const ahead = (l: Leg) => Math.max(-1, Math.min(1, this.tmp.copy(f[l].pos).sub(home[l]).dot(this.fwd) / half));
    g.moving = w;
    g.freq = this.freq;
    g.angle = this.phase * Math.PI * 2;
    // twice a stride, highest as each leg passes straight under its girdle
    const d2 = this.duty / 2, tau = Math.PI * 2;
    g.hipHeave = w * 0.0025 * Math.cos(2 * tau * (this.phase - this.offset('LH') - d2));
    g.chestHeave = w * 0.0025 * Math.cos(2 * tau * (this.phase - this.offset('LF') - d2));
    // the cat's right side drops (+ roll) while its right hind swings; its right hip leads
    // (+ yaw) while the right hind is ahead
    g.hipRoll = w * 0.035 * (swing('RH') - swing('LH'));
    g.chestRoll = w * 0.03 * (swing('RF') - swing('LF'));
    g.hipYaw = w * 0.07 * (ahead('RH') - ahead('LH')) * 0.5;
    g.chestYaw = w * 0.08 * (ahead('RF') - ahead('LF')) * 0.5 - g.hipYaw;
    g.scapL = w * 0.007 * support('LF');
    g.scapR = w * 0.007 * support('RF');
  }

  /** is any paw in the air */
  get busy() {
    return LEGS.some((l) => this.feet[l].stepping);
  }
}
