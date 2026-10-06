import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Motor } from '../src/cat3d/motor';

describe('out of breath', () => {
  it('a hard run leaves it breathing hard, panting a moment once still, and it gets its breath back', () => {
    const m = new Motor();
    m.snap('stand');
    const dt = 1 / 60;
    // a walk: hardly any
    m.walkTo(new THREE.Vector3(0, 0, 3), 0.25);
    for (let t = 0; t < 6; t += dt) m.update(dt);
    expect(m.exertion).toBeLessThan(0.05);
    // a mad dash back and forth, half a minute of it
    m.zoom = 1;
    let way = -3;
    for (let t = 0; t < 30; t += dt) {
      if (!m.goal) { m.walkTo(new THREE.Vector3(0, 0, way), 1.5); way = -way; }
      m.update(dt);
    }
    expect(m.exertion).toBeGreaterThan(0.75);
    // stopped: the mouth open and the tongue's tip out, a moment
    m.stop();
    m.zoom = 0;
    let jaw = 0, tongue = 0;
    for (let t = 0; t < 3; t += dt) { m.update(dt); jaw = Math.max(jaw, m.pose.jaw); tongue = Math.max(tongue, m.pose.tongue); }
    expect(jaw).toBeGreaterThan(0.05);
    expect(tongue).toBeGreaterThan(0.1);
    // half a minute and more later, it has its breath back, and its mouth shut
    for (let t = 0; t < 45; t += dt) m.update(dt);
    expect(m.exertion).toBeLessThan(0.35);
    expect(m.pose.jaw).toBeLessThan(0.03);
  });
});
