import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import type { LivingRoom, Top } from './set';
import { KINDS, type Prop, type Props } from './props';

const smooth = (u: number) => u * u * (3 - 2 * u);
const ease = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** what it is told to do: go to a point (on a top, or the floor), or at a thing */
export type Goal = { to: THREE.Vector3; top: Top | null } | { prop: Prop };

type Step =
  | { k: 'walk'; to: THREE.Vector3 }
  | { k: 'jump'; from: THREE.Vector3; to: THREE.Vector3; top: Top | null }
  | { k: 'swat'; prop: Prop };

/** how high it can spring up from the floor, and from one top to another (up, and across) */
const UP_FLOOR = 0.72;
const UP_TOP = 0.55;
const GAP_TOP = 0.4;

/**
 * The cat, as you would have it: told where to go, it runs there (round the furniture on the
 * floor), springs up onto whatever is in the way of getting there and down again; told at a thing,
 * it gets beside it on the side away from the nearest edge and paws it, again and again, till over
 * it goes; then a look over the edge after it, and at you.
 */
export class Kitty {
  /** what it is up on (null: the floor) */
  on: Top | null = null;
  private steps: Step[] = [];
  private goal: Goal | null = null;
  private t = 0;
  private phase = '';
  private from = new THREE.Vector3();
  private side = 1;
  private hit = false;
  private swats = 0;
  private look = -1;
  private lookAt = new THREE.Vector3();
  private idle = 0;
  /** a sound to make: a name, how loud */
  sound: ((name: string, gain: number) => void) | null = null;
  /** where you are (the camera), to look at */
  you = new THREE.Vector3(0, 1, 3);

  constructor(private readonly cat: Cat3D, private readonly set: LivingRoom, private readonly props: Props) {
    const m = cat.motor;
    m.obstacles = () => (this.on ? [] : set.solids);
    m.solids = () => (this.on ? [] : set.solids);
  }

  get busy() {
    return this.steps.length > 0;
  }
  get doing() {
    return this.steps[0]?.k ?? 'idle';
  }

  /** told: go there, or at that */
  tell(goal: Goal) {
    this.goal = goal;
    this.plan();
  }

  /** where on a top (or the floor) the cat would stand, near a point */
  private inside(T: Top | null, p: THREE.Vector3, inset = 0.1) {
    if (!T) {
      const B = this.set.bounds;
      return new THREE.Vector3(clamp(p.x, B.x0, B.x1), 0, clamp(p.z, B.z0, B.z1));
    }
    const ix = Math.min(inset, (T.x1 - T.x0) / 2 - 0.001), iz = Math.min(inset, (T.z1 - T.z0) / 2 - 0.001);
    return new THREE.Vector3(clamp(p.x, T.x0 + ix, T.x1 - ix), T.h, clamp(p.z, T.z0 + iz, T.z1 - iz));
  }

  /** the way from where it is to the goal: the tops to go by, each a walk to its edge and a jump */
  private plan() {
    const G = this.goal;
    this.steps = [];
    if (!G) return;
    const target = 'prop' in G ? G.prop.on : G.top;
    const at = 'prop' in G ? G.prop.group.position : G.to;
    const route = this.route(this.on, target);
    if (!route) return;
    let cur = this.on;
    const here = this.cat.motor.pos.clone();
    for (const next of route) {
      const h = this.hop(cur, next, at, here);
      if (!h) { this.steps = []; return; }
      this.steps.push({ k: 'walk', to: h.launch });
      this.steps.push({ k: 'jump', from: h.launch, to: h.land, top: next });
      here.copy(h.land);
      cur = next;
    }
    if ('prop' in G) this.steps.push({ k: 'swat', prop: G.prop });
    else this.steps.push({ k: 'walk', to: this.inside(cur, G.to) });
    this.t = 0;
    this.phase = '';
  }

