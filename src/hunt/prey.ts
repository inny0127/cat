import * as THREE from 'three';
import { lineClear } from './physics';
import { CEIL, HALF_X, HALF_Z, type World } from './world';

export type PreyKind = 'moth' | 'cricket' | 'mouse' | 'spider';

/** each kind: its name, points, how far it hears and sees, how jumpy it is, how fast it gets away */
export const PREY: Record<PreyKind, { name: string; pts: number; hear: number; see: number; nerves: number; flee: number; size: number }> = {
  moth: { name: '나방', pts: 100, hear: 1.6, see: 1.2, nerves: 0.9, flee: 2.6, size: 0.03 },
  cricket: { name: '귀뚜라미', pts: 150, hear: 2.6, see: 1.3, nerves: 1.1, flee: 1.8, size: 0.025 },
  mouse: { name: '생쥐', pts: 300, hear: 4.0, see: 2.6, nerves: 1.4, flee: 2.7, size: 0.045 },
  spider: { name: '거미', pts: 200, hear: 2.0, see: 1.0, nerves: 1.0, flee: 1.6, size: 0.03 },
};

export type PreyState = 'roam' | 'pause' | 'wary' | 'flee' | 'hidden' | 'stunned' | 'held';

/** what a prey has to know of the world about it each step */
export interface Senses {
  /** the cat's eye, how loud it is, how fast it moves */
  eye: THREE.Vector3;
  noise: number;
  speed: number;
  world: World;
  /** how far it sees, against the usual (a bright moon, lightning: further) */
  see?: number;
  /** a sound it makes (a chirp, a squeak, wings), for the game to play where it is */
  sound: (p: Prey, name: string) => void;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Something to hunt. It goes about its night (a moth round a light, a cricket hopping about the
 * floor and chirping, a mouse out of its hole to the crumbs and back), and all the while it
 * listens and looks: a cat heard or seen close enough makes it wary (it stops, it watches), and
 * more than that sends it off (a moth up and away, a cricket in great hops, a mouse back down its
 * hole for a while).
 */
export class Prey {
  readonly mesh = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  state: PreyState = 'roam';
  /** how much it suspects (0..1; past 1 it is off) */
  alert = 0;
  t = 0;
  heading = 0;
  private path: THREE.Vector3[] = [];
  private wait = 0;
  /** the light a moth is round, its orbit */
  private home = new THREE.Vector3();
  private orbit = { r: 0.3, w: 1.5, a: 0, y: 0 };
  private wings: THREE.Object3D[] = [];
  private legs: THREE.Object3D[] = [];
  private tail: THREE.Object3D | null = null;
  /** a spider's thread, up to where it hangs from (scaled to reach the ceiling); how low it lets
   *  itself down */
  private thread: THREE.Line | null = null;
  private hang = 0.5;
  private base = 0;
  private chirpIn = rnd(1, 4);
  /** seen from the cat this step (for the ? and ! over it) */
  seen = false;

  constructor(readonly kind: PreyKind) {
    this.build();
  }

