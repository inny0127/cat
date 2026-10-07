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
  /** the gaze target is a glance aside of its own, not at anything (a body in a room may look
   *  somewhere of its own choosing instead) */
  gazeAside?: boolean;
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
  vocalize?(kind: 'trill' | 'meow' | 'meowSoft' | 'meowPlead' | 'chirp' | 'grumble', dur: number, delay: number): void;
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
  /** back after long, and found waiting for you at the glass all the while: there you are */
  waited?(glad: number): void;
  /** a boop on the nose: the face screwed up, a lick of the nose, a shake of the head, if the body
   *  can show it (true if it does) */
  booped?(): boolean;
  /** hungry or thirsty with the bowl empty: it asks you at the bowl, if the body can show it (true
   *  if it does; empty: whether the bowl is still empty) */
  beg?(what: 'food' | 'water', urgent: boolean, empty: () => boolean): boolean;
  /** the hands gone, it puts its coat to rights where they were, if the body can show it */
  tidy?(where: 'face' | 'flank' | 'chest'): boolean | void;
  /** the hands gone (or a fright over, or up from a nap), a shake from head to tail, the coat put
   *  back as it should lie; and then a lick at it where it was touched, if `then` says where (true
   *  if it does) */
  shakeOff?(then: 'face' | 'flank' | 'chest' | null): boolean | void;
  /** a love bite on the finger stroking it, gently, and a lick (true if it did) */
  loveBite?(): boolean;
  /** scratched at the base of its tail: the nose up and a few licks at the air, as cats do for it
   *  (true if it did) */
  airLick?(): boolean;
  /** the hand gone before it had had enough: the head pushed out after it, a look at you (true if
   *  it does) */
  askMore?(): boolean;
  /** how far out of its sight a hand came down on it, at a point on the screen (0: it saw it coming
   *  .. 1: out of nowhere, round behind it); and its eyes sent round to it */
  unseen?(sx: number, sy: number): number;
  /** a hand on its belly: trapped (hugged, bitten at, kicked) if the belly is offered just now
   *  (rolled over, flat out, on its back); false if not */
  bellyTrap?(): boolean;
  /** leave: dir -1 left, 1 right; calm walks off rather than bolting; reason: the errand, if one
   *  (a body with a room to show it in goes to the bowl or the box); keen: how much it is looking
   *  forward to it (0 .. 1: its dinner, hungry, the kibble just rattled), for the pace it goes at */
  bolt(dir: number, onDone?: () => void, calm?: boolean, reason?: string, keen?: number): void;
  /** a body with a room to show it in keeps to it, away or not: off on an errand it is at the bowl
   *  or the box, sulking it is in a corner of the room (never out of it, never hidden) */
  readonly inRoom?: boolean;
  /** lying down as near you as it can get, there now (a nap by you: content just to be there) */
  readonly byYouNow?: boolean;
  /** (in the room) the errand done in view, and the cat waiting to be called back about the room */
  readonly errandDone?: boolean;
  /** (in the room) found away as the window is opened: where in the room it is, at what (the
   *  bowl, the box, a corner to sulk in, somewhere about the room) */
  awayAt?(reason: string): void;
  /** (in the room) a hand on it as it sulks in its corner: shrugged off (again: up and off to the
   *  other corner) */
  sulkTouched?(again: boolean): void;
  /** (in the room) made up with, in its corner: round to you */
  sulkOver?(): void;
  /** (in the room) called as it sulks in its corner (a knock on the glass): it looks back */
  sulkHeard?(): void;
  /** a body that slowly isn't there any more */
  fadeAway(onDone?: () => void): void;
  /** come back into view */
  arrive(onDone?: () => void): void;
  setHidden(h: boolean): void;
}
