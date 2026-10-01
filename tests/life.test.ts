import { describe, expect, it } from 'vitest';
import { newCat } from '../src/sim/state';
import { stepLife, needs, THRESH } from '../src/sim/life';
import { forecast } from '../src/sim/forecast';

const H = 3600_000;
const T0 = new Date('2026-10-01T09:00:00').getTime();

describe('life', () => {
  it('a cat with full bowls stays healthy for a day', () => {
    const s = newCat(T0);
    s.food = 1;
    s.water = 1;
    s.litter = 0;
    stepLife(s, 24 * H, true);
    expect(s.alive).toBe(true);
    expect(s.health).toBeGreaterThan(0.9);
  });

  it('complete neglect makes it sick, then kills it within about four days', () => {
    const s = newCat(T0);
    let sickAt = 0;
    let diedAt = 0;
    for (let h = 0; h < 8 * 24; h++) {
      const ev = stepLife(s, H, true);
      if (!sickAt && ev.some((e) => e.kind === 'sick')) sickAt = h;
      if (!diedAt && ev.some((e) => e.kind === 'died')) diedAt = h;
    }
    expect(sickAt).toBeGreaterThan(40);
    expect(diedAt).toBeGreaterThan(sickAt);
    expect(diedAt).toBeGreaterThan(80);
    expect(diedAt).toBeLessThan(130);
    expect(s.alive).toBe(false);
  });

  it('feeding a sick cat lets it recover', () => {
    const s = newCat(T0);
    s.food = 0;
    s.water = 0;
    stepLife(s, 45 * H, true);
    expect(s.health).toBeLessThan(THRESH.sick + 0.2);
    s.food = 1;
    s.water = 1;
    stepLife(s, 30 * H, true);
    expect(s.alive).toBe(true);
    expect(s.health).toBeGreaterThan(0.8);
  });

  it('asks for food once the bowl is empty and it is hungry', () => {
    const s = newCat(T0);
    s.food = 0;
    s.hunger = 0.7;
    expect(needs(s).food).toBe(true);
  });

  it('a dirty box makes it go elsewhere and lose trust', () => {
    const s = newCat(T0);
    s.litter = 0.97;
    s.bladder = 0.99;
    const trust = s.trust;
    const ev = stepLife(s, 10 * 60_000, true);
    expect(ev.some((e) => e.kind === 'accident')).toBe(true);
    expect(s.trust).toBeLessThan(trust);
  });
});

describe('forecast', () => {
  it('plans a hunger notification, outside quiet hours', () => {
    const s = newCat(T0);
    s.food = 0.05;
    s.trust = 0.5;
    const plan = forecast(s, T0);
    const food = plan.find((p) => p.kind === 'food');
    expect(food).toBeTruthy();
    const h = new Date(food!.at).getHours();
    expect(h >= 8 && h < 23).toBe(true);
    expect(plan.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < plan.length; i++) expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at);
  });

  it('a trusting cat left alone calls for you', () => {
    const s = newCat(T0);
    s.trust = 0.6;
    s.food = 1;
    s.water = 1;
    expect(forecast(s, T0).some((p) => p.kind === 'call')).toBe(true);
  });

  it('a wary cat does not', () => {
    const s = newCat(T0);
    s.trust = -0.3;
    s.food = 1;
    s.water = 1;
    expect(forecast(s, T0).some((p) => p.kind === 'call')).toBe(false);
  });
});

describe('timeline', () => {
  it('reports when neglect turns serious', () => {
    const s = newCat(T0);
    const marks: string[] = [];
    for (let h = 0; h < 8 * 24 && s.alive; h++) {
      for (const e of stepLife(s, H, true)) if (e.kind === 'sick' || e.kind === 'died') marks.push(`${e.kind}@${h}h`);
    }
    console.log('neglect timeline:', marks.join(', '));
    expect(marks.length).toBe(2);
  });
});
