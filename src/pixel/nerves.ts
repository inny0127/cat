import * as THREE from 'three';

/**
 * The cat's nervous system, as far as its eyes go.
 *
 * What it sees is what there is to see from where its eyes are: a wide field, most of the way
 * round to either side and blind behind; sharp in the middle and, out at the edges, good only
 * for movement; nothing behind the plant's pot or the box; and all of it a moment late, the time
 * an eye and a brain take (most of a tenth of a second). A thing that goes across its eyes too
 * fast for them (the red dot flicked across the room) is a streak: something went, but not where.
 *
 * What it does with that is up to a small network of neurons, one for each thing it can see.
 * Each is driven by what its thing is like to a cat (a thing that moves the way prey moves, a
 * thing just come into sight, a face it knows), excites itself (once its eyes are on a thing they
 * stay a while) and holds the others down (it attends to one thing at a time). What drives each
 * tires as it goes on unchanged (a thing that only sits there is soon nothing to look at) and
 * rests when it stops; a little noise keeps it from being a machine. The neuron firing hardest,
 * if any fires hard enough, is the thing it attends to: its eyes go to it in quick jumps, the
 * head following, and between the jumps follow it, slowly and a little behind. Where it believes
 * the thing is, is what it goes after: where it last saw it, carried on the way it was going for
 * a moment, and less and less sure the longer it is out of sight. Prey in its attention builds a
 * drive to hunt; slowly, and slowly gone again.
 */

/** what sort of thing it is, to a cat */
export type Kind = 'dot' | 'toy' | 'bug' | 'bird' | 'hand' | 'you' | 'glint' | 'spot';

/** something in the room it might see, as the room has it this frame (world) */
export interface Thing {
  id: string;
  kind: Kind;
  p: THREE.Vector3;
  /** seen whatever the way it faces (the dot on its own coat: it feels it as much as sees it) */
  felt?: boolean;
}

/** an upright thing standing on the floor, that hides what is behind it: its middle on the floor,
 *  its radius, its height */
export interface Blocker {
  c: THREE.Vector3;
  r: number;
  h: number;
}

/** how much each kind of thing is worth a look in itself, and how much it is like prey */
const KIND: Record<Kind, { look: number; prey: number }> = {
  dot: { look: 0.5, prey: 1 },
  toy: { look: 0.22, prey: 0.7 },
  bug: { look: 0.45, prey: 0.85 },
  bird: { look: 0.6, prey: 0.9 },
  hand: { look: 0.5, prey: 0.3 },
  you: { look: 0.38, prey: 0 },
  glint: { look: 0.3, prey: 0.5 },
  /** a place it knows: the window, its bowl */
  spot: { look: 0.14, prey: 0 },
};

/** the eye and the brain: how late what it sees is (s) */
export const LATENCY = 0.09;
/** frames of a thing's whereabouts kept (enough for the lateness at any frame rate a phone runs) */
const HIST = 32;

const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** one thing as the cat has it: what its eyes make of it, where it believes it is, and the neuron */
export class Unit {
  kind: Kind;
  /** where it really was, a moment back (for the eye's lateness): a ring of the last few frames */
  private readonly hist = Array.from({ length: HIST }, () => ({ t: -1e9, p: new THREE.Vector3() }));
  private head = -1;
  private count = 0;
  /** where it is seen to be (late) */
  readonly seen = new THREE.Vector3();
  /** where it is believed to be, and the way it was last seen going (m/s) */
  readonly belief = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** how sure of where it is (0..1) */
  conf = 0;
  /** how well it is seen just now (0..1): in the field, not hidden, sharp enough */
  vis = 0;
  /** how fast it goes across the eye (rad/s), and what the motion detectors make of that (0..1);
   *  too fast for the eye to resolve (0..1) */
  sweep = 0;
  motion = 0;
  blur = 0;
  /** just come into sight (0..1, fading) */
  onset = 0;
  /** how tired its input is (0..1) */
  hab = 0;
  /** the neuron: what it has taken in, and how hard it fires (0..1); and its own slow wandering
   *  (a brain is never quite still: now and then this is what tips a glance at a thing) */
  u = 0;
  a = 0;
  wander = 0;
  /** in the room this frame */
  here = false;
  felt = false;
  /** heard, or sensed some other way than seen (a click, a sudden light): drives the neuron
   *  wherever the thing is, fading */
  cue = 0;
  private readonly dir = new THREE.Vector3();
  private readonly prevSeen = new THREE.Vector3();
  private readonly flow = new THREE.Vector3();
  private haveDir = false;
  private readonly lastSeen = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private haveSeen = false;

