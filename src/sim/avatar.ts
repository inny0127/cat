import type { EarMood, TailMood } from '../rig/animator';

/**
 * The body the brain moves: what it wants the cat to do and show, set every frame, plus a few
 * one-off actions. The painted cat's animator (rig/animator.ts) is one; the 3D pixel cat's
 * (pixel/avatar.ts) is the other.
 */
export interface Avatar {
  /** 0 awake .. 1 deep sleep */
  sleep: number;
  eyeTarget: number;
  squintTarget: number;
  pupilTarget: number;
  /** screen px; null looks at the viewer */
  gazeTarget: { x: number; y: number } | null;
  earMood: EarMood;
  tailMood: TailMood;
  /** 0 tucked down .. 1 raised to look around */
  headLift: number;
  /** pushing into a hand (screen px) */
  headLean: { x: number; y: number };
  /** pulling away (the hiss) */
  headRecoil: number;
  kneading: boolean;
  rippleTarget: number;
  puffTarget: number;
  /** Hz */
  breathRate: number;
  breathDepth: number;
  alive: boolean;
  sick: number;
  desatTarget: number;
  purr: number;
  readonly hidden: boolean;
  doBlink(slow?: boolean): void;
  twitchEar(which: 'L' | 'R' | 'both', strength?: number): void;
  /** turn the ears toward a point on screen (-1 left .. 1 right) */
  swivelEars(amount: number): void;
  flickTail(strength?: number): void;
  /** startle */
  jolt(strength?: number): void;
  swat(dirX?: number, dirY?: number): void;
  /** saying something (a meow, a trill, a chirp): the mouth shaped by it for as long as it lasts,
   *  starting after a delay (s), if the body can show it */
  vocalize?(kind: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp', dur: number, delay: number): void;
  /** the hiss itself, if the body can show it (a mouth that opens) */
  hiss?(): void;
  sigh(): void;
  /** woken of itself from a long sleep: the yawn and the stretch of a cat getting up, if the body
   *  can show them */
  wakeStretch?(): void;
  /** something it cannot make out (a tap on the glass): the head tipped to one side a moment */
  puzzled?(): void;
  /** you are back after a while away and it is awake: hello, if the body can say it (up to the
   *  glass, tail up; glad: how glad, 0 .. 1) */
  greet?(glad: number): void;
  /** hungry or thirsty with the bowl empty: it asks you at the bowl, if the body can show it (true
   *  if it does; empty: whether the bowl is still empty) */
  beg?(what: 'food' | 'water', urgent: boolean, empty: () => boolean): boolean;
  /** the hands gone, it puts its coat to rights where they were, if the body can show it */
  tidy?(where: 'face' | 'flank' | 'chest'): void;
  /** leave: dir -1 left, 1 right; calm walks off rather than bolting; reason: the errand, if one
   *  (a body with a room to show it in goes to the bowl or the box) */
  bolt(dir: number, onDone?: () => void, calm?: boolean, reason?: string): void;
  /** a body that slowly isn't there any more */
  fadeAway(onDone?: () => void): void;
  /** come back into view */
  arrive(onDone?: () => void): void;
  setHidden(h: boolean): void;
}
