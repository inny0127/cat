import * as THREE from 'three';
import { twitch } from '../util/math';
import { POSES, type PoseLayer } from '../cat3d/pose';
import { washFace, type Act, type Ctx } from './behave';

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** the feathers on the end of the wand, as the cat sees them: where, how fast they go, whether a
 *  hand has the wand, whether the cat's paws have them */
export interface Lure {
  p: THREE.Vector3;
  v: THREE.Vector3;
  held: boolean;
  pinned: boolean;
}

type Phase = 'watch' | 'go' | 'wiggle' | 'pounce' | 'pin' | 'kick' | 'swat' | 'rear' | 'leap' | 'sit';

/**
 * The feather wand: the feathers dangled and twitched on their string are a bird, a mouse, a moth,
 * whatever moves. The cat's eyes and head go with them everywhere, the tail tip twitching. Off a
 * way, it goes after them; dragged along the floor, it creeps, wiggles and pounces, and caught,
 * holds them down under both forepaws and bites, until they are pulled free; dangled within
 * reach, a quick swipe of a paw sends them swinging; a little higher, it rears up on its hind legs
 * and claps at them with both; higher still, it leaps straight up after them. Left lying still, it
 * soon sits and watches; and in the end it has had enough.
 */
export class Tease implements Act {
  readonly name = 'tease';
  phase: Phase = 'watch';
  private t = 0;
  private dur = 0;
  /** how long it has played, and how long it will before it has had enough */
  private total = 0;
  private readonly patience: number;

  /** alone: nobody has the wand, it is lying on the floor, and the cat has gone to play with the
   *  feathers by itself (a pounce or two, a bat to send them sliding, a kick, and done) */
  constructor(readonly alone = false) {
    this.patience = alone ? rand(10, 22) : rand(70, 150);
  }
  /** how fast the feathers go (smoothed), and how long since they last moved */
  private ls = 0;
  private still = 0;
  private side = Math.random() < 0.5 ? 1 : -1;
  private leaps = 0;
  /** sat up to swat, how long the feathers have been off out of its reach (s) */
  private offFor = 0;
  private hit = false;
  /** over on its side kicking them, once a catch; which side (1: its right side down) */
  private kicked = false;
  private roll = 1;
  private calm = 0;
  private readonly aim = new THREE.Vector3(NaN, 0, 0);
  private readonly fwd = new THREE.Vector3();
  private readonly paws = new THREE.Vector3();
  private wash: import('./behave').Act | null = null;

  get tired() {
    return this.total > this.patience;
  }

  get ownGaze() {
    return true;
  }

  private next(phase: Phase, dur = 0) {
    this.phase = phase;
    this.t = 0;
    this.dur = dur;
    this.hit = false;
    this.best = 1e9;
    this.stuck = 0;
  }
  private best = 1e9;
  private stuck = 0;

  /** where it believes the feathers are, and how fast they seem to go */
  private readonly seenP = new THREE.Vector3(NaN, 0, 0);
  private readonly seenV = new THREE.Vector3();
  private seenAt(c: Ctx, L: Lure) {
    // (lost sight of: where it last had them, till its eyes find them again)
    const p = L.pinned ? L.p : c.seen?.('wand') ?? (Number.isNaN(this.seenP.x) || !c.seen ? L.p : this.seenP);
    if (!Number.isNaN(this.seenP.x) && this.dtLast > 0) {
      const v = this.tmpV.copy(p).sub(this.seenP).divideScalar(this.dtLast);
      if (v.length() > 6) v.setLength(6);
      this.seenV.lerp(v, Math.min(1, this.dtLast * 12));
    }
    this.seenP.copy(p);
    return p;
  }
  private dtLast = 0;
  private readonly tmpV = new THREE.Vector3();