  constructor(readonly id: string, kind: Kind) {
    this.kind = kind;
  }

  /** where it was at time t (s), from the record (the oldest, if t is earlier; the latest, if
   *  later) */
  at(t: number, out: THREE.Vector3) {
    const h = this.hist, n = this.count;
    if (!n) return null;
    let b = h[this.head];
    if (t >= b.t) return out.copy(b.p);
    for (let i = 1; i < n; i++) {
      const a = h[(this.head - i + HIST) % HIST];
      if (a.t <= t) return out.copy(a.p).lerp(b.p, b.t > a.t ? (t - a.t) / (b.t - a.t) : 1);
      b = a;
    }
    return out.copy(b.p);
  }

  record(t: number, p: THREE.Vector3) {
    if (this.count && t - this.hist[this.head].t < 1e-4) { this.hist[this.head].p.copy(p); return; }
    this.head = (this.head + 1) % HIST;
    const e = this.hist[this.head];
    e.t = t;
    e.p.copy(p);
    this.count = Math.min(HIST, this.count + 1);
  }

  /** forget where it was (gone from the room, or teleported) */
  clear() {
    this.count = 0;
    this.haveDir = false;
    this.haveSeen = false;
  }

  /** the eye's work: how well it is seen, how fast it goes across the eye (from where the eyes
   *  are, late) */
  look(t: number, dt: number, eye: THREE.Vector3, vis: number, tmp: THREE.Vector3) {
    if (!this.at(t - LATENCY, this.seen)) { this.vis = 0; return; }
    // (how fast the thing itself goes across the line of sight: the cat's own movement it allows
    // for, as eyes and brains do; and nothing seems to go faster than it would a hand's breadth
    // off, however close under the nose it is)
    const d = tmp.copy(this.seen).sub(eye);
    const dist = Math.max(0.25, d.length());
    d.normalize();
    // (a tremble from frame to frame is not movement: the motion detectors take its way and speed
    // over a few hundredths of a second)
    let sweep = 0;
    if (this.haveDir && dt > 0) {
      const v = this.dir.copy(this.seen).sub(this.prevSeen).divideScalar(dt);
      this.flow.lerp(v, 1 - Math.exp(-dt / 0.05));
      v.copy(this.flow).addScaledVector(d, -this.flow.dot(d));
      sweep = v.length() / dist;
    }
    this.prevSeen.copy(this.seen);
    this.haveDir = true;
    this.sweep = Math.min(sweep, 30);
    // (a few degrees a second is enough to catch the eye; past a couple of hundred, a blur)
    this.motion = ss(0.04, 0.7, this.sweep);
    this.blur = ss(3, 6.5, this.sweep);
    const was = this.vis;
    this.vis = vis;
    // (a thing come into sight, faint in the corner of the eye though it may be, draws a glance)
    const rise = Math.max(0, vis - was);
    this.onset = Math.max(this.onset * Math.exp(-dt / 0.35), was < 0.3 ? 1.4 * Math.sqrt(rise) : 0.6 * rise);
  }

