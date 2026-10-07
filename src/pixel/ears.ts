import * as THREE from 'three';

/**
 * The cat's hearing: a handful of neurons, one for each thing it hears (the radio, the rain on the
 * glass, a knock or a click about the room). Each is driven by the sound as it comes, each beat of
 * the radio, the rain getting up, a bang; the more by a sound it is not used to. Each gets used to
 * a sound that only goes on the same (a song's beat, a while of it, is nothing to it any more)
 * and is fresh to it again after a quiet or a change (the next song). The one firing hardest is
 * what it listens to: the ear on that side goes round to it, and holds there till another is
 * clearly louder or it dies away; a sound out of a quiet flicks an ear at once.
 */
export interface Sound {
  id: string;
  /** where it comes from (world) */
  at: THREE.Vector3;
  /** what drives its neuron (fading between sounds), how used to it it is (0 .. 1), and how hard
   *  the neuron fires (0 .. 1) */
  drive: number;
  hab: number;
  a: number;
  /** a sound that goes on: how loud it has been lately */
  level: number;
  /** how long since it last made a sound (s) */
  quiet: number;
}

export class Ears {
  readonly heard = new Map<string, Sound>();
  /** what it listens to just now (null: nothing in particular) */
  on: Sound | null = null;
  /** an ear flicked at a sound out of a quiet: where, how hard (taken by whatever moves the ears) */
  flick: { at: THREE.Vector3; k: number } | null = null;
  /** a sound that came hard at the neuron, out of a quiet, new or not heard for a while: worth a
   *  look that way (taken by whatever turns the head) */
  orient: { at: THREE.Vector3; k: number } | null = null;
  private flickRest = 0;

  private unit(id: string, at: THREE.Vector3) {
    let u = this.heard.get(id);
    if (!u) {
      u = { id, at: at.clone(), drive: 0, hab: 0, a: 0, level: 0, quiet: 1e9 };
      this.heard.set(id, u);
    } else u.at.copy(at);
    return u;
  }

  /**
   * A sound from something: how loud it is to the cat (0 .. 1); `fresh`, unlike what it has made
   * lately (a new song on the radio), and so as good as new; `wear`, how much each one wears it
   * in (a sound that comes every few seconds or so and is of no account, a bird, the street, more
   * than a beat of the radio).
   */
  sound(id: string, at: THREE.Vector3, loud: number, fresh = false, wear = 0.08) {
    const u = this.unit(id, at);
    if (fresh) u.hab *= 0.25;
    const k = loud * (1 - 0.9 * u.hab);
    // (out of a quiet, a sound it is not used to: an ear flicks to it; and come hard at it, after
    // a while of nothing from there, a look)
    if (k > 0.3 && u.quiet > 1.5 && this.flickRest <= 0) {
      this.flick = { at: u.at, k: Math.min(1, k) };
      this.flickRest = 0.6;
    }
    if (k > 0.5 && u.quiet > 3) this.orient = { at: u.at, k: Math.min(1, k) };
    u.quiet = 0;
    u.drive = Math.min(1.5, Math.max(0, u.drive) + k);
    u.hab = Math.min(1, u.hab + wear * loud);
  }

  /**
   * A sound that goes on (rain on the glass): how loud it is now (0 .. 1). Its getting up is heard,
   * and a little of it all the while, the less the more it is used to it.
   */
  level(id: string, at: THREE.Vector3, loud: number, dt: number) {
    if (loud <= 0.01 && !this.heard.has(id)) return;
    const u = this.unit(id, at);
    const up = Math.max(0, loud - u.level);
    u.level += (loud - u.level) * Math.min(1, dt / 0.5);
    u.drive = Math.max(u.drive, Math.min(1.5, up * 6 + 0.45 * loud * (1 - 0.9 * u.hab)));
    u.hab = Math.min(1, u.hab + 0.09 * loud * dt);
    if (loud > 0.05) u.quiet = 0;
  }

  /** a moment on: what drives each fades, each rests from what it was used to (half a minute or
   *  so), and the one listened to is settled */
  update(dt: number) {
    this.flickRest -= dt;
    let best: Sound | null = null;
    for (const u of this.heard.values()) {
      u.quiet += dt;
      u.drive *= Math.exp(-dt / 0.6);
      u.hab -= (u.hab * dt) / 30;
      u.a += (Math.min(1, u.drive) - u.a) * (1 - Math.exp(-dt / 0.1));
      if (!best || u.a > best.a) best = u;
    }
    const cur = this.on;
    if (best && best.a > 0.15 && (!cur || best === cur || best.a > cur.a + 0.1 || cur.a < 0.1)) this.on = best;
    else if (cur && cur.a < 0.1) this.on = null;
  }
}
