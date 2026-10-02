/**
 * Whole-body poses as plain numbers, so any two can be blended channel by channel.
 *
 * Angles are radians in the cat's own terms: pitch is nose-up positive, yaw is toward the cat's
 * left, roll is right-side-down. Positions are metres in the model frame (floor at y = 0, the cat
 * faces +z, +x is its left). Foot x is measured outward from the midline and mirrored for the
 * right legs.
 */

export type Leg = 'LF' | 'RF' | 'LH' | 'RH';
export const LEGS: Leg[] = ['LF', 'RF', 'LH', 'RH'];

export interface Foot {
  x: number; y: number; z: number;
  /** 0: (x,y,z) is a spot in the model frame, normally on the floor; 1: relative to the leg's root joint in its girdle */
  frame: number;
  /** 1 when the paw bears weight and should stay put on the floor */
  planted: number;
  /** wrist/ankle flex: 0 flat paw .. 1 folded right back */
  flex: number;
}

export interface Pose {
  hipY: number; hipZ: number; hipPitch: number; hipYaw: number; hipRoll: number;
  lumbarPitch: number; lumbarYaw: number;
  chestPitch: number; chestYaw: number; chestRoll: number;
  neckPitch: number; neckYaw: number;
  headPitch: number; headYaw: number; headRoll: number;
  LF: Foot; RF: Foot; LH: Foot; RH: Foot;
  /** front pastern angle away from vertical, toes forward */
  pastern: number;
  /** 0: hind cannon parallel to the thigh (standing); 1: flat on the floor (sitting, lying) */
  hindFlat: number;
  /** tail: lift at the root (+ up), sideways sweep (+ left), bend along it, extra curl at the tip */
  tailLift: number; tailSide: number; tailCurve: number; tailCurl: number;
  /** 0 the tail holds its shape .. 1 it lies limp under its own weight */
  tailSag: number;
  /** ears: forward (+) / back (-), out to the sides (airplane), flattened */
  earFwd: number; earOut: number; earFlat: number;
  /** face */
  eyeOpen: number; squint: number; pupil: number; whisker: number; jaw: number;
  /** how deep the breathing is */
  breath: number;
  /** fur standing on end */
  puff: number;
}

const foot = (x: number, y: number, z: number, frame = 0, planted = 1, flex = 0): Foot => ({ x, y, z, frame, planted, flex });

const BASE: Pose = {
  hipY: 0.218, hipZ: -0.150, hipPitch: 0, hipYaw: 0, hipRoll: 0,
  lumbarPitch: 0, lumbarYaw: 0,
  chestPitch: 0, chestYaw: 0, chestRoll: 0,
  neckPitch: 0, neckYaw: 0,
  headPitch: 0, headYaw: 0, headRoll: 0,
  LF: foot(0.036, 0.012, 0.104), RF: foot(0.036, 0.012, 0.104),
  LH: foot(0.041, 0.013, -0.158), RH: foot(0.041, 0.013, -0.158),
  pastern: 0.35, hindFlat: 0,
  tailLift: 0.25, tailSide: 0, tailCurve: -0.5, tailCurl: 0.3, tailSag: 0,
  earFwd: 0.2, earOut: 0, earFlat: 0,
  eyeOpen: 0.72, squint: 0.12, pupil: 0.28, whisker: 0, jaw: 0,
  breath: 0.6, puff: 0,
};

const make = (over: Partial<Pose>): Pose => {
  const p = structuredClone(BASE);
  return Object.assign(p, structuredClone(over));
};

