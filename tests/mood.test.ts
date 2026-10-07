import { describe, it, expect } from 'vitest';
import { NEUTRAL, MOODS, bodyFor, eyesFor, lightOfLum, lumOfLight, moodFromBrain, type Mood } from '../src/cat3d/mood';
import { POSES } from '../src/cat3d/pose';

const eyes = (m: Partial<Mood>) => eyesFor({ ...NEUTRAL, ...m });
const calm = eyesFor(NEUTRAL);

describe('feelings in the eyes', () => {
  it('a calm cat has the standing pose\'s own face', () => {
    expect(calm.open).toBeCloseTo(POSES.stand.eyeOpen, 2);
    expect(calm.squint).toBeCloseTo(POSES.stand.squint, 2);
    expect(calm.pupil).toBeCloseTo(POSES.stand.pupil, 2);
    expect(calm.shine).toBe(1);
    expect(calm.slowBlinkEvery).toBe(0);
  });

  it('fear floods the pupils and opens the eyes', () => {
    const e = eyes(MOODS.scared);
    expect(e.pupil).toBeGreaterThan(0.9);
    expect(e.open).toBeGreaterThan(calm.open);
  });

  it('anger narrows the eyes and shuts the pupils to slits; the defensive hiss keeps them wide', () => {
    const a = eyes(MOODS.angry);
    expect(a.pupil).toBeLessThan(0.35);
    expect(a.open).toBeLessThan(calm.open - 0.15);
    expect(a.squint).toBeGreaterThan(calm.squint + 0.2);
    expect(eyes(MOODS.hiss).pupil).toBeGreaterThan(calm.pupil);
  });

  it('contentment softens the eyes, and with trust brings slow blinks', () => {
    const h = eyes(MOODS.happy);
    expect(h.open).toBeLessThan(0.65);
    expect(h.squint).toBeGreaterThan(0.25);
    expect(h.slowBlinkEvery).toBeGreaterThan(0);
    expect(eyes({ pleasure: 0.9, trust: -0.8 }).slowBlinkEvery).toBe(0);
  });

  it('excitement opens the pupils, light closes them, illness dulls the eyes', () => {
    expect(eyes(MOODS.playful).pupil).toBeGreaterThan(eyes(MOODS.curious).pupil);
    expect(eyes(MOODS.curious).pupil).toBeGreaterThan(calm.pupil);
    expect(eyes({ light: 1 }).pupil).toBeLessThan(eyes({ light: 0 }).pupil);
    expect(eyes(MOODS.sick).shine).toBeLessThan(0.5);
    expect(eyes(MOODS.sleepy).open).toBeLessThan(0.5);
  });

  it('reads the brain', () => {
    const b = { mode: 'enjoy', pleasure: 0.8, irritation: 0, fear: 0, arousal: 0, sleepDepth: 0 };
    const m = moodFromBrain(b, 0, 0.7, 0.2);
    expect(m.pleasure).toBeGreaterThan(0.9);
    expect(eyesFor(m).slowBlinkEvery).toBeGreaterThan(0);
    const angry = moodFromBrain({ ...b, mode: 'angry', pleasure: 0, irritation: 0.7 }, 0, -0.3, 0);
    expect(eyesFor(angry).pupil).toBeLessThan(calm.pupil);
    expect(moodFromBrain({ ...b, mode: 'rest' }, 0, 0, 1).light).toBeLessThan(0.2);
  });
});

const body = (m: Partial<Mood>) => bodyFor({ ...NEUTRAL, ...m });

describe('the light in its eyes', () => {
  it('as bright as what it looks at: a room by day, by the lamp at night, a sunlit window; and back again', () => {
    expect(lightOfLum(0.25)).toBeCloseTo(0.7, 1);
    expect(lightOfLum(0.09)).toBeCloseTo(0.3, 1);
    expect(lightOfLum(0.8)).toBe(1);
    expect(lightOfLum(0.01)).toBe(0);
    for (const x of [0.1, 0.3, 0.5, 0.7, 0.9]) expect(lightOfLum(lumOfLight(x))).toBeCloseTo(x, 5);
    // (looking at the window by day, narrower pupils than at the room; into the dark, wider)
    const at = (lum: number) => eyesFor({ ...NEUTRAL, light: lightOfLum(lum) }).pupil;
    expect(at(0.6)).toBeLessThan(at(0.25) - 0.1);
    expect(at(0.05)).toBeGreaterThan(at(0.25) + 0.1);
  });
});

describe('feelings in the body', () => {
  it('a calm cat holds its posture as it is', () => {
    const b = bodyFor(NEUTRAL);
    for (const [k, v] of Object.entries(b)) expect(v, k).toBeCloseTo(['tailWaveSpeed', 'breathRate', 'earFlicks'].includes(k) ? 1 : 0, 6);
  });

  it('fear: ears flattened, tail tucked, fur up, quick breaths', () => {
    const b = body(MOODS.scared);
    expect(b.earFlat).toBeGreaterThan(0.6);
    expect(b.tailLift).toBeLessThan(-0.6);
    expect(b.puff).toBeGreaterThan(0.5);
    expect(b.breathRate).toBeGreaterThan(1.5);
  });

  it('the hiss: bottle-brush fur, the mouth open; anger: ears back and a lashing tail', () => {
    const h = body(MOODS.hiss);
    expect(h.puff).toBeGreaterThan(0.8);
    expect(h.jaw).toBeGreaterThan(0.15);
    const a = body(MOODS.angry);
    expect(a.earFwd).toBeLessThan(-0.3);
    expect(a.earOut).toBeGreaterThan(0.4);
    expect(a.tailWave).toBeGreaterThan(0.5);
    expect(a.tailWaveSpeed).toBeGreaterThan(2);
    expect(body(MOODS.annoyed).earFlicks).toBeGreaterThan(2);
  });

  it('a happy cat that trusts you carries its tail up with a hook, and breathes slow', () => {
    const b = body(MOODS.happy);
    expect(b.tailLift).toBeGreaterThan(0.5);
    expect(b.tailHook).toBeGreaterThan(0.3);
    expect(b.breathRate).toBeLessThan(1);
    expect(body({ pleasure: 0.9, trust: -0.8 }).tailLift).toBeLessThan(0.1);
    expect(body(MOODS.curious).earFwd).toBeGreaterThan(0.2);
  });
});