  /** a point in front of the cat, in its own frame (x to its left, y up, z ahead) */
  private local(c: Ctx, p: THREE.Vector3) {
    const m = c.m, dx = p.x - m.pos.x, dz = p.z - m.pos.z;
    return { x: dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw), y: p.y, z: dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw) };
  }

  update(dt: number, c: Ctx) {
    const m = c.m;
    if (this.wash) {
      if (this.wash.update(dt, c)) return true;
      this.wash.stop(c);
      this.wash = null;
      return false;
    }
    const L = c.lure();
    if (!L) return false;
    this.dtLast = dt;
    this.t += dt;
    this.total += dt;
    this.calm = Math.max(0, this.calm - dt);
    // (where it believes the feathers are, seen a moment late and lost track of when whipped away
    // too fast, is what it watches, goes after and aims at; under its paws it feels them. Whether a
    // paw meets them is where they really are)
    const P = this.seenAt(c, L);
    const sp = this.seenV.length();
    this.ls += (sp - this.ls) * Math.min(1, dt * 8);
    this.still = sp > 0.1 || L.pinned ? 0 : this.still + dt;
    this.fwd.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    const dx = P.x - m.pos.x, dz = P.z - m.pos.z, dist = Math.hypot(dx, dz);
    const face = Math.atan2(dx, dz), h = P.y;
    if (this.phase !== 'sit') m.lookAt((!L.pinned && c.gaze('wand')) || P, 1);
    const keen: PoseLayer = { earFwd: 0.95, pupil: 1, eyeOpen: 1, whisker: 0.9, tailCurl: 0.7 * twitch(this.total, 9) };
    // had enough (not in the middle of a spring): off to sit and wash
    if ((this.tired || (!L.held && !this.alone && this.still > 4)) && (this.phase === 'watch' || this.phase === 'go')) {
      m.stop();
      m.layer = null;
      m.lookAt(null);
      this.wash = washFace();
      return true;
    }
    switch (this.phase) {
      case 'watch': {
        // low and still, turned to them, eyes on them; deciding (low: down off its haunches too,
        // sat after a swat; the crouch's height on a sitting cat would lift its forepaws off the
        // floor)
        // (sat up after a swat or a rear, and them still up there in reach: it stays sat up for the
        // next, as a cat does, not down into a crouch and up again with every swat)
        // (swung off a little by its own swat, a moment: it waits for them to come back, sat)
        const upThere = h > 0.09 && dist <= 0.42;
        this.offFor = m.targetPosture === 'sit' && !upThere ? this.offFor + dt : 0;
        const satUp = m.targetPosture === 'sit' && (upThere || this.offFor < 0.7);
        if (!satUp && m.targetPosture !== 'crouch') m.setPosture('crouch');
        if (Math.abs(wrapA(face - m.yaw)) > 0.45 && !m.goal && dist > 0.05) m.walkTo(m.pos.clone(), 0.15, face);
        const wg = h < 0.12 && this.ls > 0.1 ? Math.sin(this.t * Math.PI * 2 * 4) : 0;
        m.layer = satUp ? {
          // (as it sits to swat: up on its haunches, a little forward, the forepaws down)
          pose: { ...keen, chestPitch: -0.97, hipY: 0.064, neckPitch: h > 0.25 ? 0.3 : 0.05, headPitch: 0.05, tailSide: 0.35 * twitch(this.t, 6) },
          w: 1,
        } : {
          pose: { ...keen, hipY: 0.14, neckPitch: h > 0.25 ? 0.45 : -0.3, headPitch: h > 0.25 ? 0.1 : 0.05, hipYaw: 0.08 * wg, tailSide: 0.35 * twitch(this.t, 6) },
          w: Math.min(1, this.t / 0.25),
        };
        if (this.t < 0.25 || this.calm > 0 || m.goal) return true;
        const L2 = this.local(c, P);
        if (h < 0.09) {
          // on the floor: after it, and pounced on
          if (dist > 0.42) { if (this.ls > 0.12 || this.still < 2 || this.alone) this.next('go'); }
          else if (this.ls > 0.08 || this.t > 1.2) this.next('wiggle', this.ls > 0.3 ? rand(0.15, 0.35) : rand(0.4, 0.9));
        } else if (dist > 0.3) {
          // in the air, out of reach: closer (under it)
          if (this.ls > 0.05 || this.still < 3) this.next('go');
        } else if (L2.z < 0.04) {
          // (beside or behind it: round to it first)
          if (!m.goal) m.walkTo(m.pos.clone().addScaledVector(this.fwd, -0.06), 0.18, face);
        } else if (h <= 0.3) { this.side = L2.x > 0 ? 1 : -1; this.next('swat', 0.5); }
        else if (h <= 0.46) this.next('rear', rand(0.9, 1.6));
        else if (h <= 0.8 && this.leaps < 4) this.next('leap', rand(0.35, 0.7));
        return true;
      }
      case 'go': {
        // after them: to a stop short of where they hang or lie (under them, if in the air); no
        // nearer for a good while (round and round a point it cannot quite turn in to), it stops
        const short = h < 0.09 ? 0.27 : 0.18;
        if (dist < this.best - 0.02) { this.best = dist; this.stuck = 0; }
        else this.stuck += dt;
        if ((dist < short + 0.08 && !m.goal) || this.stuck > 1.6) { m.stop(); m.zoom = 0; this.next('watch'); return true; }
        if (!m.goal || Math.hypot(P.x - this.aim.x, P.z - this.aim.z) > 0.06) {
          this.aim.copy(P);
          const stop = new THREE.Vector3(P.x - (dx / (dist || 1)) * short, 0, P.z - (dz / (dist || 1)) * short);
          c.keepClear(stop, 0.13);
          const fast = dist > 0.7 || this.ls > 0.6;
          m.zoom = fast ? 0.6 : 0.2;
          if (fast) m.setPosture('stand');
          m.walkTo(stop, fast ? 1.0 : h < 0.1 ? 0.22 : 0.4, face);
        }
        m.layer = { pose: { ...keen, hipY: 0.17, tailLift: 0.2 }, w: Math.min(1, this.t / 0.2) };
        return true;
      }
      case 'wiggle': {
        // the rump up and wiggling, then the spring
        if (dist > 0.5 || h > 0.15) { m.layer = null; this.next('watch'); return true; }
        if (Math.abs(wrapA(face - m.yaw)) > 0.4 && !m.goal) m.walkTo(m.pos.clone(), 0.15, face);
        m.setPosture('crouch');
        const wg = Math.sin(this.t * Math.PI * 2 * 5);
        m.layer = {
          pose: {
            ...keen, hipY: 0.15, hipPitch: -0.12, neckPitch: -0.45, headPitch: 0.1, hipYaw: 0.1 * wg, hipRoll: 0.07 * wg,
            // (and the head swayed from side to side, the eyes kept on it, as a hunter judges how far)
            neckYaw: 0.09 * twitch(this.t, 8), headYaw: -0.07 * twitch(this.t, 8),
            LH: { y: 0.012 + 0.012 * Math.max(0, wg) }, RH: { y: 0.012 + 0.012 * Math.max(0, -wg) },
            tailLift: -0.3, tailSide: 0.4 * twitch(this.t, 11), tailCurl: 0.9 * twitch(this.t, 13),
          },
          w: 1,
        };
        if (this.t > this.dur) { m.stop(); this.next('pounce', 0.34); }
        return true;
      }
      case 'pounce': {
        // forward through the air, both forepaws coming down on them (steering after them)
        const u = Math.min(1, this.t / this.dur), arc = Math.sin(Math.PI * u);
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -1, 1) * Math.min(1, dt * 6) * (1 - u));
        const reach = clamp(dist - 0.14, 0.05, 0.26);
        m.pos.addScaledVector(this.fwd, ((Math.PI / 2) * reach / this.dur) * arc * dt);
        const fore = { planted: 0, frame: 0, x: 0.03, y: 0.012 + 0.07 * arc, z: 0.115 + 0.11 * Math.sin(Math.PI * Math.min(1, u * 1.15)), flex: 0.2 * arc };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.025 * arc, z: -0.13 - 0.04 * arc };
        m.layer = { pose: { ...keen, hipY: 0.15 + 0.06 * arc, chestPitch: 0.3 * arc, neckPitch: -0.15, headPitch: 0.05, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.3 * arc - 0.2 }, w: 1 };
        if (u >= 1) {
          c.sound('thump', 0.16);
          this.paws.copy(m.pos).addScaledVector(this.fwd, 0.19);
          if (Math.hypot(L.p.x - this.paws.x, L.p.z - this.paws.z) < 0.1 && h < 0.12) {
            // got them: held down under both forepaws
            c.pinLure(rand(1.2, 2.6), this.paws.clone().setY(0.012));
            this.kicked = false;
            this.next('pin');
          } else { this.calm = rand(0.2, 0.5); this.next('watch'); }
        }
        return true;
      }
      case 'pin': {
        // both forepaws on them, the head down biting, the hind feet treading; till they are
        // pulled free (after them again at once) or it lets go
        const bite = Math.max(0, Math.sin(this.t * 7));
        const tread = Math.sin(this.t * Math.PI * 2 * 3);
        const paw = { planted: 0, frame: 0, x: 0.028, y: 0.075, z: 0.15, flex: 0.3 };
        m.setPosture('crouch');
        m.layer = {
          pose: {
            ...keen, hipY: 0.14, chestPitch: 0.1, neckPitch: -0.5, headPitch: -0.1 - 0.15 * bite, jaw: 0.3 * bite,
            LF: paw, RF: paw, LH: { y: 0.012 + 0.01 * Math.max(0, tread) }, RH: { y: 0.012 + 0.01 * Math.max(0, -tread) },
            tailSide: 0.5 * twitch(this.t, 7), tailCurl: 0.8 * twitch(this.t, 9),
          },
          w: Math.min(1, this.t / 0.12),
        };
        if (!L.pinned) {
          m.layer = null;
          // (on its own, done with holding them: a bat with a paw sends them sliding off, to be
          // after again)
          if (this.alone && !L.held) c.batLure(this.fwd.clone().multiplyScalar(rand(0.6, 1)).add(new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw)).multiplyScalar(rand(-0.8, 0.8))));
          this.next('watch');
          this.calm = rand(0.05, 0.25);
        }
        // (held a moment: now and then over onto its side with them, for a good kick)
        else if (this.t > 0.7 && !this.kicked && Math.random() < dt * 1.2) {
          this.kicked = true;
          this.next('kick', rand(1.6, 3));
        }
        return true;
      }
      case 'kick': {
        // over onto its side with them, hugged to its belly in both forepaws, the head curled
        // down biting at them, the hind feet raking at them, kick after kick (pulled out of its
        // grip, it is after them again)
        // (rolled over toward you, its belly and the kicking feet your way: on its right side
        // turned to face left across the picture, or on its left side facing right, whichever is
        // the less of a turn)
        if (this.t <= dt) this.roll = Math.sin(m.yaw) > 0 ? -1 : 1;
        const sd = this.roll, face0 = -sd * Math.PI / 2;
        m.yaw = wrapA(m.yaw + clamp(wrapA(face0 - m.yaw), -5, 5) * Math.min(1, dt * 7));
        const S = POSES.side;
        const w = ease(this.t / 0.28) * (1 - ease((this.t - this.dur) / 0.35));
        const ph = this.t * Math.PI * 2 * 4.3;
        const k1 = Math.max(0, Math.sin(ph)), k2 = Math.max(0, Math.sin(ph + 1.9));
        const bite = Math.max(0, Math.sin(this.t * 9));
        const belly = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw)).multiplyScalar(sd);
        if (L.pinned || this.t < 0.2) c.pinLure(0.25, m.pos.clone().addScaledVector(belly, 0.155).addScaledVector(this.fwd, 0.05).setY(0.05));
        // (the upper paws, the ones on the side that is up, and the lower)
        const [uf, lf, uh, lh] = sd > 0 ? ['LF', 'RF', 'LH', 'RH'] : ['RF', 'LF', 'RH', 'LH'];
        m.setPosture('crouch');
        m.layer = {
          pose: {
            hipY: S.hipY, hipZ: S.hipZ, hipPitch: S.hipPitch, hipRoll: sd * S.hipRoll, lumbarPitch: -0.3, chestRoll: sd * S.chestRoll, chestPitch: -0.1,
            neckPitch: -0.55, neckYaw: sd * 0.05, headPitch: -0.35 - 0.12 * bite, headRoll: sd * S.headRoll, jaw: 0.3 * bite,
            [uf]: { planted: 0, frame: 0, x: 0.13, y: 0.075, z: 0.07, flex: 0.75 },
            [lf]: { planted: 0, frame: 0, x: -0.12, y: 0.035, z: 0.08, flex: 0.75 },
            [uh]: { planted: 0, frame: 0, x: 0.11, y: 0.06, z: -0.21 + 0.17 * k1, flex: 0.35 },
            [lh]: { planted: 0, frame: 0, x: -0.08, y: 0.025, z: -0.2 + 0.16 * k2, flex: 0.35 },
            pastern: S.pastern, hindFlat: S.hindFlat,
            earFwd: -0.25, earOut: 0.3, pupil: 1, eyeOpen: 0.85, whisker: 0.8,
            tailLift: S.tailLift, tailSide: 0.7 * twitch(this.t, 6), tailCurve: S.tailCurve, tailSag: 1,
          },
          w,
        };
        if (!L.pinned && this.t > 0.3 && this.t < this.dur) this.t = this.dur;
        if (this.t > this.dur + 0.35) { m.layer = null; this.calm = rand(0.2, 0.5); this.next('watch'); }
        return true;
      }
      case 'swat': {
        // up on the haunches, a forepaw flung up and out at them, and down again
        const u = Math.min(1, this.t / this.dur), up = Math.sin(Math.PI * u);
        const L2 = this.local(c, P);
        const reach = clamp(h, 0.06, 0.3), out = clamp(L2.z, 0.1, 0.27), across = clamp(Math.abs(L2.x), 0.01, 0.09);
        const paw = { planted: 0, frame: 0, x: 0.02 + (across - 0.02) * up, y: 0.05 + (reach - 0.05) * up, z: 0.08 + (out - 0.08) * up, flex: 0.5 * up };
        m.setPosture('sit');
        // (sat up a little taller for it, not so tall the other forepaw comes up off the floor)
        m.layer = { pose: { ...keen, chestPitch: -1.12 * up - 0.97 * (1 - up), hipY: 0.064 + 0.011 * up, neckPitch: 0.1 * up, [this.side > 0 ? 'LF' : 'RF']: paw }, w: 1 };
        if (!this.hit && u > 0.45) {
          this.hit = true;
          const pawAt = m.pos.clone().addScaledVector(this.fwd, out).add(new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw)).multiplyScalar(this.side * across)).setY(reach);
          c.bump(pawAt, 0.3);
          if (pawAt.distanceTo(L.p) < 0.09) {
            // caught on a claw now and then; mostly sent swinging off the way the paw went
            if (Math.random() < 0.2) { c.pinLure(rand(0.8, 1.6), m.pos.clone().addScaledVector(this.fwd, 0.16).setY(0.012)); this.next('pin'); return true; }
            const left = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
            c.batLure(this.fwd.clone().multiplyScalar(0.6).addScaledVector(left, -this.side * 1.3).add(new THREE.Vector3(0, 0.5, 0)));
          }
        }
        if (u >= 1) { this.calm = rand(0.15, 0.5); this.side = -this.side; this.next('watch'); }
        return true;
      }
      case 'rear': {
        // up on the hind legs, both forepaws up at them, clapping, one and then both
        const L2 = this.local(c, P);
        if (dist > 0.36 || h > 0.55 || h < 0.06) { m.layer = null; this.next('watch'); return true; }
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -2, 2) * Math.min(1, dt * 5));
        m.stop();
        m.setPosture('sit');
        const up = ease(this.t / 0.3), k = Math.floor(this.t / 0.38), u = (this.t % 0.38) / 0.38;
        const clap = Math.sin(Math.PI * u), hy = clamp(h, 0.12, 0.42), out = clamp(L2.z, 0.08, 0.22);
        const pawL = { planted: 0, frame: 0, x: 0.05 - 0.04 * clap, y: 0.05 + (hy - 0.05) * up + 0.02 * clap, z: 0.07 + (out - 0.07) * up, flex: 0.3 + 0.3 * clap };
        const pawR = { ...pawL, y: pawL.y - (k % 2 ? 0.03 : 0) };
        m.layer = { pose: { ...keen, chestPitch: -1.02 - 0.2 * up, hipY: 0.056 + 0.035 * up, neckPitch: 0.3 * up, headPitch: -0.05, LF: pawL, RF: pawR, tailSide: 0.5 * twitch(this.t, 6) }, w: 1 };
        if (u > 0.5 && !this.hit) {
          this.hit = true;
          const pawAt = m.pos.clone().addScaledVector(this.fwd, out).setY(hy);
          if (pawAt.distanceTo(L.p) < 0.1) {
            if (Math.random() < 0.35) {
              // got them between its paws: down with them, and held
              c.pinLure(rand(1.2, 2.4), m.pos.clone().addScaledVector(this.fwd, 0.16).setY(0.012));
              m.layer = null;
              this.next('pin');
              return true;
            }
            c.batLure(this.fwd.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0.7, 0)));
          }
        }
        if (u < 0.1) this.hit = false;
        if (this.t > this.dur) { m.layer = null; this.calm = rand(0.2, 0.6); this.next('watch'); }
        return true;
      }
      case 'leap': {
        // under them looking up, the rump wiggling; then straight up after them, the forepaws
        // reaching, a clap at the top; and down
        m.yaw = wrapA(m.yaw + clamp(wrapA(face - m.yaw), -2, 2) * Math.min(1, dt * 5));
        m.stop();
        if (this.t < this.dur) {
          m.setPosture('crouch');
          const wg = Math.sin(this.t * Math.PI * 2 * 5);
          m.layer = { pose: { ...keen, hipY: 0.15, neckPitch: 0.5, headPitch: 0.15, hipYaw: 0.08 * wg }, w: Math.min(1, this.t / 0.2) };
          if (dist > 0.38 || h < 0.3) { m.layer = null; this.next('watch'); }
          return true;
        }
        const u = Math.min(1, (this.t - this.dur) / 0.6), s = Math.sin(Math.PI * u);
        const H = clamp(h - 0.32, 0.06, 0.3);
        c.hold(H * s);
        const fore = { planted: 0, frame: 0, x: 0.03 + 0.02 * (1 - s), y: 0.012 + (0.13 + H * 0.4) * Math.sin(Math.PI * Math.min(1, u * 1.2)), z: 0.1 + 0.03 * s, flex: 0.2 + 0.3 * s };
        const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.02 * s, z: -0.12 - 0.05 * s };
        m.layer = { pose: { ...keen, hipY: 0.18, chestPitch: 0.75 * s, neckPitch: 0.35 * s, headPitch: 0.1, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: -0.3 + 0.6 * s }, w: 1 };
        if (!this.hit && u > 0.45) {
          this.hit = true;
          const top = m.pos.clone().addScaledVector(this.fwd, 0.1).setY(0.3 + H);
          c.bump(top, 0.5);
          if (top.distanceTo(L.p) < 0.14) {
            if (Math.random() < 0.4) c.pinLure(rand(1.2, 2.4), m.pos.clone().addScaledVector(this.fwd, 0.16).setY(0.012));
            else c.batLure(this.fwd.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.9, 0)));
          }
        }
        if (u >= 1) {
          c.hold(null);
          c.sound('thump', 0.15);
          this.leaps++;
          m.layer = null;
          this.calm = rand(0.3, 0.8);
          this.next(L.pinned ? 'pin' : 'watch');
        }
        return true;
      }
    }
    return true;
  }

  stop(c: Ctx) {
    this.wash?.stop(c);
    c.m.layer = null;
    c.m.zoom = 0;
    c.m.lookAt(null);
    c.hold(null);
  }
}