export const POSES = {
  stand: make({}),

  /** alert stand, head up, tail up */
  alert: make({
    hipY: 0.222, chestPitch: 0.04, neckPitch: 0.25, headPitch: -0.12,
    tailLift: 1.1, tailCurve: -0.9, tailCurl: 0.5, earFwd: 0.6, eyeOpen: 1, pupil: 0.45,
  }),

  /** sitting upright on the haunches, front legs straight, tail round the paws */
  sit: make({
    hipY: 0.064, hipZ: -0.12, hipPitch: 0.72,
    lumbarPitch: 0.5, chestPitch: -0.97,
    neckPitch: 0.85, headPitch: -1.15,
    LF: foot(0.03, 0.012, 0.072), RF: foot(0.03, 0.012, 0.072),
    LH: foot(0.036, 0.012, -0.068, 0, 1, 0), RH: foot(0.036, 0.012, -0.068, 0, 1, 0),
    pastern: 0.25, hindFlat: 1,
    tailLift: -0.9, tailSide: 0.7, tailCurve: 1.1, tailCurl: 0.4, tailSag: 0.5,
    eyeOpen: 0.85, breath: 0.5,
  }),

  /** bread loaf: all four paws tucked under, chin level */
  loaf: make({
    hipY: 0.112, hipZ: -0.142, hipPitch: 0.12,
    lumbarPitch: -0.06, chestPitch: -0.2,
    neckPitch: 0.42, headPitch: -0.32,
    LF: foot(-0.006, -0.052, -0.035, 1, 0, 1), RF: foot(-0.006, -0.052, -0.035, 1, 0, 1),
    LH: foot(0.044, 0.013, -0.085, 0, 0, 0), RH: foot(0.044, 0.013, -0.085, 0, 0, 0),
    pastern: 0.2, hindFlat: 1,
    tailLift: -0.6, tailSide: 0.9, tailCurve: 1.3, tailCurl: 0.2, tailSag: 0.7,
    eyeOpen: 0.6, squint: 0.3, earFwd: 0.1, breath: 0.5,
  }),

  /** lying on the chest with the forelegs out in front, head up */
  sphinx: make({
    hipY: 0.108, hipZ: -0.142, hipPitch: 0.1,
    lumbarPitch: -0.04, chestPitch: -0.1,
    neckPitch: 0.45, headPitch: -0.38,
    LF: foot(0.03, 0.012, 0.19, 0, 0, 0), RF: foot(0.03, 0.012, 0.19, 0, 0, 0),
    LH: foot(0.042, 0.013, -0.06, 0, 0, 0), RH: foot(0.042, 0.013, -0.06, 0, 0, 0),
    pastern: 1.3, hindFlat: 1,
    tailLift: -0.6, tailSide: -0.5, tailCurve: 0.6, tailCurl: 0.2, tailSag: 0.7,
    eyeOpen: 0.8, breath: 0.5,
  }),

  /** flat out on the right side, legs loose on the floor in front of the belly */
  side: make({
    hipY: 0.06, hipZ: -0.14, hipPitch: 0.02, hipRoll: 1.42,
    lumbarPitch: -0.1, lumbarYaw: 0.0, chestRoll: 0.05,
    neckPitch: 0.05, neckYaw: 0.1, headPitch: -0.1, headRoll: -0.35,
    LF: foot(0.08, 0.034, 0.18, 0, 0, 0.25), RF: foot(-0.065, 0.013, 0.17, 0, 0, 0.2),
    LH: foot(0.085, 0.036, -0.26, 0, 0, 0.15), RH: foot(-0.065, 0.013, -0.245, 0, 0, 0.1),
    pastern: 0.9, hindFlat: 0.2,
    tailLift: 0.1, tailSide: 0.5, tailCurve: 0.15, tailCurl: 0.2, tailSag: 1,
    eyeOpen: 0.25, squint: 0.4, earFwd: -0.1, earOut: 0.3, breath: 1,
  }),

  /** curled up asleep on the right side, nose to tail */
  curl: make({
    hipY: 0.064, hipZ: -0.12, hipPitch: 0.0, hipRoll: 1.38, hipYaw: 0.4,
    lumbarPitch: -0.75, lumbarYaw: 0.0, chestPitch: -0.55, chestRoll: 0.05,
    neckPitch: -0.55, neckYaw: 0.15, headPitch: -0.45, headRoll: -0.25,
    LF: foot(0.075, 0.032, 0.05, 0, 0, 0.8), RF: foot(-0.065, 0.013, 0.03, 0, 0, 0.8),
    LH: foot(0.085, 0.034, -0.07, 0, 0, 0.5), RH: foot(-0.07, 0.013, -0.08, 0, 0, 0.5),
    pastern: 0.5, hindFlat: 0.6,
    tailLift: -0.1, tailSide: -1.1, tailCurve: 0.1, tailCurl: -1.7, tailSag: 1,
    eyeOpen: 0, squint: 0, earFwd: -0.15, earOut: 0.2, breath: 0.8,
  }),

  /** low crouch, all four on the floor: eating, sniffing, stalking */
  crouch: make({
    hipY: 0.158, hipZ: -0.142, hipPitch: -0.05,
    chestPitch: -0.05, neckPitch: -0.25, headPitch: -0.2,
    LF: foot(0.034, 0.012, 0.115), RF: foot(0.034, 0.012, 0.115),
    LH: foot(0.04, 0.013, -0.13), RH: foot(0.04, 0.013, -0.13),
    pastern: 0.5, tailLift: -0.15, tailCurve: 0.2, earFwd: 0.5,
  }),

  /** defensive arch: stiff legs, back up, head low, tail bottle-brush */
  arch: make({
    hipY: 0.19, hipPitch: 0.62, lumbarPitch: 0.05, chestPitch: -1.7,
    neckPitch: 0.5, headPitch: 0.2,
    LF: foot(0.04, 0.012, 0.03), RF: foot(0.04, 0.012, 0.03),
    LH: foot(0.042, 0.014, -0.14), RH: foot(0.042, 0.014, -0.14),
    pastern: 0.15, tailLift: 1.3, tailCurve: -0.6, tailCurl: -0.4,
    earFwd: -0.8, earOut: 0.6, earFlat: 1, eyeOpen: 1, pupil: 1, whisker: -1, jaw: 0, puff: 1,
  }),

  /** front stretch: forelegs reaching forward, chest down, rear up */
  stretch: make({
    hipY: 0.225, hipPitch: -0.3, lumbarPitch: -0.15, chestPitch: -0.2,
    neckPitch: 0.35, headPitch: 0.1,
    LF: foot(0.035, 0.012, 0.22), RF: foot(0.035, 0.012, 0.22),
    LH: foot(0.041, 0.013, -0.158), RH: foot(0.041, 0.013, -0.158),
    pastern: 1.2, tailLift: 0.9, tailCurve: -0.3, eyeOpen: 0.35, squint: 0.6, earFwd: -0.2,
  }),
};