  /** where it is believed to be: pulled to where it is seen, as well as it is seen; out of sight,
   *  carried on the way it went, a moment, and less and less sure */
  believe(dt: number) {
    const sure = this.vis * (1 - this.blur);
    if (sure > 0.2) {
      if (!this.haveSeen || this.conf < 0.05) this.belief.copy(this.seen);
      const k = 1 - Math.exp(-dt * 30 * sure);
      if (this.haveSeen && dt > 0) {
        const v = this.step.copy(this.seen).sub(this.lastSeen).divideScalar(dt);
        if (v.length() > 6) v.setLength(6);
        this.vel.lerp(v, 1 - Math.exp(-dt / 0.12));
      }
      this.belief.lerp(this.seen, k);
      this.lastSeen.copy(this.seen);
      this.haveSeen = true;
      const c = Math.min(1, sure * 1.3);
      this.conf += (c - this.conf) * (1 - Math.exp(-dt * (c > this.conf ? 8 : 14)));
    } else {
      this.belief.addScaledVector(this.vel, dt);
      this.vel.multiplyScalar(Math.exp(-dt * 5));
      // (a streak across the eye: something went, so the old place is no good either; it is
      // somewhere about where the streak is, no more than that)
      if (this.vis > 0.15) this.belief.lerp(this.seen, 1 - Math.exp(-dt * 6 * this.vis));
      this.conf *= Math.exp(-dt * (this.vis > 0.15 ? 10 : 0.7));
      this.haveSeen = false;
    }
  }
}

export class Nerves {
  readonly units = new Map<string, Unit>();
  /** what it attends to (null: nothing in particular) */
  attending: Unit | null = null;
  /** the drive to hunt, built by prey in its attention (0..1) */
  hunt = 0;
  /** where its eyes are, and the way they point (world); the point they rest on */
  readonly eye = new THREE.Vector3();
  readonly gaze = new THREE.Vector3(0, 0, 1);
  readonly gazePoint = new THREE.Vector3();
  /** a jump of the eyes under way (s left), and the time since the last */
  private sacc = 0;
  private since = 1;
  /** how far the eyes went in a jump, if one ended this step (rad; 0: none); and so far, in the
   *  one under way */
  jump = 0;
  private jumped = 0;
  /** an act's interest in a thing: added to what drives its neuron (top-down: after the dot, the
   *  dot is what it watches) */
  readonly bias = new Map<string, number>();
  /** 0 asleep (it sees nothing) .. 1 wide awake; how much it is in the mood for play (prey counts
   *  for more); how fond of you it is (you count for more) */
  awake = 1;
  playful = 0.6;
  fond = 0.5;
  /** what it can see of the room: upright things that hide what is behind them */
  blockers: () => readonly Blocker[] = () => [];
  time = 0;
  private readonly t = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
  /** a small steady noise in each neuron (deterministic per unit, for tests) */
  private rng = 1;

  private noise() {
    this.rng = (this.rng * 16807) % 2147483647;
    return this.rng / 2147483647 - 0.5;
  }

  unit(id: string) {
    return this.units.get(id) ?? null;
  }

  /** is it attending to this thing (and how hard) */
  on(id: string) {
    return this.attending?.id === id ? this.attending.a : 0;
  }

  /** a thing gone from its mind altogether (a place it had a mind to go to, and has gone, or not) */
  forget(id: string) {
    if (this.attending?.id === id) this.attending = null;
    this.units.delete(id);
  }

