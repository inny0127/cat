/**
 * What the cat feels, and what that does to its eyes. The brain (sim/brain.ts) keeps fast emotions
 * and a state; this turns them into how far the lids open, how high the lower lid rises, how wide
 * the pupils are and how bright the eyes look, the way a real cat's eyes give it away:
 * - content, or with someone it trusts: soft, half-shut eyes, and slow blinks
 * - curious, playful: wide eyes, the pupils opening up as the excitement grows
 * - frightened (the defensive hiss too): wide eyes, the pupils flooding to round black
 * - annoyed, angry (the offensive stare): narrowed eyes, the pupils shut down to slits
 * - drowsy: heavy lids and slow, long blinks; ill: half-shut, dull eyes
 * - and light: slits in sunshine, wide pupils at night.
 */
export interface Mood {
  /** contentment, affection: 0..1 */
  pleasure: number;
  /** annoyance .. anger: 0..1 */
  irritation: number;
  fear: number;
  /** interest .. excitement (play, the hunt): 0..1 */
  arousal: number;
  sleepy: number;
  sick: number;
  /** toward the one watching: -1 afraid of you .. 1 adores you */
  trust: number;
  /** 0 dark .. 1 bright sunshine */
  light: number;
}

export const NEUTRAL: Mood = { pleasure: 0, irritation: 0, fear: 0, arousal: 0, sleepy: 0, sick: 0, trust: 0, light: 0.5 };

/** named feelings, for scripts and the lab (?mood=) */
export const MOODS = {
  neutral: {},
  content: { pleasure: 0.55, trust: 0.5 },
  happy: { pleasure: 0.9, trust: 0.85 },
  curious: { arousal: 0.45 },
  playful: { arousal: 0.95 },
  scared: { fear: 0.95 },
  hiss: { fear: 0.75, irritation: 0.8 },
  annoyed: { irritation: 0.5 },
  angry: { irritation: 0.95 },
  sleepy: { sleepy: 0.85, pleasure: 0.3 },
  sick: { sick: 0.85 },
} satisfies Record<string, Partial<Mood>>;
export type MoodName = keyof typeof MOODS;

