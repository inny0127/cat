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
/** bounding, as a cat runs flat out over a short way (a half-bound): the hinds come down
 *  together, then the fores one after the other */
const BOUND: Record<Leg, number> = { LH: 0, RH: 0.06, LF: 0.46, RF: 0.58 };
const FRONT: Record<Leg, boolean> = { LF: true, RF: true, LH: false, RH: false };
/** which side of the body each leg is on (the model's +x is the cat's left) */
const SIDE: Record<Leg, number> = { LF: 1, LH: 1, RF: -1, RH: -1 };

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
  /** bounding, the back gathered (+, rounded as the hinds swing through) or stretched out (-) */
  flex: number;
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
    moving: 0, hipHeave: 0, chestHeave: 0, hipRoll: 0, hipYaw: 0, chestRoll: 0, chestYaw: 0, scapL: 0, scapR: 0, angle: 0, freq: 0, flex: 0,
  };
  phase = 0;
  /** the stride clock, counting strides */
  private clock = 0;
  /** 0 walk .. 1 trot */
  trot = 0;
  /** bounding (flat out) */
  bound = false;
  /** in a mad rush (the zoomies): it bounds at any brisk pace, not only flat out */
  eager = false;
  /** strides per second last frame */
  freq = 0;
  duty = 0.7;
  /** stride length at the present speed (m) */
  stride = 0.2;
  /** how high the floor is at a point (the cushion and rim of a bed, a box's sides); 0 if flat */
  ground: ((x: number, z: number) => number) | null = null;
  /** how far the whole body stands lifted off the floor (over a cushion): the pose's paws are that
   *  much above where the floor is */
  lift = 0;
  /** a paw coming down (settle: a little shift of the feet, not a stride) */
  onLand: ((leg: Leg, settle: boolean) => void) | null = null;
  /** how far short of each planted paw its leg came last frame (m; the cat sets it after its IK) */
  readonly strain: Record<Leg, number> = { LF: 0, RF: 0, LH: 0, RH: 0 };
  /** how far across under the body each planted paw was last frame, past the middle, in the frame
   *  of its own shoulders or hips (m; below 0: on its own side; the cat sets it after its IK) */
  readonly cross: Record<Leg, number> = { LF: -1, RF: -1, LH: -1, RH: -1 };
  /** each leg's girdle (shoulders, hips) as the body had it last frame, world: where it is and the
   *  way out from the middle to that leg's side, level (the cat sets them after its IK) */
  readonly girdle: Record<Leg, { at: THREE.Vector3; out: THREE.Vector3; ok: boolean }> = {
    LF: { at: new THREE.Vector3(), out: new THREE.Vector3(), ok: false }, RF: { at: new THREE.Vector3(), out: new THREE.Vector3(), ok: false },
    LH: { at: new THREE.Vector3(), out: new THREE.Vector3(), ok: false }, RH: { at: new THREE.Vector3(), out: new THREE.Vector3(), ok: false },
  };
  private settleCooldown = 0;
  private moving = 0;
  private still = 1;
  private readonly fwd = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmp3 = new THREE.Vector3();
  private readonly tmp4 = new THREE.Vector3();
  private readonly across = new THREE.Vector3();

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
    if (this.bound) return BOUND[l];
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
    // flat out it bounds (on above a speed, off again only a good deal below it)
    if (!this.bound && (speed > 1.2 || (this.eager && speed > 0.75))) this.bound = true;
    else if (this.bound && speed < (this.eager ? 0.45 : 0.95)) this.bound = false;
    this.stride = strideAt(v);
    // (round on the spot, or round a tight turn, the paws patter: quick short steps, each sweeping
    // no more than about half a radian round under the body, rather than long strides the body
    // turns out from over)
    this.freq = Math.max(v / this.stride, Math.min(4.5, 1.25 * Math.abs(yawRate)));
    // (bounding: the paws are on the floor only a third of the stride)
    const swingT = this.bound ? 0.6 / this.freq : Math.min(swingTimeAt(v), 0.58 / this.freq);
    this.duty = this.bound ? 0.36 : Math.min(0.82, Math.max(0.42, 1 - swingT * this.freq));
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
    this.across.set(Math.cos(heading), 0, -Math.sin(heading));

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
        F.pos.y = this.floorAt(home[l]);
        F.wasPlanted = true;
      }
      const off = this.offset(l);
      if (F.stepping) {
        F.s = Math.min(1, F.s + dt / F.dur);
        const s = F.s;
        // (a little shift of the feet begun standing still is aimed at its place as it is; set off
        // meanwhile, round or along, the paw goes where it will be wanted, as any step does: not
        // left to come down where the body has turned away from, across under it)
        if (!F.settle || this.moving > 0.3) {
          // keep aiming where this paw's stance will be centred under the body, as speed and
          // heading change during the swing (but a stop or a turn all at once moves the place
          // it is aimed at no faster than a paw in the air can be redirected: not a jump of it)
          const was = this.tmp2.copy(F.to);
          this.aim(F.to, home[l], vel, yawRate, centre, (1 - s) * F.dur + standT * 0.5);
          this.ownSide(F.to, l, vel, yawRate, centre, (1 - s) * F.dur);
          const moved = F.to.distanceTo(was), most = 2.5 * dt;
          if (moved > most) F.to.lerpVectors(was, F.to, most / moved);
        }
        F.pos.lerpVectors(F.from, F.to, ease(s));
        // (up and over in an arc from the height it left to the height it lands at: a step up onto
        // the bed's cushion, or down off it, rises or falls through the swing, not at its start)
        F.pos.y = F.from.y + (F.to.y - F.from.y) * ease(s) + F.height * hump(s, FRONT[l] ? 0.38 : 0.45);
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
          this.onLand?.(l, F.settle);
        }
        continue;
      }
      F.flex = 0;
      // a paw the body has turned or gone on from over: in toward the middle under it, far out of
      // its place, or past where its leg reaches. It steps at once, quickly, whatever the others
      // are doing: a cat's legs never cross under it, nor hang straight off a paw left behind
      {
        const o = this.tmp.copy(F.pos).sub(home[l]);
        o.y = 0;
        const d = o.length();
        const inward = -SIDE[l] * o.dot(this.across);
        if (inward > 0.03 || d > 0.075 + 0.5 * speed * standT || (this.strain[l] > 0.012 && d > 0.02) || (this.cross[l] > 0.015 && d > 0.012)) {
          if (this.moving > 0) F.last = Math.floor(this.clock - off);
          this.begin(F, home[l], vel, yawRate, centre, Math.min(swingT, 0.2), Math.min(swingT, 0.2) + (this.moving > 0.3 ? standT * 0.5 : 0),
            (FRONT[l] ? 0.02 : 0.016) + 0.01 * Math.min(1, speed), false);
          continue;
        }
      }
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
            (FRONT[l] ? 0.026 : 0.022) + 0.014 * Math.min(1, speed) + (this.bound ? 0.018 : 0), false);
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

  /** which leg a foot is */
  private legOf(F: FootState): Leg {
    for (const l of LEGS) if (this.feet[l] === F) return l;
    return 'LF';
  }

  /** a paw is put down out on its own side of its shoulders or hips as they will be when it lands
   *  (`lead` s on), never across under the body past the middle: round a sharp turn at a run the
   *  spine bends and the hips swing out, and a place reckoned for the body as a whole was in under
   *  them */
  private ownSide(to: THREE.Vector3, l: Leg, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3, lead: number) {
    const G = this.girdle[l];
    if (!G.ok) return;
    const at = this.tmp3;
    this.aim(at, G.at, vel, yawRate, centre, lead);
    const a = yawRate * lead, c = Math.cos(a), sn = Math.sin(a);
    const out = this.tmp4.set(G.out.x * c + G.out.z * sn, 0, -G.out.x * sn + G.out.z * c);
    const side = (to.x - at.x) * out.x + (to.z - at.z) * out.z, least = FRONT[l] ? 0.014 : 0.018;
    // (going along: spun round on the spot after its tail, the shuffle of its paws is its own)
    const going = Math.max(0, Math.min(1, (Math.hypot(vel.x, vel.z) - 0.15) / 0.3));
    if (side < least && going > 0) {
      // (and down on the floor where it is moved to: off the edge of the cushion, or on it)
      const g0 = this.ground ? this.ground(to.x, to.z) : 0;
      to.addScaledVector(out, (least - side) * going);
      if (this.ground) to.y += this.ground(to.x, to.z) - g0;
    }
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
    out.y = this.floorAt(out);
  }

  /** where a paw stands on the floor at a point: the pose's height over the floor there */
  private floorAt(p: THREE.Vector3) {
    return p.y - this.lift + (this.ground ? this.ground(p.x, p.z) : 0);
  }

  private begin(F: FootState, home: THREE.Vector3, vel: THREE.Vector3, yawRate: number, centre: THREE.Vector3, dur: number, lead: number, height: number, settle: boolean) {
    F.from.copy(F.pos);
    this.aim(F.to, home, vel, yawRate, centre, lead);
    this.ownSide(F.to, this.legOf(F), vel, yawRate, centre, dur);
    // high enough to clear whatever lies between (a bed's rim)
    if (this.ground) {
      for (let i = 1; i < 10; i++) {
        const s = i / 10, t = ease(s);
        const g = this.ground(F.from.x + (F.to.x - F.from.x) * t, F.from.z + (F.to.z - F.from.z) * t);
        const need = g + home.y - this.lift + 0.012 - (F.from.y + (F.to.y - F.from.y) * t);
        if (need > 0) height = Math.max(height, need / Math.max(0.3, hump(s, 0.42)));
      }
      // (a rim right at the start or the end of the step is brushed past, not leapt: no paw goes up
      // more than a hand's breadth for a step)
      height = Math.min(height, 0.1);
    }
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
    g.flex = 0;
    if (this.bound) {
      // bounding: the whole body rides up in the flight after the hinds push off; the back
      // gathers as the hinds swing through under it and stretches out as the fores reach; little
      // roll or sway
      const ph = this.phase;
      g.hipHeave = w * 0.012 * Math.cos(tau * (ph - 0.3));
      g.chestHeave = w * 0.012 * Math.cos(tau * (ph - 0.42));
      g.flex = w * Math.cos(tau * (ph - 0.92));
      g.hipRoll *= 0.3; g.chestRoll *= 0.3; g.hipYaw *= 0.3; g.chestYaw *= 0.3;
    }
  }

  /** is any paw in the air */
  get busy() {
    return LEGS.some((l) => this.feet[l].stepping);
  }
}