  private build() {
    const g = this.mesh;
    const M = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: c, emissiveIntensity: 0.35 });
    if (this.kind === 'moth') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), M(0x9b8a70));
      body.scale.set(0.006, 0.006, 0.016);
      g.add(body);
      for (const s of [-1, 1]) {
        const w = new THREE.Group();
        const shape = new THREE.Shape([new THREE.Vector2(0, 0.006), new THREE.Vector2(0.03, 0.012), new THREE.Vector2(0.028, -0.014), new THREE.Vector2(0, -0.01)]);
        const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide, emissive: 0xe8dcc0, emissiveIntensity: 0.45 }));
        wing.rotation.x = -Math.PI / 2;
        wing.scale.x = s;
        w.add(wing);
        g.add(w);
        this.wings.push(w);
      }
    } else if (this.kind === 'cricket') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), M(0x6a4a2a));
      body.scale.set(0.008, 0.007, 0.018);
      body.position.y = 0.009;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.006, 5, 4), M(0x5a3a20));
      head.position.set(0, 0.01, 0.018);
      g.add(head);
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.016, 0.02), M(0x5a4028));
        leg.position.set(s * 0.009, 0.012, -0.008);
        leg.rotation.x = 0.9;
        g.add(leg);
        this.legs.push(leg);
        const ant = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.03), M(0x2a1a10));
        ant.position.set(s * 0.004, 0.016, 0.034);
        ant.rotation.set(-0.5, s * 0.3, 0);
        g.add(ant);
      }
    } else if (this.kind === 'spider') {
      const black = M(0x2a2228);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), black);
      body.scale.set(0.009, 0.008, 0.011);
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.005, 5, 4), black);
      head.position.set(0, 0.002, 0.011);
      g.add(head);
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0015, 0.0015), black);
        leg.position.set(s * 0.012, 0.003, 0.008 - k * 0.006);
        leg.rotation.set(0, s * (0.6 - k * 0.4), s * -0.5);
        g.add(leg);
        this.legs.push(leg);
      }
      const thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xd8dcf0, transparent: true, opacity: 0.55 }));
      g.add(thread);
      this.thread = thread;
    } else {
      const grey = M(0x8f8b95), pink = M(0xe9a2a8);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), grey);
      body.scale.set(0.024, 0.021, 0.04);
      body.position.y = 0.02;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), grey);
      head.scale.set(0.016, 0.015, 0.02);
      head.position.set(0, 0.024, 0.042);
      g.add(head);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CircleGeometry(0.011, 7), pink);
        ear.position.set(s * 0.013, 0.04, 0.035);
        ear.rotation.y = s * 0.4;
        g.add(ear);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.003, 4, 3), M(0x0a0a0a));
        eye.position.set(s * 0.008, 0.029, 0.055);
        g.add(eye);
      }
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.003, 4, 3), pink);
      nose.position.set(0, 0.023, 0.062);
      g.add(nose);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.003, 0.08, 4), pink);
      tail.rotation.x = Math.PI / 2 + 0.25;
      tail.position.set(0, 0.012, -0.075);
      g.add(tail);
      this.tail = tail;
    }
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    // (a little bigger than life, to be seen at all from across a room in so few pixels)
    g.scale.setScalar(this.kind === 'mouse' ? 1.45 : 2.2);
  }

  /** put out somewhere to begin with: a moth round a light, the rest on the floor */
  spawn(world: World) {
    this.alert = 0;
    this.t = 0;
    this.path = [];
    this.wait = 0;
    this.mesh.visible = true;
    if (this.kind === 'moth') {
      const lamps = world.lamps.filter((l) => !l.flicker || Math.random() < 0.5);
      const L = lamps[Math.floor(Math.random() * lamps.length)];
      this.home.copy(L.at);
      this.orbit = { r: rnd(0.2, 0.45), w: rnd(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1), a: rnd(0, 6.3), y: rnd(-0.15, 0.25) };
      this.pos.copy(this.home);
      this.state = 'roam';
    } else if (this.kind === 'cricket') {
      const s = world.cricketSpots[Math.floor(Math.random() * world.cricketSpots.length)];
      const c = world.cellAt(s.x + rnd(-0.6, 0.6), s.z + rnd(-0.6, 0.6));
      this.cellPos(world, c);
      this.state = 'pause';
      this.wait = rnd(1, 3);
    } else if (this.kind === 'spider') {
      // (from the ceiling over somewhere, let down a way on its thread)
      const spots = world.spiderSpots ?? [new THREE.Vector3()];
      const s = spots[Math.floor(Math.random() * spots.length)];
      this.home.set(s.x + rnd(-0.3, 0.3), CEIL, s.z + rnd(-0.3, 0.3));
      this.pos.copy(this.home).setY(CEIL - 0.1);
      this.base = s.y;
      this.hang = rnd(0.25, 0.85) + s.y;
      this.state = 'roam';
    } else {
      const h = world.holes[Math.floor(Math.random() * world.holes.length)];
      this.pos.copy(h.at);
      this.state = 'hidden';
      this.wait = rnd(2, 8);
    }
  }

  private cellPos(world: World, c: number) {
    const { cell, cols } = world.grid;
    if (c < 0) return;
    this.pos.set(-4.5 + ((c % cols) + 0.5) * cell, 0, -3.5 + (Math.floor(c / cols) + 0.5) * cell);
  }

  /** swatted: dazed a moment (a mouse: long enough for a pounce to follow) */
  stun(sec: number) {
    this.state = 'stunned';
    this.wait = sec;
  }

  /** caught in a pounce: held (a mouse, carried) or done with (the rest) */
  catchIt() {
    this.state = 'held';
    this.mesh.visible = false;
  }

  /** let go (a mouse given, or dropped): off back to its hole at a run */
  release(at: THREE.Vector3, world: World) {
    this.pos.copy(at).setY(0);
    this.mesh.visible = true;
    this.alert = 1;
    this.state = 'flee';
    this.runHome(world);
  }

  private runHome(world: World) {
    let best = world.holes[0], bd = Infinity;
    for (const h of world.holes) {
      const d = h.at.distanceTo(this.pos);
      if (d < bd) { bd = d; best = h; }
    }
    this.path = world.path(this.pos, best.at);
  }

  update(dt: number, S: Senses) {
    this.t += dt;
    if (this.state === 'held') return;
    const K = PREY[this.kind];
    // the senses: the cat heard (the louder and nearer, the more), or seen moving
    this.seen = false;
    if (this.state !== 'hidden' && this.state !== 'flee' && this.state !== 'stunned') {
      const d = this.pos.distanceTo(S.eye);
      let gain = 0;
      if (d < K.hear) gain += S.noise * 6 * (1 - d / K.hear);
      const see = K.see * (S.see ?? 1);
      if (d < see && S.speed > 0.05 && lineClear(this.pos.x, this.pos.y + 0.03, this.pos.z, S.eye.x, S.eye.y, S.eye.z, S.world.boxes)) {
        this.seen = true;
        // (a creeping cat hardly seen; a trotting one plain)
        gain += (S.speed < 0.7 ? 0.25 * S.speed : 0.6 + 0.4 * S.speed) * (1 - d / see) * 1.4;
      }
      // (right up close it knows anyway, in a moment)
      if (d < 0.3) gain += 0.8 * (1 - d / 0.3);
      this.alert = Math.max(0, this.alert + (gain * K.nerves - 0.22) * dt);
      if (this.alert >= 1) this.startle(S);
      else if (this.alert > 0.45 && (this.state === 'roam' || this.state === 'pause')) { this.state = 'wary'; this.wait = 0; }
      else if (this.state === 'wary' && this.alert < 0.25) this.state = 'roam';
    }
    if (this.kind === 'moth') this.moth(dt, S);
    else if (this.kind === 'cricket') this.cricket(dt, S);
    else if (this.kind === 'spider') this.spider(dt, S);
    else this.mouse(dt, S);
    // (never out through the walls, the floor or the ceiling, however its orbit or its hop goes)
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -HALF_X + 0.06, HALF_X - 0.06);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -HALF_Z + 0.06, HALF_Z - 0.06);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, 0, CEIL - 0.1);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    if (this.thread) this.thread.scale.y = Math.max(0.01, (CEIL - this.pos.y) / this.mesh.scale.y);
  }

  /** a crash heard (loud: 1 for a glass on the floor): near enough, it is off; further, wary */
  hear(at: THREE.Vector3, loud: number) {
    if (this.state === 'hidden' || this.state === 'held' || this.state === 'flee') return;
    const d = this.pos.distanceTo(at), R = 3.5 * loud;
    if (d < R) this.alert += 1.6 * (1 - d / R);
  }

  /** off: too much of the cat */
  private startle(S: Senses) {
    this.state = 'flee';
    this.t = 0;
    if (this.kind === 'moth') {
      // (up and away to another light)
      const others = S.world.lamps.filter((l) => l.at.distanceTo(this.home) > 0.5);
      const L = others[Math.floor(Math.random() * others.length)] ?? S.world.lamps[0];
      this.home.copy(L.at);
      S.sound(this, 'flutter');
    } else if (this.kind === 'cricket') {
      this.wait = 0;
      S.sound(this, 'hop');
    } else if (this.kind === 'spider') {
      S.sound(this, 'zip');
    } else {
      this.runHome(S.world);
      S.sound(this, 'squeak');
    }
  }

  /** a spider: down on its thread to where it means to hang, turning slowly, swaying; up and out of
   *  reach when it takes fright, and a while after, down again somewhere else */
  private spider(dt: number, S: Senses) {
    const sway = Math.sin(this.t * 1.3) * 0.03;
    this.heading += dt * 0.6 * Math.sin(this.t * 0.4);
    for (const [k, l] of this.legs.entries()) l.rotation.z = (k < 4 ? 1 : -1) * (-0.5 + 0.15 * Math.sin(this.t * 3 + k));
    if (this.state === 'hidden') {
      this.wait -= dt;
      if (this.wait <= 0) this.spawn(S.world);
      return;
    }
    if (this.state === 'stunned') {
      this.wait -= dt;
      if (this.wait <= 0) this.state = 'roam';
      return;
    }
    if (this.state === 'flee') {
      // (up the thread, fast; out of sight against the ceiling)
      this.pos.y += PREY.spider.flee * dt;
      if (this.pos.y >= CEIL - 0.12) { this.state = 'hidden'; this.mesh.visible = false; this.wait = rnd(8, 15); }
      return;
    }
    const want = this.state === 'wary' ? Math.min(this.hang + 0.4, CEIL - 0.2) : this.hang;
    this.pos.y += THREE.MathUtils.clamp(want - this.pos.y, -0.25 * dt, 0.3 * dt);
    this.pos.x = this.home.x + sway;
    this.pos.z = this.home.z + sway * 0.6;
    if (this.state === 'roam' && Math.random() < dt * 0.05) this.hang = THREE.MathUtils.clamp(this.hang + rnd(-0.3, 0.3), this.base + 0.22, CEIL - 0.4);
  }

  private moth(dt: number, S: Senses) {
    // wings a blur; round and round its light, erratic; fled: straight off to the next one
    const flap = Math.sin(this.t * 55) * 0.9;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
    const o = this.orbit;
    if (this.state === 'flee') {
      const to = this.home.clone().add(new THREE.Vector3(0.3, 0.1, 0));
      const d = to.clone().sub(this.pos);
      const sp = PREY.moth.flee;
      if (d.length() < 0.3) { this.state = 'roam'; this.alert = 0.2; }
      d.setLength(Math.min(d.length(), sp * dt));
      this.pos.add(d);
      this.pos.y += Math.sin(this.t * 13) * 0.004;
      this.heading = Math.atan2(d.x, d.z);
      return;
    }
    const slow = this.state === 'wary' ? 0.4 : 1;
    o.a += o.w * dt * slow;
    const r = o.r * (1 + 0.25 * Math.sin(this.t * 2.3));
    const target = new THREE.Vector3(this.home.x + Math.cos(o.a) * r, this.home.y + o.y + 0.12 * Math.sin(this.t * 3.1), this.home.z + Math.sin(o.a) * r);
    target.x += (Math.random() - 0.5) * 0.02;
    target.z += (Math.random() - 0.5) * 0.02;
    const prev = this.pos.clone();
    this.pos.lerp(target, Math.min(1, dt * 6));
    this.heading = Math.atan2(this.pos.x - prev.x, this.pos.z - prev.z);
    if (Math.random() < dt * 0.4) S.sound(this, 'flutter');
  }

  private cricket(dt: number, S: Senses) {
    const W = S.world;
    // a hop in the air
    if (this.pos.y > 0 || this.vel.y > 0) {
      this.vel.y -= 9.8 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y <= 0) { this.pos.y = 0; this.vel.set(0, 0, 0); }
      for (const l of this.legs) l.rotation.x = 0.2;
      return;
    }
    for (const l of this.legs) l.rotation.x = 0.9;
    const hop = (dir: THREE.Vector3, far: number) => {
      // (only where there is floor to come down on)
      const to = this.pos.clone().addScaledVector(dir, far);
      if (W.cellAt(to.x, to.z) < 0 || Math.abs(to.x) > 4.4 || Math.abs(to.z) > 3.4) dir.negate();
      const t = 0.35;
      this.vel.set((dir.x * far) / t, 9.8 * t / 2, (dir.z * far) / t);
      this.pos.y = 0.001;
      this.heading = Math.atan2(dir.x, dir.z);
    };
    if (this.state === 'flee') {
      this.wait -= dt;
      if (this.wait <= 0) {
        const away = this.pos.clone().sub(S.eye).setY(0).normalize();
        away.applyAxisAngle(new THREE.Vector3(0, 1, 0), rnd(-0.7, 0.7));
        hop(away, rnd(0.4, 0.7));
        this.wait = rnd(0.25, 0.6);
        if (this.t > 2.2) { this.state = 'pause'; this.alert = 0.3; this.wait = rnd(2, 4); }
      }
      return;
    }
    if (this.state === 'wary') return;
    this.wait -= dt;
    // (chirping when it is calm: the sound gives it away)
    this.chirpIn -= dt;
    if (this.chirpIn <= 0 && this.alert < 0.3) { S.sound(this, 'chirp'); this.chirpIn = rnd(2.5, 6); }
    if (this.wait <= 0) {
      const a = rnd(0, Math.PI * 2);
      hop(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), rnd(0.15, 0.4));
      this.wait = rnd(1.5, 4.5);
    }
  }

  private mouse(dt: number, S: Senses) {
    const W = S.world;
    if (this.tail) this.tail.rotation.z = Math.sin(this.t * 6) * 0.4;
    if (this.state === 'hidden') {
      this.mesh.visible = false;
      this.wait -= dt;
      if (this.wait <= 0) {
        // out of a hole (not one the cat is sat by), off to the crumbs
        const holes = W.holes.filter((h) => h.at.distanceTo(S.eye) > 1.5);
        const h = holes[Math.floor(Math.random() * holes.length)] ?? W.holes[0];
        this.pos.copy(h.at);
        this.mesh.visible = true;
        this.alert = 0;
        this.state = 'roam';
        const treat = W.treats[Math.floor(Math.random() * W.treats.length)];
        this.path = W.path(this.pos, treat.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), 0, rnd(-0.2, 0.2))));
        S.sound(this, 'squeak');
      }
      return;
    }
    if (this.state === 'stunned') {
      this.wait -= dt;
      if (this.wait <= 0) { this.state = 'flee'; this.runHome(W); }
      return;
    }
    if (this.state === 'wary') {
      // (still, nose up toward the cat)
      this.heading = Math.atan2(S.eye.x - this.pos.x, S.eye.z - this.pos.z);
      return;
    }
    if (this.state === 'pause') {
      this.wait -= dt;
      if (this.wait <= 0) {
        // (fed: off to another hole, or another crumb)
        this.state = 'roam';
        if (Math.random() < 0.5) {
          const h = W.holes[Math.floor(Math.random() * W.holes.length)];
          this.path = W.path(this.pos, h.at);
          this.path.push(h.at.clone().setY(-1));
        } else {
          const treat = W.treats[Math.floor(Math.random() * W.treats.length)];
          this.path = W.path(this.pos, treat);
        }
      }
      return;
    }
    // along its way: quick, in little dashes; fleeing, as fast as it goes
    const next = this.path[0];
    if (!next) {
      if (this.state === 'flee') { this.state = 'hidden'; this.wait = rnd(8, 15); this.mesh.visible = false; }
      else { this.state = 'pause'; this.wait = rnd(2, 5); }
      return;
    }
    if (next.y < 0) {
      // (into the hole at the end of the way)
      this.path.shift();
      this.state = 'hidden';
      this.wait = rnd(4, 10);
      this.mesh.visible = false;
      return;
    }
    const sp = this.state === 'flee' ? PREY.mouse.flee : 0.55 + 0.35 * Math.max(0, Math.sin(this.t * 4));
    const d = next.clone().sub(this.pos).setY(0);
    const len = d.length();
    if (len < 0.04) { this.path.shift(); return; }
    d.multiplyScalar(Math.min(1, (sp * dt) / len));
    this.pos.add(d);
    this.heading = Math.atan2(d.x, d.z);
  }
}
