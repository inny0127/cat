import * as THREE from 'three';
import type { Act, Option } from './behave';

/** what of the nerves a whim needs: what the eyes are on, how well a thing is seen, and a place
 *  looked at for a whim let go again (nerves.ts) */
export interface Eyes {
  readonly attending: { readonly id: string; readonly a: number } | null;
  unit(id: string): { readonly vis: number } | null;
  forget(id: string): void;
}

/** all its moods as they are, how long on average from one thing it takes into its head to the
 *  next (s) */
const EVERY = 12;
/** the name of a place in its mind, to the nerves */
export const GOAL = 'goal';

const ss = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Where its own doings come from, when nobody is deciding for it: not a throw of the dice every
 * so many seconds, but urges, each as strong as its mood makes it, and stronger while its eyes are
 * on what the urge is about (the ball of wool caught its eye; now it wants it). One comes up now
 * and then, the more often the more it is in the mood; and before it is done it is in its mind a
 * moment: the eyes go to the thing or the place, and once they have been on it a little while, off
 * it goes. Something else holding its eyes meanwhile, it is forgotten; a place round behind it,
 * it knows where it is, and goes. After each, a while at its ease before the next.
 */
export class Whim {
  /** in mind, not yet begun: the option, its act, the place (when it is not a thing it sees), the
   *  name its eyes know it by, how long it has been in mind, how long the eyes have been on it,
   *  and how long they need to be */
  intent: { o: Option; act: Act; at: THREE.Vector3 | null; id: string; t: number; on: number; dwell: number } | null = null;
  /** at its ease this long (s): nothing comes into its head in the first moments */
  private easy = 0;
  private opts: Option[] = [];
  private optsIn = 0;
  /** how much more an urge comes on while its eyes are on its thing (a curious cat, more) */
  gain = 6;
  /** how lively it is just now (1: a thing in its head every EVERY seconds or so; at less, a calm
   *  or drowsy cat, it mostly just sits there, and longer after each thing before the next) */
  pace = 1;

  constructor(private readonly rnd: () => number = Math.random) {}

  /** how strongly each urge pulls just now, as shares of them all (staying as it is left out):
   *  the strongest few, for the window on its mind */
  urges(eyes: Eyes, n = 3) {
    const A = eyes.attending;
    const all = this.opts.filter((o) => o.key !== 'still').map((o) => ({ key: o.key, w: o.w * (1 + this.gain * (o.about && A?.id === o.about ? A.a : 0)) }));
    const W = all.reduce((s, o) => s + o.w, 0);
    if (W <= 0) return [];
    return all.sort((x, y) => y.w - x.w).slice(0, n).map((o) => ({ key: o.key, share: o.w / W }));
  }

  /** how hard what it has in mind draws its eyes (added to the drive of that thing's neuron) */
  get pull() {
    return this.intent ? 0.45 + 0.45 * Math.min(1, this.intent.t / 1.2) : 0;
  }

  /** whatever it had in mind is gone (something else has it now) */
  drop(eyes?: Eyes) {
    if (this.intent?.id === GOAL) eyes?.forget(GOAL);
    this.intent = null;
    this.easy = 0;
    // (what it might do asked afresh, at its ease again: it may be somewhere else now)
    this.optsIn = 0;
  }

  private begin(eyes: Eyes) {
    const I = this.intent!;
    this.drop(eyes);
    return { o: I.o, act: I.act };
  }

  /**
   * A moment at its ease (nothing on hand, nobody's hands on it): what comes into its head, and
   * what it begins now, if anything (an act; or null, the plain option of staying as it is).
   * The options are asked for now and then, not every moment.
   */
  update(dt: number, options: () => Option[], eyes: Eyes): { o: Option; act: Act | null } | null {
    const I = this.intent;
    if (I) {
      I.t += dt;
      const A = eyes.attending;
      if (A?.id === I.id && A.a > 0.5) I.on += dt;
      else if (A && A.a > 0.6) I.on = Math.max(0, I.on - 0.5 * dt);
      if (I.on >= I.dwell) return this.begin(eyes);
      const u = eyes.unit(I.id);
      // (out of sight, round behind it or the far side of something: it knows where it is, and goes;
      // only just in sight, out at the edge of its eyes, a moment later)
      if (I.t > 0.8 && I.on <= 0 && (!u || u.vis < 0.2)) return this.begin(eyes);
      if (I.t > 1.5 && I.on <= 0 && u && u.vis < 0.5) return this.begin(eyes);
      // (in sight, and its eyes never got there: something else had them, and it is forgotten)
      if (I.t > 3) this.drop(eyes);
      return null;
    }
    this.easy += dt;
    if ((this.optsIn -= dt) <= 0) {
      this.optsIn = 1;
      this.opts = options();
    }
    const ramp = ss(1, 2 + 3 / Math.max(0.3, Math.min(1, this.pace)), this.easy);
    if (ramp <= 0) return null;
    let W = 0;
    for (const o of this.opts) W += o.w;
    if (W <= 0) return null;
    const A = eyes.attending;
    for (const o of this.opts) {
      // (its eyes on the thing it is about: the urge many times stronger while they are)
      const on = o.about && A?.id === o.about ? A.a : 0;
      const rate = (o.w / (W * EVERY)) * this.pace * (1 + this.gain * on) * ramp;
      if (this.rnd() >= rate * dt) continue;
      const act = o.make();
      // (nothing to be had there after all, the sun gone off the floor: as if it never came into
      // its head)
      if (!act && o.key !== 'still') continue;
      this.easy = 0;
      this.optsIn = 0;
      const at = o.about ? null : o.at ?? null;
      if (!act || (!o.about && !at)) return { o, act };
      this.intent = { o, act, at: at && at.clone(), id: o.about ?? GOAL, t: 0, on: 0, dwell: 0.3 + 1.1 * this.rnd() };
      return null;
    }
    return null;
  }
}