  /** the tops to go by, one after another, from one to another (null: the floor) */
  private route(a: Top | null, b: Top | null): (Top | null)[] | null {
    if (a === b) return [];
    const nodes: (Top | null)[] = [null, ...this.set.tops];
    const prev = new Map<Top | null, Top | null>();
    const seen = new Set<Top | null>([a]);
    const q: (Top | null)[] = [a];
    while (q.length) {
      const x = q.shift()!;
      if (x === b) break;
      for (const y of nodes) {
        if (seen.has(y) || !this.reaches(x, y)) continue;
        seen.add(y);
        prev.set(y, x);
        q.push(y);
      }
    }
    if (!seen.has(b)) return null;
    const out: (Top | null)[] = [];
    for (let x: Top | null = b; x !== a; x = prev.get(x) ?? null) {
      out.unshift(x);
      if (out.length > 8) return null;
    }
    return out;
  }

  /** can it get straight from one to the other */
  private reaches(a: Top | null, b: Top | null) {
    if (a === b) return false;
    const mid = (T: Top) => new THREE.Vector3((T.x0 + T.x1) / 2, 0, (T.z0 + T.z1) / 2);
    if (!a) return !!b && b.h <= UP_FLOOR && !!this.hop(null, b, mid(b), mid(b));
    if (!b) return !!this.hop(a, null, mid(a), mid(a));
    const gx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1), gz = Math.max(0, a.z0 - b.z1, b.z0 - a.z1);
    return Math.hypot(gx, gz) <= GAP_TOP && b.h - a.h <= UP_TOP;
  }

  /** is a spot on the floor free to stand on: in the room, under no top, clear of the furniture */
  private clearAt(x: number, z: number) {
    const B = this.set.bounds;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1 || this.set.topAt(x, z)) return false;
    for (const [c, r] of this.set.solids) if (Math.hypot(x - c.x, z - c.z) < r + 0.05) return false;
    return true;
  }

  /** spots on the floor just off a top's open sides (its front and its ends), each with the spot on
   *  the top beside it */
  private edges(T: Top, off: number) {
    const out: [THREE.Vector3, THREE.Vector3][] = [];
    const n = Math.max(1, Math.round((T.x1 - T.x0) / 0.05));
    for (let i = 0; i <= n; i++) {
      const x = T.x0 + 0.05 + ((T.x1 - T.x0 - 0.1) * i) / n;
      out.push([new THREE.Vector3(x, 0, T.z1 + off), this.inside(T, new THREE.Vector3(x, 0, T.z1), 0.1)]);
    }
    const m = Math.max(1, Math.round((T.z1 - T.z0) / 0.05));
    for (let i = 0; i <= m; i++) {
      const z = T.z0 + ((T.z1 - T.z0) * i) / m;
      out.push([new THREE.Vector3(T.x0 - off, 0, z), this.inside(T, new THREE.Vector3(T.x0, 0, z), 0.1)]);
      out.push([new THREE.Vector3(T.x1 + off, 0, z), this.inside(T, new THREE.Vector3(T.x1, 0, z), 0.1)]);
    }
    return out;
  }

  /** from where to spring, and where it comes down, from one to the other (on its way from a spot
   *  toward a point): up off the floor or down to it from a clear spot off the top's open side
   *  nearest the way; from top to top across the nearest bit of the gap, or (one over the other)
   *  out from under the higher. None: no way */
  private hop(a: Top | null, b: Top | null, toward: THREE.Vector3, from: THREE.Vector3) {
    const flat = (p: THREE.Vector3, q: THREE.Vector3) => Math.hypot(p.x - q.x, p.z - q.z);
    if (!a || !b) {
      const T = (a ?? b)!;
      let best: { launch: THREE.Vector3; land: THREE.Vector3 } | null = null, bestCost = Infinity;
      for (const [floor, top] of this.edges(T, a ? 0.24 : 0.2)) {
        if (!this.clearAt(floor.x, floor.z)) continue;
        const launch = a ? top : floor, land = a ? floor : top;
        const cost = flat(land, toward) + 0.6 * flat(launch, from);
        if (cost < bestCost) { bestCost = cost; best = { launch, land }; }
      }
      return best;
    }
    const lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1), zlo = Math.max(a.z0, b.z0), zhi = Math.min(a.z1, b.z1);
    const x = lo <= hi ? clamp(toward.x, lo + 0.04, hi - 0.04) : (lo + hi) / 2;
    if (lo <= hi && zlo <= zhi) {
      // (one over the other: out from under the higher one, and up; or off the higher's front, down)
      const H = a.h > b.h ? a : b;
      const under = new THREE.Vector3(x, 0, H.z1 + 0.1), over = new THREE.Vector3(x, 0, H.z1);
      return a === H
        ? { launch: this.inside(a, over, 0.08), land: this.inside(b, under, 0.08) }
        : { launch: this.inside(a, under, 0.08), land: this.inside(b, over, 0.08) };
    }
    const near = new THREE.Vector3(x, 0, (zlo + zhi) / 2);
    return { launch: this.inside(a, near, 0.08), land: this.inside(b, near, 0.1) };
  }

  update(dt: number) {
    const m = this.cat.motor;
    this.cat.perch = this.on ? this.on.h : null;
    // (up on a top, it stays on it: off it only by a jump)
    const T = this.on;
    if (T) {
      m.pos.x = clamp(m.pos.x, T.x0 + 0.03, T.x1 - 0.03);
      m.pos.z = clamp(m.pos.z, T.z0 + 0.03, T.z1 - 0.03);
    }
    this.brush();
    const s = this.steps[0];
    if (!s) return this.rest(dt);
    this.idle = 0;
    this.t += dt;
    if (s.k === 'walk') {
      if (this.phase !== 'walk') {
        this.phase = 'walk';
        m.layer = null;
        m.setPosture('stand');
        this.go(s.to, () => this.done());
      }
      return;
    }
    if (s.k === 'jump') return this.jump(s, dt);
    return this.swat(s, dt);
  }

  /** off to a spot: on the floor at a run (straight through it, on to what is next, if it is a
   *  way off), up on a top at a careful walk, slowing to stop on it */
  private go(to: THREE.Vector3, then: () => void, face: number | null = null) {
    const m = this.cat.motor;
    const far = Math.hypot(to.x - m.pos.x, to.z - m.pos.z);
    if (far < 0.03 && face === null) { m.stop(); then(); return; }
    const p = to.clone().setY(0);
    if (this.on) m.walkTo(p, clamp(far * 1.6, 0.3, 0.55), face, then, false);
    else m.walkTo(p, far > 0.6 ? 1.15 : 0.75, face, then, far > 0.35 && face === null);
  }

  private done() {
    this.steps.shift();
    this.t = 0;
    this.phase = '';
  }

  /** a spring up (or down): down on its haunches a moment, eyes on where it is going; the arc; and
   *  down on its feet there */
  private jump(s: Extract<Step, { k: 'jump' }>, dt: number) {
    const m = this.cat.motor, c = this.cat;
    const h0 = this.on?.h ?? 0, h1 = s.top?.h ?? 0, dh = h1 - h0;
    const face = Math.atan2(s.to.x - s.from.x, s.to.z - s.from.z);
    if (this.phase === '') {
      this.phase = 'gather';
      m.stop();
      this.from.copy(m.pos);
    }
    if (this.phase === 'gather') {
      m.yaw = m.yaw + clamp(wrapA(face - m.yaw), -8 * dt, 8 * dt);
      const len = dh > 0.05 ? 0.28 : 0.12;
      m.setPosture(dh > 0.05 ? 'crouch' : 'stand');
      m.layer = { pose: { neckPitch: dh > 0 ? 0.5 : -0.4, earFwd: 0.8, pupil: 0.8, hipY: dh > 0.05 ? 0.135 : 0.2, tailLift: -0.2 }, w: Math.min(1, this.t / 0.15) };
      if (this.t > len && Math.abs(wrapA(face - m.yaw)) < 0.5) {
        this.phase = 'fly';
        this.t = 0;
        this.from.copy(m.pos);
        c.liftHold = h0;
        this.on = null;
        this.sound?.('rustle', 0.08);
      }
      return;
    }
    if (this.phase === 'fly') {
      const dist = Math.hypot(s.to.x - this.from.x, s.to.z - this.from.z);
      const dur = 0.32 + 0.25 * Math.abs(dh) + 0.12 * dist;
      const u = Math.min(1, this.t / dur);
      m.pos.set(this.from.x + (s.to.x - this.from.x) * smooth(u), 0, this.from.z + (s.to.z - this.from.z) * smooth(u));
      m.yaw = face;
      const arc = 0.06 + 0.12 * Math.max(0, dh) + 0.05 * dist;
      c.liftHold = h0 + dh * smooth(Math.min(1, u * (dh > 0 ? 1.15 : 1))) + arc * Math.sin(Math.PI * u);
      const fy = 0.012 + 0.11 * Math.sin(Math.PI * Math.min(1, u / 0.75));
      const fore = { planted: 0, frame: 0, x: 0.035, y: fy, z: 0.11 + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.25)), flex: 0.3 * Math.sin(Math.PI * u) };
      const hind = { planted: 0, frame: 0, x: 0.04, y: 0.013 + 0.05 * Math.sin(Math.PI * u), z: -0.16 - 0.07 * (1 - u) * Math.sin(Math.PI * Math.min(1, u * 2)) };
      m.layer = { pose: { hipY: 0.2, chestPitch: (dh >= 0 ? 0.55 : -0.3) * Math.sin(Math.PI * Math.min(1, u * 1.3)), neckPitch: 0.2, earFwd: 0.6, LF: fore, RF: fore, LH: hind, RH: hind, tailLift: 0.4 }, w: 1 };
      if (u >= 1) {
        c.liftHold = null;
        this.on = s.top;
        c.perch = this.on ? this.on.h : null;
        m.setPosture('stand');
        this.sound?.('thump', 0.1);
        this.phase = 'land';
        this.t = 0;
      }
      return;
    }
    // (landed: a little give in the legs)
    m.layer = { pose: { hipY: 0.17 }, w: 1 - ease(this.t / 0.15) };
    if (this.t > 0.15) { m.layer = null; this.done(); }
  }

  /** at a thing: beside it on the side away from the nearest edge it can go over, sat, a paw at
   *  it, and again, till it goes */
  private swat(s: Extract<Step, { k: 'swat' }>, dt: number) {
    const m = this.cat.motor, P = s.prop, T = this.on;
    const at = P.group.position;
    // (it has gone over, or broken, or is out of reach now: done with it, a look after it)
    if (P.state === 'fall' || P.state === 'broken' || (P.on !== T && P.state !== 'down') || (P.state === 'down' && T)) {
      if (P.state === 'fall' || P.state === 'broken') this.peek(at);
      m.layer = null;
      this.done();
      return;
    }
    const dir = this.pushWay(P, T);
    if (this.phase === '' || this.phase === 'approach') {
      if (this.phase === '') {
        this.phase = 'approach';
        // (stand off it the other side from the way it is to go, a paw's reach away)
        const stand = this.inside(T, at.clone().addScaledVector(dir, -0.17), 0.06);
        m.layer = null;
        m.setPosture('stand');
        this.go(stand, () => { this.phase = 'sit'; this.t = 0; }, Math.atan2(dir.x, dir.z));
      }
      // (it walked off: after it again)
      if (this.t > 4) { this.phase = ''; this.t = 0; }
      return;
    }
    if (this.phase === 'sit') {
      m.stop();
      m.setPosture('sit');
      const face = Math.atan2(at.x - m.pos.x, at.z - m.pos.z);
      m.yaw = m.yaw + clamp(wrapA(face - m.yaw), -6 * dt, 6 * dt);
      m.lookAt(at.clone().setY((T?.h ?? 0) + 0.04), 1);
      if (this.t > 0.18) {
        // (the paw on the side the thing is to go)
        const left = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
        this.side = left.dot(dir) > 0 ? -1 : 1;
        this.phase = 'paw';
        this.t = 0;
        this.hit = false;
      }
      return;
    }
    // the paw: up and out, and across at it
    const len = 0.34;
    const u = Math.min(1, this.t / len), up = Math.sin(Math.PI * u);
    const h = clamp(KINDS[P.kind].h * 0.6, 0.04, 0.1);
    const across = 0.02 + 0.07 * up;
    const paw = { planted: 0, frame: 0, x: across, y: 0.04 + (h - 0.02) * up, z: 0.1 + 0.08 * up, flex: 0.5 * up };
    m.layer = { pose: { chestPitch: -0.95 - 0.15 * up, hipY: 0.07, neckPitch: -0.1, earFwd: 0.4, pupil: 0.85, [this.side > 0 ? 'LF' : 'RF']: paw, tailSide: 0.4 }, w: 1 };
    if (!this.hit && u > 0.5) {
      this.hit = true;
      this.swats++;
      this.props.swat(P, dir, 1.0 + 0.25 * Math.min(3, this.swats));
      this.sound?.('pencil', 0.08);
    }
    if (u >= 1) {
      // (still up there: after it, and again)
      this.phase = '';
      this.t = 0;
    }
  }

  /** what is in the way of its body as it goes along a top is shoved aside, and on (as a cat's
   *  is) */
  private brush() {
    const T = this.on, m = this.cat.motor;
    if (!T || m.speed < 0.05) return;
    const f = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
    for (const p of this.props.list) {
      if (p.on !== T || (p.state !== 'still' && p.state !== 'slide')) continue;
      const at = p.group.position;
      const u = clamp((at.x - m.pos.x) * f.x + (at.z - m.pos.z) * f.z, -0.12, 0.16);
      const nx = m.pos.x + f.x * u, nz = m.pos.z + f.z * u;
      const d = Math.hypot(at.x - nx, at.z - nz);
      if (d > KINDS[p.kind].r + 0.05) continue;
      const away = d > 1e-3 ? new THREE.Vector3((at.x - nx) / d, 0, (at.z - nz) / d) : f.clone();
      this.props.nudge(p, away.addScaledVector(f, 0.6).normalize(), 0.4 + m.speed * 0.8);
    }
  }

  /** the way a thing on a top would go off it soonest: to the nearest edge (not the wall's) */
  private pushWay(P: Prop, T: Top | null) {
    const at = P.group.position;
    if (!T) {
      const d = at.clone().sub(this.cat.motor.pos).setY(0);
      return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(0, 0, 1);
    }
    const opts: [number, THREE.Vector3][] = [
      [T.z1 - at.z, new THREE.Vector3(0, 0, 1)],
      [at.x - T.x0, new THREE.Vector3(-1, 0, 0)],
      [T.x1 - at.x, new THREE.Vector3(1, 0, 0)],
    ];
    // (a side edge against the wall or another top is no way off)
    const ok = opts.filter(([, v]) => {
      const ex = v.x < 0 ? T.x0 - 0.05 : v.x > 0 ? T.x1 + 0.05 : at.x, ez = v.z > 0 ? T.z1 + 0.05 : at.z;
      const below = this.set.topAt(ex, ez);
      return !below || below.h < T.h - 0.15;
    });
    const pick = (ok.length ? ok : opts).sort((a, b) => a[0] - b[0])[0][1];
    return pick.clone();
  }

  /** a look over the edge after it, and then at you */
  private peek(at: THREE.Vector3) {
    this.look = 0;
    this.lookAt.copy(at).setY(0);
  }

  /** nothing to do: sat, looking about (after a thing knocked off, down after it, then at you) */
  private rest(dt: number) {
    const m = this.cat.motor;
    this.idle += dt;
    if (this.look >= 0) {
      this.look += dt;
      m.lookAt(this.look < 0.9 ? this.lookAt : this.you, 1);
      if (this.look > 2.2) { this.look = -1; m.lookAt(null); }
    }
    if (this.idle > 0.4 && !m.goal) m.setPosture('sit');
    if (this.idle > 5 && this.look < 0) m.lookAt(this.you, 0.8);
  }

  /** where it is, put there (a round's start) */
  place(x: number, z: number, yaw: number) {
    this.on = null;
    this.steps = [];
    this.goal = null;
    this.cat.perch = null;
    this.cat.liftHold = null;
    this.cat.place(x, z, yaw);
    this.cat.snap('sit');
  }
}