  /**
   * One step: things as the room has them, the eyes where the rig has them, the head facing
   * `yaw` (world) and pitched `pitch` (rad, up +).
   */
  update(dt: number, eye: THREE.Vector3, yaw: number, pitch: number, things: readonly Thing[]) {
    this.time += dt;
    const now = this.time;
    this.eye.copy(eye);
    for (const u of this.units.values()) u.here = false;
    for (const th of things) {
      let u = this.units.get(th.id);
      if (!u) { u = new Unit(th.id, th.kind); this.units.set(th.id, u); }
      u.kind = th.kind;
      u.here = true;
      u.felt = !!th.felt;
      u.record(now, th.p);
    }
    const blockers = this.blockers();
    const tmp = this.t.a;
    // the eye
    for (const u of this.units.values()) {
      if (!u.here) {
        u.vis = 0;
        u.onset *= Math.exp(-dt / 0.35);
        u.believe(dt);
        continue;
      }
      // (where it is to be seen, late)
      if (!u.at(now - LATENCY, tmp)) continue;
      const vis = this.awake < 0.3 ? 0 : u.felt ? 1 : this.visible(tmp, yaw, pitch, blockers) * ss(0.3, 0.7, this.awake);
      u.look(now, dt, eye, vis, this.t.b);
      u.believe(dt);
    }
    // the network: what drives each neuron, each tiring with use; then the neurons themselves
    let total = 0;
    for (const u of this.units.values()) total += u.a;
    const tau = 0.09;
    let best: Unit | null = null;
    for (const u of this.units.values()) {
      const K = KIND[u.kind];
      const look = K.look * (u.kind === 'you' || u.kind === 'hand' ? 0.55 + 0.7 * this.fond : 1);
      const lively = 0.35 + 0.65 * K.prey * (0.4 + 0.6 * this.playful);
      // (where its eyes are on it, a still thing is seen as well as a moving one; out in the corner
      // of the eye it is movement that tells, and a still thing there is hardly there)
      const sharp = ss(1.1, 0.15, this.gaze.angleTo(tmp.copy(u.seen).sub(eye).normalize()));
      const seen = u.vis * (sharp + (1 - sharp) * (0.4 + 0.6 * u.motion));
      const drive = u.here ? seen * (look + 0.95 * u.motion * lively + 1.2 * u.onset) * (1 - 0.7 * u.hab) + (this.bias.get(u.id) ?? 0) * u.vis + u.cue : 0;
      u.cue *= Math.exp(-dt / 0.45);
      // (a thing that goes on just the same tires the eye; a thing that moves stays new)
      u.hab = Math.min(1, Math.max(0, u.hab + dt * (0.09 * u.vis * (1 - u.motion) * (u === this.attending ? 1.3 : 0.6) - 0.05 * u.hab - 0.4 * u.onset * u.hab)));
      const rest = total - u.a;
      // (its wandering: a slow drift, a few seconds long, about nothing in particular)
      u.wander += -u.wander * dt / 2.5 + 0.16 * Math.sqrt(2 * dt / 2.5) * (this.noise() + this.noise()) * 1.7;
      const input = drive + (u.vis > 0.2 ? u.wander : 0) + 0.32 * u.a - 0.62 * rest + 0.05 * this.noise();
      u.u += (input - u.u) * Math.min(1, dt / tau);
      u.a = 1 / (1 + Math.exp(-(u.u - 0.42) * 10));
      if (!u.here && u.conf < 0.05) u.a *= Math.exp(-dt * 6);
      if (!best || u.a > best.a) best = u;
    }
    // (attending to a thing is firing hard for it; and the one it attends to keeps that till
    // another fires clearly harder)
    const cur = this.attending;
    if (best && best.a > 0.5 && (!cur || best === cur || best.a > cur.a + 0.08 || cur.a < 0.35)) this.attending = best;
    else if (cur && cur.a < 0.3) this.attending = null;
    // the drive to hunt
    let prey = 0;
    for (const u of this.units.values()) prey += u.a * KIND[u.kind].prey * (0.35 + 0.65 * u.motion) * Math.max(u.vis, u.conf * 0.5);
    const want = Math.min(1, prey * (0.4 + 0.8 * this.playful));
    this.hunt += (want - this.hunt) * (1 - Math.exp(-dt / (want > this.hunt ? 0.5 : 3)));
    this.aim(dt);
  }

