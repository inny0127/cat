import * as THREE from 'three';
import type { Cat3D } from '../cat3d/cat';
import { groomChest, scratchEar, sneeze, washFace, yawn, type Act, type Ctx } from '../pixel/behave';

/**
 * What the smooth cat does while you watch it: it sits at its ease and looks about (at you, off
 * to one side and the other, down at the floor, after a fly), blinks, flicks an ear, tips its head
 * at a sound, says something now and then, yawns, washes its face. The pixel cat's own gestures
 * (src/pixel/behave.ts) are borrowed as they are: only the drawing is new here.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export type Beat = 'you' | 'side' | 'behind' | 'down' | 'up' | 'fly' | 'tilt' | 'meow' | 'slowBlink' | 'ear' | 'yawn' | 'wash' | 'groom' | 'scratch' | 'sneeze';
const WEIGHTS: [Beat, number][] = [
  ['you', 5], ['side', 4], ['behind', 2], ['down', 3], ['up', 1.5], ['fly', 3], ['tilt', 2], ['meow', 1.2],
  ['slowBlink', 1.5], ['ear', 2], ['yawn', 1], ['wash', 1], ['groom', 0.8], ['scratch', 0.6], ['sneeze', 0.4],
];

export class Director {
  /** someone is pointing: the cat watches the finger and the director keeps out of it */
  private pointerAt: THREE.Vector3 | null = null;
  private pointerIdle = 0;
  private act: Act | null = null;
  private wait = 1.2;
  /** off: it does only what it is told (begin), for a recorded reel */
  auto = true;
  private last: Beat = 'you';
  private fly: { t: number; dur: number; seed: number } | null = null;
  private tilt: { t: number; dur: number; to: number } | null = null;
  private readonly ctx: Ctx;

  constructor(private readonly cat: Cat3D, private readonly viewer: () => THREE.Vector3) {
    // the acts borrowed from the pixel cat ask only for the motor and a way to make a sound
    this.ctx = { m: cat.motor, sound: () => {}, mood: cat.motor.mood, mode: 'rest', kneading: false } as unknown as Ctx;
  }

  /** a finger over the window (null: gone) */
  point(at: THREE.Vector3 | null) {
    if (at) {
      this.pointerAt = at.clone();
      this.pointerIdle = 0;
      this.cat.motor.lookAt(this.pointerAt, 1);
    }
  }

  /** a tap on the glass: an ear turns to it, the eyes go to it */
  tap(at: THREE.Vector3) {
    this.point(at);
    this.cat.motor.flickEar(at.x > this.cat.motor.pos.x ? 'R' : 'L', 0.9);
    if (Math.random() < 0.5) this.cat.motor.blinkNow();
  }

  /** a point about the cat, in its own frame (x to its left, z ahead of it) */
  private around(x: number, y: number, z: number) {
    const m = this.cat.motor, c = Math.cos(m.yaw), s = Math.sin(m.yaw);
    return new THREE.Vector3(m.pos.x + x * c + z * s, y, m.pos.z - x * s + z * c);
  }

  begin(b: Beat) {
    const m = this.cat.motor;
    const side = Math.random() < 0.5 ? 1 : -1;
    this.fly = null;
    switch (b) {
      case 'you': m.lookAt(this.viewer(), 1); this.wait = rand(2.5, 5); break;
      case 'side': m.lookAt(this.around(side * rand(0.7, 1.2), rand(0.15, 0.45), rand(0.1, 0.6)), 1); this.wait = rand(2, 4); break;
      case 'behind': m.lookAt(this.around(side * rand(0.8, 1.2), rand(0.2, 0.4), rand(-0.5, -0.15)), 1); this.wait = rand(1.8, 3); break;
      case 'down': m.lookAt(this.around(side * rand(0.1, 0.45), 0, rand(0.25, 0.5)), 1); this.wait = rand(2, 3.5); break;
      case 'up': m.lookAt(this.around(side * rand(0, 0.4), rand(1.0, 1.6), rand(0.2, 0.6)), 1); this.wait = rand(1.5, 3); break;
      case 'fly': this.fly = { t: 0, dur: rand(4, 7), seed: Math.random() * 10 }; this.wait = this.fly.dur; m.setMood({ arousal: 0.4 }); break;
      case 'tilt': m.lookAt(this.viewer(), 1); this.tilt = { t: 0, dur: rand(1.6, 2.6), to: side * rand(0.3, 0.45) }; m.flickEar('both', 0.5); this.wait = this.tilt.dur + 0.6; break;
      case 'meow': m.lookAt(this.viewer(), 1); m.vocalize(pick(['meow', 'meowSoft', 'trill']), rand(0.5, 0.9), 0.3); this.wait = 2.2; break;
      case 'slowBlink': m.lookAt(this.viewer(), 1); m.slowBlink(); this.wait = rand(2.5, 3.5); break;
      case 'ear': m.flickEar(pick(['L', 'R', 'both'] as const), rand(0.6, 1.1)); this.wait = rand(0.8, 1.5); break;
      case 'yawn': this.act = yawn(); break;
      case 'wash': this.act = washFace(); break;
      case 'groom': this.act = groomChest(); break;
      case 'scratch': this.act = scratchEar(); break;
      case 'sneeze': this.act = sneeze(this.ctx); break;
    }
    if (b !== 'fly') m.setMood({ arousal: 0 });
    this.last = b;
  }

  private next() {
    // (not the same twice running)
    const ws = WEIGHTS.filter(([b]) => b !== this.last);
    let r = Math.random() * ws.reduce((a, [, w]) => a + w, 0);
    for (const [b, w] of ws) if ((r -= w) <= 0) return this.begin(b);
    this.begin('you');
  }

  update(dt: number) {
    const m = this.cat.motor;
    // a finger: watched for as long as it moves, and a moment after
    if (this.pointerAt) {
      this.pointerIdle += dt;
      if (this.pointerIdle < 2.5) {
        if (this.act) { this.act.stop(this.ctx); this.act = null; }
        return;
      }
      this.pointerAt = null;
      this.wait = 0;
    }
    if (this.act) {
      if (this.act.update(dt, this.ctx)) return;
      this.act.stop(this.ctx);
      this.act = null;
      this.wait = this.auto ? rand(0.5, 1.2) : 1e9;
      return;
    }
    // a fly about the cat's head: a wandering loop it follows with its eyes and head
    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      const u = f.t * 0.9 + f.seed;
      m.lookAt(this.around(0.55 * Math.sin(u * 1.3) + 0.2 * Math.sin(u * 3.1), 0.45 + 0.25 * Math.sin(u * 1.9 + 1), 0.45 + 0.15 * Math.cos(u * 1.1)), 1);
    }
    // the head tipped to one side, and back
    if (this.tilt) {
      const t = this.tilt;
      t.t += dt;
      const k = Math.min(1, t.t / 0.35) * Math.min(1, Math.max(0, (t.dur - t.t) / 0.5));
      m.tilt = t.to * k * k * (3 - 2 * k);
      if (t.t >= t.dur) { m.tilt = 0; this.tilt = null; }
    }
    if ((this.wait -= dt) <= 0 && this.auto) this.next();
  }
}
