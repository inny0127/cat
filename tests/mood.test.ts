import { describe, it, expect } from 'vitest';
import { NEUTRAL, MOODS, eyesFor, moodFromBrain, type Mood } from '../src/cat3d/mood';
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