export interface EyeLook {
  /** how far the lids open, 0 shut .. 1 wide */
  open: number;
  /** the lower lid lifting */
  squint: number;
  /** 0 slit .. 1 round */
  pupil: number;
  /** how much light the eye gives back: 1 bright and wet .. 0 dull */
  shine: number;
  /** seconds between slow blinks (the cat's "I trust you"); 0 none */
  slowBlinkEvery: number;
  /** how long an ordinary blink takes, seconds */
  blinkTime: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** the eyes a feeling gives a cat that is awake and at ease in its body */
export function eyesFor(m: Mood): EyeLook {
  const calm = 1 - m.fear;
  // light first: the pupil's resting width, then feelings open or close it from there
  const rest = 0.87 - 0.5 * m.light;
  let pupil = rest;
  pupil += (1 - pupil) * (0.8 * m.fear + 0.55 * m.arousal);
  pupil -= pupil * 0.6 * m.irritation * calm;
  pupil -= 0.06 * m.pleasure;
  const open = 0.95 - 0.42 * m.pleasure - 0.6 * m.sleepy - 0.32 * m.sick - 0.24 * m.irritation * calm + 0.05 * (m.fear + m.arousal);
  const squint = 0.03 + 0.3 * m.pleasure + 0.32 * m.irritation * calm + 0.25 * m.sick;
  const fondness = clamp01((m.pleasure - 0.2) / 0.6) * clamp01((m.trust + 0.1) / 0.6) * calm;
  return {
    open: clamp01(open),
    squint: clamp01(squint),
    pupil: clamp01(pupil),
    shine: clamp01(1 - 0.65 * m.sick - 0.2 * m.sleepy),
    slowBlinkEvery: fondness > 0.05 ? 14 - 8 * fondness : 0,
    blinkTime: 0.2 + 0.25 * m.sleepy + 0.1 * m.sick,
  };
}

/** what a feeling does to the rest of the body, as changes to the posture's own (0: none) */
export interface BodyLook {
  earFwd: number;
  earOut: number;
  earFlat: number;
  whisker: number;
  tailLift: number;
  tailCurve: number;
  tailCurl: number;
  tailHook: number;
  tailSag: number;
  /** fur on end */
  puff: number;
  /** mouth open (the hiss) */
  jaw: number;
  /** the upper lip drawn up off the fangs */
  snarl: number;
  /** nose up (+) or down */
  headPitch: number;
  /** how deep the breathing is */
  breath: number;
  /** the tail's sway: added amplitude, and how many times faster */
  tailWave: number;
  tailWaveSpeed: number;
  /** breathing, times faster */
  breathRate: number;
  /** ear flicks, times more often */
  earFlicks: number;
}

/**
 * The rest of the body, read as a cat reads another: ears forward for interest, a little out and
 * easy when content, swivelled back and out when annoyed, flattened sideways in fear and pinned
 * back for the hiss; whiskers forward when keen, pulled back when afraid or cross; the tail up with
 * a hook for a friend, low and tucked in fear, bottle-brush for the hiss, twitching when annoyed
 * and lashing in anger, low and limp when ill; fur standing on end, the mouth open to hiss; quick
 * shallow breaths in fear, slow deep ones at ease.
 */
export function bodyFor(m: Mood): BodyLook {
  const calm = 1 - m.fear;
  const threat = m.fear * m.irritation;          // afraid and ready to fight: the defensive hiss
  const cross = m.irritation * calm;             // annoyed and sure of itself
  const scared = m.fear * (1 - m.irritation);    // plain fear: make itself small
  const friendly = m.pleasure * clamp01((m.trust + 0.3) / 0.8);
  return {
    earFwd: 0.55 * m.arousal - 0.12 * m.pleasure - 0.55 * m.fear - 0.45 * cross - 0.25 * m.sick - 0.15 * m.sleepy,
    earOut: 0.25 * m.pleasure + 0.5 * m.fear + 0.6 * cross + 0.35 * m.sick + 0.2 * m.sleepy,
    earFlat: 0.8 * m.fear + 0.25 * cross,
    whisker: 0.8 * m.arousal - 0.25 * m.pleasure - 0.9 * m.fear - 0.6 * cross - 0.3 * m.sick,
    tailLift: 0.75 * friendly + 0.3 * m.arousal - 1.0 * scared + 0.6 * threat - 0.2 * cross - 0.5 * m.sick,
    tailCurve: -0.35 * friendly + 0.35 * scared,
    tailCurl: 0,
    tailHook: 0.7 * friendly + 0.2 * m.arousal,
    tailSag: 0.5 * m.sick + 0.3 * m.sleepy,
    puff: 0.65 * m.fear + 0.6 * threat + 0.15 * cross,
    jaw: Math.min(1, 1.5 * threat),
    snarl: Math.min(1, 1.2 * threat + 0.25 * cross),
    headPitch: -0.25 * scared - 0.2 * m.sick + 0.1 * m.arousal,
    breath: 0.2 * m.pleasure - 0.15 * m.fear + 0.15 * m.sleepy,
    tailWave: 0.35 * cross + 0.45 * cross * cross + 0.25 * m.arousal - 0.08 * m.sleepy - 0.06 * m.pleasure,
    tailWaveSpeed: 1 + 1.6 * cross + 0.8 * m.arousal - 0.4 * m.sleepy - 0.3 * m.pleasure,
    breathRate: 1 + 0.9 * m.fear + 0.6 * cross + 0.3 * m.arousal - 0.25 * m.pleasure - 0.3 * m.sleepy,
    earFlicks: 1 + 3 * cross + 1.5 * m.fear,
  };
}

/**
 * The brain's view of the cat (sim/brain.ts: its fast emotions, its mode, how ill it is and how
 * much it trusts you) as a Mood. `sick` is 0..1 as the brain works it out; `night` 0 day .. 1 night.
 */
export function moodFromBrain(
  b: { mode: string; pleasure: number; irritation: number; fear: number; arousal: number; sleepDepth: number },
  sick: number, trust: number, night: number,
): Mood {
  const dozy = b.mode === 'sleep' || b.mode === 'doze' ? Math.max(0.5, b.sleepDepth) : b.mode === 'rest' ? 0.25 : 0;
  return {
    pleasure: clamp01(b.pleasure + (b.mode === 'enjoy' ? 0.2 : 0)),
    irritation: clamp01(b.irritation + (b.mode === 'angry' ? 0.4 : b.mode === 'annoyed' ? 0.15 : 0)),
    fear: clamp01(b.fear),
    arousal: clamp01(b.arousal + (b.mode === 'alert' ? 0.25 : 0)),
    sleepy: clamp01(dozy),
    sick: clamp01(sick),
    trust,
    light: 0.7 - 0.55 * night,
  };
}
