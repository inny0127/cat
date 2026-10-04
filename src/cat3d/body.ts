import * as THREE from 'three';
import { Kin, aim, euler, twoBone } from './kin';
import { LEGS, type Leg, type Pose } from './pose';

const v = () => new THREE.Vector3();
const q = () => new THREE.Quaternion();

interface LegRig {
  leg: Leg;
  side: 1 | -1;
  front: boolean;
  girdle: number;     // chest or hips
  root: number;       // scapula (front) or thigh (hind): where the limb hangs from
  b: [number, number, number, number];   // upper, lower, cannon, toes
  len: [number, number, number];
  restDir: THREE.Vector3[];
  restSide: THREE.Vector3;
  scapRest?: THREE.Vector3;   // scapula -> shoulder joint, rest
  scapOffset?: THREE.Vector3; // scapula from its parent, rest
  lastCannon: THREE.Vector3;  // pantograph warm start
}

/**
 * Turns a Pose into bone rotations: trunk by forward kinematics, gaze distributed down the
 * neck, legs by IK onto paw targets (with the hind cannon kept parallel to the thigh, as in real
 * cats), plus ears and jaw. The tail is driven separately (tail.ts) from the result.
 */
export class Body {
  readonly kin: Kin;
  readonly I: Record<string, number>;
  readonly legs: Record<Leg, LegRig>;
  /** pose foot target of each leg this frame, model space (the stepper's "home") */
  readonly home: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };
  /** where each paw actually ended up */
  readonly reached: Record<Leg, THREE.Vector3> = { LF: v(), RF: v(), LH: v(), RH: v() };

  private readonly t = { a: v(), b: v(), c: v(), d: v(), e: v(), f: v(), g: v(), q1: q(), q2: q(), q3: q(), q4: q() };
  private readonly m = new THREE.Matrix4();

  constructor(kin: Kin) {
    this.kin = kin;
    const I: Record<string, number> = {};
    for (const n of kin.names) I[n] = kin.i(n);
    this.I = I;
    const mk = (leg: Leg): LegRig => {
      const s = leg[0] as 'L' | 'R';
      const front = leg[1] === 'F';
      const b = (front ? ['arm', 'fore', 'wrist', 'hand'] : ['thigh', 'shin', 'hock', 'foot']).map((n) => I[n + s]) as LegRig['b'];
      const R = kin.rest;
      const restDir = [
        R[b[1]].clone().sub(R[b[0]]).normalize(),
        R[b[2]].clone().sub(R[b[1]]).normalize(),
        R[b[3]].clone().sub(R[b[2]]).normalize(),
        new THREE.Vector3(0, 0, 1),
      ];
      const chain = R[b[2]].clone().sub(R[b[0]]);
      const bend = R[b[1]].clone().sub(R[b[0]]);
      bend.addScaledVector(chain, -bend.dot(chain) / chain.lengthSq());
      const restSide = new THREE.Vector3().crossVectors(chain, bend).normalize();
      const rig: LegRig = {
        leg, side: s === 'L' ? 1 : -1, front,
        girdle: front ? I.chest : I.hips,
        root: front ? I['scap' + s] : I['thigh' + s],
        b,
        len: [R[b[0]].distanceTo(R[b[1]]), R[b[1]].distanceTo(R[b[2]]), R[b[2]].distanceTo(R[b[3]])],
        restDir, restSide,
        lastCannon: restDir[2].clone(),
      };
      if (front) {
        rig.scapRest = R[b[0]].clone().sub(R[I['scap' + s]]);
        rig.scapOffset = kin.offset[I['scap' + s]].clone();
      }
      return rig;
    };
    this.legs = { LF: mk('LF'), RF: mk('RF'), LH: mk('LH'), RH: mk('RH') };
  }

  /** hips, spine, neck and head from the pose */
  trunk(p: Pose) {
    const { kin, I } = this;
    const Q = this.t.q1;
    kin.setLocal(I.root, Q.identity());
    kin.offset[I.hips].set(0, p.hipY, p.hipZ).sub(kin.offset[I.root]);
    kin.setLocal(I.hips, euler(p.hipPitch, p.hipYaw, p.hipRoll, Q));
    // the lumbar bend sits mostly behind spine2, the thoracic bend is shared by spine2 and the chest
    kin.setLocal(I.spine1, euler(p.lumbarPitch * 0.6, p.lumbarYaw * 0.6, 0, Q));
    kin.setLocal(I.spine2, euler(p.lumbarPitch * 0.4 + p.chestPitch * 0.35, p.lumbarYaw * 0.4 + p.chestYaw * 0.35, p.chestRoll * 0.3, Q));
    kin.setLocal(I.chest, euler(p.chestPitch * 0.65, p.chestYaw * 0.65, p.chestRoll * 0.7, Q));
    euler(p.neckPitch / 2, p.neckYaw / 2, 0, Q);
    kin.setLocal(I.neck1, Q);
    kin.setLocal(I.neck2, Q);
    kin.setLocal(I.head, euler(p.headPitch, p.headYaw, p.headRoll, Q));
    kin.fkAll();
  }

  /**
   * How far the trunk must rise so the pelvis, belly, chest and chin all stay on or above the
   * floor (with the fur squashed a little). Sampled round the body's cross-sections.
   */
  floorLift() {
    const { kin, I } = this;
    let lowest = Infinity;
    const P = this.t.a;
    const ring = (bone: number, cx: number, cy: number, cz: number, rx: number, ry: number) => {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        P.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cz).applyQuaternion(kin.wq[bone]).add(kin.wp[bone]);
        if (P.y < lowest) lowest = P.y;
      }
    };
    ring(I.hips, 0, -0.008, -0.03, 0.046, 0.05);
    ring(I.hips, 0, -0.008, 0.0, 0.05, 0.054);
    ring(I.spine2, 0, -0.022, 0, 0.05, 0.06);
    ring(I.chest, 0, -0.030, 0.008, 0.048, 0.066);
    ring(I.head, 0, -0.02, 0.03, 0.03, 0.03);
    return Math.max(0, 0.006 - lowest);
  }

  /** how far each shoulder blade rides up this frame (m; the stride's doing) */
  readonly scapLift = { L: 0, R: 0 };

  /** the point between the eyes from the head joint, at rest (the cat sets it from its model) */
  readonly eyeOffset = new THREE.Vector3(0, 0.015, 0.052);

  /** where the eyes are, model space */
  eyes(out: THREE.Vector3) {
    const { kin, I } = this;
    return out.copy(this.eyeOffset).applyQuaternion(kin.wq[I.head]).add(kin.wp[I.head]);
  }

  /**
   * Turn the head to look at a model-space point, sharing the turn down the neck. `weight` 0..1.
   * Yaw is limited to what a cat can do without moving its shoulders.
   */
  look(target: THREE.Vector3, weight: number, roll = 0) {
    if (weight <= 0.001) return;
    const { kin, I } = this;
    // each joint takes a share of what is left of the turn and the head finishes it. The neck
    // carries much of a turn to the side, but looking up or down is mostly the head's own work,
    // so a cat lying low keeps its neck low while it looks up at you.
    const chain: [number, number, number][] = [[I.neck1, 0.34, 0.12], [I.neck2, 0.5, 0.25], [I.head, 1, 1]];
    const eye = this.t.a, D = this.t.b, up = this.t.c, x = this.t.d;
    const Qt = this.t.q1, Qh = this.t.q2, Dq = this.t.q3;
    // (which way the chest faces, from its side-to-side axis: the forward one points up as the cat
    // sits up, and tipped past upright on the way down to a sit it would read as facing the other
    // way, and turn the head right round with it)
    const chestRight = this.t.e.set(1, 0, 0).applyQuaternion(kin.wq[I.chest]);
    const chestYaw = Math.atan2(-chestRight.z, chestRight.x);
    const F = this.lookF;
    for (const [b, fy, fp] of chain) {
      this.eyes(eye);
      D.copy(target).sub(eye);
      if (D.lengthSq() < 1e-8) return;
      D.normalize();
      // a cat turns its head about so far before it would have to turn its body
      let yaw = Math.atan2(D.x, D.z) - chestYaw;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      yaw = Math.max(-1.5, Math.min(1.5, yaw)) + chestYaw;
      const pitch = Math.max(-0.9, Math.min(0.9, Math.asin(Math.max(-1, Math.min(1, D.y)))));
      // this joint's share of the yaw and of the pitch, from where the head points now
      F.set(0, 0, 1).applyQuaternion(kin.wq[I.head]);
      const yawC = Math.atan2(F.x, F.z), pitchC = Math.asin(Math.max(-1, Math.min(1, F.y)));
      const dy = Math.atan2(Math.sin(yaw - yawC), Math.cos(yaw - yawC));
      const yj = yawC + dy * fy, pj = pitchC + (pitch - pitchC) * fp;
      D.set(Math.sin(yj) * Math.cos(pj), Math.sin(pj), Math.cos(yj) * Math.cos(pj));
      // looking along D with the eyes level (cats keep their head upright), plus any deliberate tilt
      up.set(0, 1, 0).addScaledVector(D, -D.y).normalize();
      x.crossVectors(up, D).normalize();
      this.m.makeBasis(x, up, D);
      Qt.setFromRotationMatrix(this.m);
      if (roll) Qt.multiply(Dq.setFromAxisAngle(AZ, roll));
      Qh.copy(kin.wq[I.head]);
      this.t.q4.copy(Qt);
      Qt.copy(Qh).slerp(this.t.q4, weight);
      // the turn this joint makes, applied in the world frame
      Dq.copy(Qt).multiply(Qh.invert());
      kin.setWorld(b, this.t.q4.copy(Dq).multiply(kin.wq[b]));
      kin.fkAll();
    }
  }
  private readonly lookF = new THREE.Vector3();


  /**
   * How far the hips and the shoulders must come down for every leg that is on the floor (or
   * about to land: `weight` 0..1 per leg) to reach its paw without locking straight. A walking
   * cat sinks a little between its legs as they spread; this is that, from the legs themselves.
   * Paw targets in model space; returns metres of drop at the hips and at the shoulders.
   */
  reachDrop(target: Record<Leg, THREE.Vector3>, weight: Record<Leg, number>, out: { hind: number; front: number }) {
    out.hind = 0;
    out.front = 0;
    for (const leg of LEGS) {
      const w = weight[leg];
      if (w <= 0) continue;
      const L = this.legs[leg];
      const J = this.kin.wp[L.b[0]];
      const T = target[leg];
      // front: the shoulder blade's lift rides on top; the leg may open almost straight. Hind:
      // the hock keeps an angle (the cannon stays near parallel to the thigh)
      const lift = L.front ? (L.side > 0 ? this.scapLift.L : this.scapLift.R) : 0;
      const reach = (L.len[0] + L.len[1] + L.len[2]) * (L.front ? 0.95 : 0.9);
      const hd = Math.hypot(T.x - J.x, T.z - J.z);
      const dv = Math.sqrt(Math.max(0, reach * reach - hd * hd));
      const drop = Math.min(0.03, Math.max(0, J.y + lift - T.y - dv)) * w;
      if (L.front) out.front = Math.max(out.front, drop);
      else out.hind = Math.max(out.hind, drop);
    }
    return out;
  }

  /** foot target of a pose for one leg, model space (needs the trunk solved) */
  footTarget(p: Pose, leg: Leg, out: THREE.Vector3) {
    const L = this.legs[leg];
    const f = p[leg];
    const kin = this.kin;
    // on the floor in the model frame
    const a = this.t.d.set(f.x * L.side, f.y, f.z);
    if (f.frame > 0.001) {
      // relative to the limb's root joint, in the girdle's frame
      const b = this.t.e.set(f.x * L.side, f.y, f.z).applyQuaternion(kin.wq[L.girdle]).add(kin.wp[L.b[0]]);
      a.lerp(b, f.frame);
    }
    return out.copy(a);
  }

  /**
   * Solve all four legs onto model-space paw targets. `flex` folds the wrist/ankle (swing, tuck);
   * `ground` 1 means the paw is on the floor (aligned to it) rather than held by the body.
   */
  legsTo(p: Pose, target: Record<Leg, THREE.Vector3>, flex: Record<Leg, number>, ground: Record<Leg, number>) {
    for (const leg of LEGS) {
      const L = this.legs[leg];
      if (L.front) this.front(L, p, target[leg], flex[leg], ground[leg]);
      else this.hind(L, p, target[leg], flex[leg], ground[leg]);
    }
  }

  /**
   * Which way the middle joint bends: square to the limb in the girdle's side-to-side plane,
   * forward for knees (dir = 1), back for elbows (dir = -1), and a touch outward. Measured from
   * the limb itself, so the knee stays in front however far the paw is tucked or reached.
   */
  private bendPole(L: LegRig, root: THREE.Vector3, end: THREE.Vector3, girdleQ: THREE.Quaternion, dir: number, out: THREE.Vector3, splay = 0.12) {
    const X = this.sc.axis.set(1, 0, 0).applyQuaternion(girdleQ);
    const chain = this.sc.chain.copy(end).sub(root).normalize();
    out.crossVectors(chain, X).multiplyScalar(dir);
    const n = out.length();
    if (n < 0.35) {
      // limb pointing sideways: fall back on the girdle's own forward/back
      const fb = this.sc.bend.set(0, -0.2, dir).applyQuaternion(girdleQ);
      out.lerp(fb, 1 - n / 0.35);
    }
    return out.normalize().addScaledVector(X, L.side * splay).normalize();
  }

  private readonly sc = { chain: v(), bend: v(), fem: v(), axis: v(), d: v(), side: v() };

  private sideOf(rootP: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, pole: THREE.Vector3, out: THREE.Vector3) {
    const chain = this.sc.chain.copy(end).sub(rootP);
    const bend = this.sc.bend.copy(mid).sub(rootP);
    bend.addScaledVector(chain, -bend.dot(chain) / Math.max(chain.lengthSq(), 1e-12));
    if (bend.lengthSq() < 1e-10) bend.copy(pole).addScaledVector(chain, -pole.dot(chain) / Math.max(chain.lengthSq(), 1e-12));
    return out.crossVectors(chain, bend).normalize();
  }

  private front(L: LegRig, p: Pose, T: THREE.Vector3, flex: number, ground: number) {
    const { kin } = this;
    const girdleQ = kin.wq[L.girdle];
    // the shoulder blade swings a little toward where the paw is going
    const scapP = kin.wp[L.root];
    const toT = this.t.a.copy(T).sub(scapP).applyQuaternion(this.t.q2.copy(girdleQ).invert());
    const r = L.scapRest!;
    const swing = Math.atan2(toT.z, -toT.y) - Math.atan2(r.z, -r.y);
    kin.setLocal(L.root, this.t.q1.setFromAxisAngle(AX, -Math.max(-0.5, Math.min(0.5, swing * 0.35))));
    // and rides up between the ribs as its leg takes the weight
    kin.offset[L.root].copy(L.scapOffset!).addScaledVector(UP, L.side > 0 ? this.scapLift.L : this.scapLift.R);
    kin.fk(L.root);
    kin.fk(L.b[0]);
    const S = kin.wp[L.b[0]];
    // pastern: from straight down, toes forward by `pastern`, folded back by flex
    const ang = p.pastern - flex * 2.0;
    const M = this.t.b.set(0, -Math.cos(ang), Math.sin(ang));
    const Mg = this.t.c.copy(M).applyQuaternion(girdleQ);
    M.lerp(Mg, 1 - ground).normalize();
    const W = this.t.d.copy(T).addScaledVector(M, -L.len[2]);
    const pole = this.bendPole(L, S, W, girdleQ, -1, this.t.e);
    const E = this.t.f, W2 = this.t.g;
    twoBone(S, L.len[0], L.len[1], W, pole, E, W2);
    const side = this.sideOf(S, E, W2, pole, this.sc.side);
    const d = this.sc.d;
    kin.setWorld(L.b[0], aim(L.restDir[0], L.restSide, d.copy(E).sub(S), side, this.t.q1));
    kin.setWorld(L.b[1], aim(L.restDir[1], L.restSide, d.copy(W2).sub(E), side, this.t.q1));
    kin.setWorld(L.b[2], aim(L.restDir[2], L.restSide, M, side, this.t.q1));
    kin.fk(L.b[3]);
    // paw: flat along the floor; the toes hang a little as the wrist folds, and lift as they
    // reach to land
    const paw = this.pawDir(girdleQ, ground, flex > 0 ? flex * 0.45 : flex * 0.6, side, d);
    kin.setWorld(L.b[3], aim(L.restDir[3], L.restSide, paw, side, this.t.q1));
    this.reached[L.leg].copy(kin.wp[L.b[3]]);
  }

  private hind(L: LegRig, p: Pose, T: THREE.Vector3, flex: number, ground: number) {
    const { kin } = this;
    const girdleQ = kin.wq[L.girdle];
    const Hp = kin.wp[L.b[0]];
    const pole = this.t.e;
    // (sitting or lying on the haunches, the knees turn out, the thighs filling out beside the
    // body as a sitting cat's do; standing, they point ahead)
    const splay = 0.12 + 0.35 * p.hindFlat;
    // cannon lying along the floor (sitting) or held by the girdle
    const flat = this.t.a.set(0, -0.06, 1);
    const flatG = this.t.c.copy(flat).applyQuaternion(girdleQ);
    flat.lerp(flatG, 1 - ground).normalize();
    const M = this.t.b.copy(L.lastCannon);
    const K = this.t.f, Hk2 = this.t.g, Hk = this.t.d;
    for (let it = 0; it < 4; it++) {
      Hk.copy(T).addScaledVector(M, -L.len[2]);
      this.bendPole(L, Hp, Hk, girdleQ, 1, pole, splay);
      twoBone(Hp, L.len[0], L.len[1], Hk, pole, K, Hk2);
      // pantograph: cannon parallel to the thigh
      const fem = this.sc.fem.copy(K).sub(Hp).normalize();
      M.copy(fem).lerp(flat, p.hindFlat).normalize();
      if (flex > 0) {
        // the hock folds as the paw lifts: cannon swings back under the leg
        const axis = this.sc.axis.set(1, 0, 0).applyQuaternion(girdleQ);
        M.applyAxisAngle(axis, flex * 0.9);
      }
    }
    Hk.copy(T).addScaledVector(M, -L.len[2]);
    this.bendPole(L, Hp, Hk, girdleQ, 1, pole, splay);
    twoBone(Hp, L.len[0], L.len[1], Hk, pole, K, Hk2);
    L.lastCannon.copy(M);
    const side = this.sideOf(Hp, K, Hk2, pole, this.sc.side);
    const d = this.sc.d;
    kin.setWorld(L.b[0], aim(L.restDir[0], L.restSide, d.copy(K).sub(Hp), side, this.t.q1));
    kin.setWorld(L.b[1], aim(L.restDir[1], L.restSide, d.copy(Hk2).sub(K), side, this.t.q1));
    kin.setWorld(L.b[2], aim(L.restDir[2], L.restSide, M, side, this.t.q1));
    kin.fk(L.b[3]);
    const paw = this.pawDir(girdleQ, ground, flex > 0 ? flex * 0.5 : flex * 0.5, side, d);
    kin.setWorld(L.b[3], aim(L.restDir[3], L.restSide, paw, side, this.t.q1));
    this.reached[L.leg].copy(kin.wp[L.b[3]]);
  }

  /** a paw's forward direction: along the floor when standing, with the body otherwise; curled by `curl` */
  private pawDir(girdleQ: THREE.Quaternion, ground: number, curl: number, side: THREE.Vector3, out: THREE.Vector3) {
    // heading on the floor: the girdle's forward with pitch and roll removed
    const g = this.t.a.set(0, 0, 1).applyQuaternion(girdleQ);
    const floor = new THREE.Vector3(g.x, 0, g.z);
    if (floor.lengthSq() < 1e-6) floor.set(0, 0, 1);
    floor.normalize();
    out.copy(floor).lerp(g, 1 - ground).normalize();
    if (curl > 0) out.applyAxisAngle(side, curl);
    return out;
  }

  /** ears and jaw from the pose (plus twitches) */
  face(p: Pose, twitch: { L: number; R: number; swivelL: number; swivelR: number }) {
    const { kin, I } = this;
    for (const [s, k] of [['L', 1], ['R', -1]] as const) {
      // forward/back about the ear's own lateral axis, out to the side, then swivel
      const fwd = p.earFwd * 0.35 - p.earFlat * 0.9;
      const out = p.earOut * 0.8 + p.earFlat * 0.35;
      const sw = (s === 'L' ? twitch.swivelL : twitch.swivelR) + p.earOut * 0.5;
      const tw = s === 'L' ? twitch.L : twitch.R;
      const Q = this.t.q1.setFromAxisAngle(AY, k * sw);
      Q.multiply(this.t.q2.setFromAxisAngle(AZ, -k * out));
      Q.multiply(this.t.q3.setFromAxisAngle(AX, fwd + tw));
      kin.setLocal(I['ear' + s], Q);
    }
    kin.setLocal(I.jaw, this.t.q1.setFromAxisAngle(AX, p.jaw * 0.5));
  }
}

const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const UP = AY;
