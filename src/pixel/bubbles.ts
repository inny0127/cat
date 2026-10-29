import * as THREE from 'three';
import { noise1 } from '../util/math';

/** a soap bubble in the room: where, how it is drifting, how big, how long it has been out and how
 *  long it would last on its own; popped, how long since (-1: whole) */
export interface Bubble {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: number;
  age: number;
  life: number;
  pop: number;
  seed: number;
}

/** how long a popped bubble's drops are seen flying (s) */
export const POP_FOR = 0.22;

/**
 * Soap bubbles blown into the room from your side of it: each drifts in on the breath that blew it,
 * slower and slower, wobbling on the air of the room and sinking very slowly; and pops on its own
 * after a while, on the floor (or the rug: the fibres), at the walls, or on whatever touches it (a
 * paw, a nose).
 */
export class Bubbles {
  readonly list: Bubble[] = [];
  /** one popped, and what at */
  onPop: ((b: Bubble, why: 'air' | 'floor' | 'wall' | 'paw' | 'nose') => void) | null = null;
  private t = 0;

  /** a breath of them, from a point, toward another (n of them, big and small) */
  blow(from: THREE.Vector3, toward: THREE.Vector3, n = 7) {
    const dir = toward.clone().sub(from).normalize();
    for (let i = 0; i < n; i++) {
      const sp = 0.25 + Math.random() * 0.3;
      const v = dir.clone().multiplyScalar(sp);
      v.x += (Math.random() - 0.5) * 0.22;
      v.y += (Math.random() - 0.3) * 0.12;
      v.z += (Math.random() - 0.5) * 0.08;
      this.list.push({
        p: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.04, 0)),
        v, r: 0.009 + Math.random() * Math.random() * 0.016, age: -i * 0.07, life: 7 + Math.random() * 9, pop: -1, seed: Math.random() * 100,
      });
    }
    while (this.list.length > 12) this.list.shift();
  }

  /** the whole ones */
  get whole() {
    return this.list.filter((b) => b.pop < 0 && b.age >= 0);
  }

  /** the whole one nearest a point (null: none) */
  nearest(to: THREE.Vector3): Bubble | null {
    let best: Bubble | null = null, bd = Infinity;
    for (const b of this.list) {
      if (b.pop >= 0 || b.age < 0) continue;
      const d = b.p.distanceToSquared(to);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  pop(b: Bubble, why: 'air' | 'floor' | 'wall' | 'paw' | 'nose') {
    if (b.pop >= 0) return;
    b.pop = 0;
    this.onPop?.(b, why);
  }

  /** a time step, in a room of these bounds (the floor at 0) */
  step(dt: number, room: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    this.t += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (b.pop >= 0) {
        if ((b.pop += dt) > POP_FOR) this.list.splice(i, 1);
        continue;
      }
      b.age += dt;
      if (b.age < 0) continue;
      // (the breath that blew it dying away; the room's air turning it about, gently; sinking, the
      // film a touch heavier than the air)
      b.v.multiplyScalar(Math.exp(-dt * 0.9));
      b.v.x += noise1(this.t * 0.35 + b.seed) * 0.05 * dt;
      b.v.z += noise1(this.t * 0.3 + b.seed + 17) * 0.04 * dt;
      b.v.y += (-0.028 + noise1(this.t * 0.5 + b.seed + 41) * 0.02) * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.age > b.life) this.pop(b, 'air');
      else if (b.p.y < b.r + 0.004) this.pop(b, 'floor');
      else if (b.p.x < room.minX - 0.1 || b.p.x > room.maxX + 0.1 || b.p.z < room.minZ - 0.05) this.pop(b, 'wall');
    }
  }
}
