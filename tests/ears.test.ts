import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Ears } from '../src/pixel/ears';

const RADIO = new THREE.Vector3(0.6, 0.9, -1.2);
const WINDOW = new THREE.Vector3(0, 1.1, -1.4);

/** the radio playing a song for `secs` (a beat each two-thirds of a second, every fourth one a
 *  kick), the ears listening; what it listens to, sampled each second */
function song(E: Ears, secs: number, fresh = true) {
  const on: (string | null)[] = [];
  const dt = 1 / 60;
  let next = 0, n = 0;
  for (let t = 0; t < secs; t += dt) {
    if (t >= next) {
      E.sound('radio', RADIO, n % 4 === 0 ? 0.6 : 0.4, fresh && n === 0);
      n++;
      next += 0.66;
    }
    E.update(dt);
    if (Math.floor(t + dt) !== Math.floor(t)) on.push(E.on?.id ?? null);
  }
  return on;
}
function quiet(E: Ears, secs: number) {
  for (let t = 0; t < secs; t += 1 / 60) E.update(1 / 60);
}

describe('what it hears', () => {
  it('a song comes on: an ear to the radio at once, and less and less as it goes on; the next song, back to it', () => {
    const E = new Ears();
    const first = song(E, 40);
    // (listened to at first)
    expect(first.slice(0, 6).every((x) => x === 'radio')).toBe(true);
    // (and by the end of it, used to it)
    expect(first.slice(-8).filter((x) => x === 'radio').length).toBeLessThan(3);
    // a moment's crackle and the next song: fresh to it again
    quiet(E, 3);
    const next = song(E, 6, true);
    expect(next.filter((x) => x === 'radio').length).toBeGreaterThan(3);
    // the same song on and on after a quiet that short, not fresh: little of it
    const E2 = new Ears();
    song(E2, 40);
    quiet(E2, 3);
    const same = song(E2, 6, false);
    expect(same.filter((x) => x === 'radio').length).toBeLessThan(2);
  });

  it('a sound out of a quiet flicks an ear; one beat on from another does not', () => {
    const E = new Ears();
    E.sound('radio', RADIO, 0.6);
    expect(E.flick).not.toBeNull();
    E.flick = null;
    for (let i = 0; i < 40; i++) E.update(1 / 60);
    E.sound('radio', RADIO, 0.6);
    expect(E.flick).toBeNull();
  });

  it('rain getting up on the glass: listened to; rain that only goes on, a while, not', () => {
    const E = new Ears();
    let early = 0, late = 0;
    for (let t = 0; t < 90; t += 1 / 60) {
      const rain = Math.min(0.8, t / 3);
      E.level('rain', WINDOW, rain, 1 / 60);
      E.update(1 / 60);
      if (t < 8 && E.on?.id === 'rain') early += 1 / 60;
      if (t > 75 && E.on?.id === 'rain') late += 1 / 60;
    }
    expect(early).toBeGreaterThan(5);
    expect(late).toBeLessThan(3);
  });

  it('listening to the radio, a knock somewhere louder has the ear; then back', () => {
    const E = new Ears();
    song(E, 3);
    expect(E.on?.id).toBe('radio');
    E.sound('knock', new THREE.Vector3(-1, 0, 0), 1);
    for (let i = 0; i < 10; i++) E.update(1 / 60);
    expect(E.on?.id).toBe('knock');
  });
});
