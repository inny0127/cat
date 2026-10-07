import * as THREE from 'three';

/**
 * The little sounds of a lived-in place, that a cat hears whether or not anyone has the sound on
 * (and mostly we would not hear at all): a bird outside, a car in the street below, a door
 * somewhere in the building, feet on the floor above, the pipes ticking as the heating comes on.
 * Each comes now and then, at no set pace (a while of nothing, then two together), from where it
 * comes from, some louder than others; the street busier by day, the building of a morning and an
 * evening, the birds of a spring dawn, the pipes on cold mornings and evenings. Only the birds are
 * for us to hear too.
 */
export interface Heard {
  id: string;
  /** where it comes from (world) */
  at: THREE.Vector3;
  /** how loud it is to the cat (0 .. 1) */
  loud: number;
  /** a bird: its call, to play for us to hear as well */
  play?: 'birdChip' | 'birdSong';
}

export interface Outside {
  /** daylight (0 .. 1), the hour (0 .. 24), the month (0 .. 11), the rain (0 .. 1) */
  day: number;
  hour: number;
  month: number;
  rain: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** the wait till the next of something that comes on average every `mean` seconds, at no set
 *  pace (now two close together, now a long while) */
const wait = (mean: number) => -Math.log(1 - Math.random() * 0.999) * mean;
const bump = (h: number, at: number, w: number) => Math.exp(-(((h - at) / w) ** 2));
/** how much the heating is on, month by month (January first) */
const COLD = [1, 1, 0.8, 0.4, 0, 0, 0, 0, 0, 0.3, 0.7, 1];

export class Soundscape {
  /** how long till the next of each (s) */
  private readonly due: Record<string, number> = { bird: 2, street: wait(25), door: wait(120), upstairs: wait(150), pipes: wait(60) };
  /** the pipes tick in a run once they start: how many more, and how soon */
  private ticks = 0;
  private tickIn = 0;

  constructor(private readonly where: { window: THREE.Vector3; radiator: THREE.Vector3 }) {}

  /** a moment on: whatever was heard in it, onto `out` */
  update(dt: number, o: Outside, out: Heard[]) {
    const W = this.where.window, h = o.hour;
    const at = (x: number, y: number, z: number) => new THREE.Vector3(W.x + x, W.y + y, W.z + z);
    // birds: of a spring or summer day, most of all about dawn; none in the rain or the dark
    const spring = o.month >= 2 && o.month <= 6 ? 1 : o.month >= 7 && o.month <= 9 ? 0.6 : 0.25;
    const birdy = o.day * (1 - o.rain) * spring * (0.5 + bump(h, 6.8, 1.4));
    if (birdy > 0.08 && (this.due.bird -= dt) <= 0) {
      this.due.bird = rand(5, 16) / (0.4 + birdy);
      out.push({ id: 'bird', at: at(rand(-0.6, 0.6), rand(0, 0.4), -0.8), loud: rand(0.3, 0.6) * Math.min(1, birdy + 0.3), play: Math.random() < 0.6 ? 'birdChip' : 'birdSong' });
    }
    // the street below: a car going by, voices, now and then a motorbike or a horn; busy by day,
    // quiet in the small hours
    const traffic = 0.15 + 0.85 * Math.max(bump(h, 8.5, 2.5), bump(h, 13, 4), bump(h, 18.5, 2.5));
    if ((this.due.street -= dt) <= 0) {
      this.due.street = wait(22 / traffic);
      const loud = Math.random() < 0.06 ? rand(0.6, 0.85) : rand(0.15, 0.4);
      out.push({ id: 'street', at: at(rand(-1.5, 1.5), -1.2, -3), loud: loud * (1 - 0.3 * o.rain) });
    }
    // the building: a door somewhere, someone on the stairs (through one wall or the other); of a
    // morning and an evening most
    const about = 0.1 + Math.max(bump(h, 7.8, 1.2), bump(h, 19, 2.5)) + 0.3 * bump(h, 13, 4);
    if ((this.due.door -= dt) <= 0) {
      this.due.door = wait(150 / about);
      out.push({ id: 'door', at: new THREE.Vector3(W.x + (Math.random() < 0.5 ? -1.8 : 1.8), 1, W.z + rand(0.3, 1.5)), loud: rand(0.3, 0.7) });
    }
    // feet on the floor above, a chair pushed back
    const up = 0.08 + Math.max(bump(h, 7.5, 1.5), bump(h, 20, 3)) + 0.25 * bump(h, 14, 4);
    if ((this.due.upstairs -= dt) <= 0) {
      this.due.upstairs = wait(90 / up);
      out.push({ id: 'upstairs', at: new THREE.Vector3(W.x + rand(-1, 1), 2.8, W.z + rand(0.3, 1.5)), loud: rand(0.2, 0.5) });
    }
    // the pipes: the heating coming on of a cold morning or evening, a run of ticks and knocks
    const cold = COLD[o.month] ?? 0;
    const heating = cold * Math.max(bump(h, 6.5, 1.3), bump(h, 18, 1.8));
    if (heating > 0.1 && this.ticks === 0 && (this.due.pipes -= dt) <= 0) {
      this.due.pipes = wait(240 / heating);
      this.ticks = 3 + Math.floor(Math.random() * 5);
      this.tickIn = 0;
    }
    if (this.ticks > 0 && (this.tickIn -= dt) <= 0) {
      this.ticks--;
      this.tickIn = rand(0.25, 1.4);
      const R = this.where.radiator;
      out.push({ id: 'pipes', at: new THREE.Vector3(R.x + rand(-0.2, 0.2), R.y, R.z), loud: rand(0.2, 0.45) });
    }
  }
}