  /** how well a point is seen from the eyes, the head facing `yaw` and pitched `pitch` */
  visible(p: THREE.Vector3, yaw: number, pitch: number, blockers: readonly Blocker[]) {
    const e = this.eye;
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    const flat = Math.hypot(dx, dz);
    const az = Math.abs(wrap(Math.atan2(dx, dz) - yaw));
    const el = Math.atan2(dy, flat) - pitch;
    // (some two hundred degrees across, sharp only in the middle; the head tips up and down for
    // the rest)
    let v = ss(1.9, 1.3, az) * ss(1.35, 0.95, Math.abs(el));
    if (v <= 0) return 0;
    for (const B of blockers) {
      // (the line of sight crossing the thing's footprint below its top)
      const bx = B.c.x - e.x, bz = B.c.z - e.z;
      const t = Math.max(0, Math.min(1, (bx * dx + bz * dz) / Math.max(flat * flat, 1e-6)));
      // (the thing itself on it, or in front of it: not hidden by it)
      if (t > 0.97 || Math.hypot(p.x - B.c.x, p.z - B.c.z) < B.r) continue;
      const cx = e.x + dx * t - B.c.x, cz = e.z + dz * t - B.c.z;
      const miss = Math.hypot(cx, cz) - B.r;
      if (miss >= 0.02) continue;
      const y = e.y + dy * t;
      if (y >= B.h + 0.01) continue;
      v *= ss(-0.02, 0.02, miss) * 0.85 + ss(B.h - 0.03, B.h + 0.01, y) * 0.15;
    }
    return v;
  }

  /**
   * The eyes: on what it attends to, by jumps (a few hundredths of a second each) when it is well
   * off where they are, and between, a slow pursuit that lags a quick thing; the head is the
   * motor's, after the eyes.
   */
  private aim(dt: number) {
    this.since += dt;
    this.jump = 0;
    const A = this.attending;
    if (!A) { this.sacc = 0; this.jumped = 0; return; }
    // (unsure where it is but seeing it go, the eyes go after the movement itself)
    const to = this.t.c.copy(A.conf < 0.4 && A.vis > 0.15 ? A.seen : A.belief).sub(this.eye);
    const dist = Math.max(0.05, to.length());
    to.divideScalar(dist);
    const err = this.gaze.angleTo(to);
    if (this.sacc > 0) {
      this.sacc -= dt;
      this.jumped += this.turn(to, err * (1 - Math.exp(-dt / 0.025)));
      if (this.sacc <= 0) { this.jump = this.jumped; this.jumped = 0; }
    } else if (err > 0.17 && this.since > 0.14) {
      // a jump
      this.sacc = 0.08;
      this.since = 0;
      this.jumped = this.turn(to, err * (1 - Math.exp(-dt / 0.025)));
    } else {
      // following: about as fast as it goes, a little behind, and never very fast
      this.turn(to, Math.min(err, (0.85 * A.sweep + 2.2 * err) * dt, 1.6 * dt));
    }
    // (never nearer than a hand's breadth: the eyes would cross on a thing under the chin)
    this.gazePoint.copy(this.eye).addScaledVector(this.gaze, Math.max(0.2, dist));
  }

  /** the eyes turned toward a way, so far (rad): how far they went */
  private turn(to: THREE.Vector3, by: number) {
    if (by <= 1e-6) return 0;
    const axis = this.t.b.crossVectors(this.gaze, to);
    const s = axis.length();
    if (s < 1e-6) { const a = this.gaze.angleTo(to); this.gaze.copy(to); return a; }
    this.gaze.applyAxisAngle(axis.divideScalar(s), by).normalize();
    return by;
  }

  /**
   * A thing sensed other than by sight: the click of the laser pointer, a thump, a light come on.
   * It draws the attention whether or not it is in view, and gives a rough idea where it is (as
   * a sound does), till the eyes find it.
   */
  cue(id: string, k: number) {
    const u = this.units.get(id);
    if (!u || this.awake < 0.3) return;
    u.cue = Math.max(u.cue, k);
    if (u.conf < 0.3 && u.at(this.time, this.t.a)) {
      u.belief.copy(this.t.a);
      u.vel.set(0, 0, 0);
      u.conf = 0.3;
    }
  }

  /** look straight at a point at once (opening the app, waking) */
  fix(p: THREE.Vector3) {
    this.gaze.copy(p).sub(this.eye).normalize();
    this.gazePoint.copy(p);
  }
}