export type PoseName = keyof typeof POSES;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** every numeric channel of a pose, for blending */
const SCALARS = Object.keys(BASE).filter((k) => typeof (BASE as unknown as Record<string, unknown>)[k] === 'number') as (keyof Pose)[];
const FOOT_KEYS: (keyof Foot)[] = ['x', 'y', 'z', 'frame', 'planted', 'flex'];

/** Channel groups move on their own schedules in a transition (overlapping action). */
export const GROUPS = {
  hips: ['hipY', 'hipZ', 'hipPitch', 'hipYaw', 'hipRoll', 'lumbarPitch', 'lumbarYaw'],
  chest: ['chestPitch', 'chestYaw', 'chestRoll'],
  head: ['neckPitch', 'neckYaw', 'headPitch', 'headYaw', 'headRoll'],
  front: ['LF', 'RF', 'pastern'],
  hind: ['LH', 'RH', 'hindFlat'],
  tail: ['tailLift', 'tailSide', 'tailCurve', 'tailCurl', 'tailSag'],
  ears: ['earFwd', 'earOut', 'earFlat'],
  face: ['eyeOpen', 'squint', 'pupil', 'whisker', 'jaw', 'breath', 'puff'],
} as const;
export type Group = keyof typeof GROUPS;

export function clonePose(p: Pose): Pose {
  return structuredClone(p);
}

export function copyPose(out: Pose, p: Pose) {
  for (const k of SCALARS) (out[k] as number) = p[k] as number;
  for (const l of LEGS) Object.assign(out[l], p[l]);
  return out;
}

/** out = a..b at t; `t` may differ per group */
export function blendPose(out: Pose, a: Pose, b: Pose, t: number | Record<Group, number>) {
  for (const g of Object.keys(GROUPS) as Group[]) {
    const tg = typeof t === 'number' ? t : t[g];
    for (const k of GROUPS[g]) {
      if (k === 'LF' || k === 'RF' || k === 'LH' || k === 'RH') {
        const fa = a[k], fb = b[k], fo = out[k];
        for (const fk of FOOT_KEYS) fo[fk] = lerp(fa[fk], fb[fk], tg);
      } else {
        (out[k] as number) = lerp(a[k] as number, b[k] as number, tg);
      }
    }
  }
  return out;
}
