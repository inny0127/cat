import * as THREE from 'three';

/**
 * Dust in a lamp's light: a few dozen motes in the air under it, in the cone of its light and
 * thinning out lower down, drifting slowly, each drawn a single pixel.
 */
export class Dust {
  private readonly all: { pts: THREE.Points; home: Float32Array; seed: Float32Array }[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** motes under a lamp, its colour (paled), as many as it is bright */
  add(at: THREE.Vector3, color: number, power: number) {
    const n = Math.round(18 + 10 * power), home = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 0.7, a = Math.random() * Math.PI * 2, y = -Math.random() * Math.min(1.2, at.y - 0.1);
      home.set([at.x + Math.cos(a) * r * (0.4 - y * 0.5), at.y + y - 0.1, at.z + Math.sin(a) * r * (0.4 - y * 0.5)], i * 3);
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(home.slice(), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), size: 1, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.all.push({ pts, home, seed });
  }

  /** each mote a little way about where it floats, by the clock */
  drift(t: number) {
    for (const D of this.all) {
      const pos = D.pts.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
      for (let i = 0; i < D.seed.length; i++) {
        const s = D.seed[i];
        a[i * 3] = D.home[i * 3] + Math.sin(t * 0.21 + s) * 0.06;
        a[i * 3 + 1] = D.home[i * 3 + 1] + Math.sin(t * 0.13 + s * 1.7) * 0.08;
        a[i * 3 + 2] = D.home[i * 3 + 2] + Math.cos(t * 0.17 + s * 0.6) * 0.06;
      }
      pos.needsUpdate = true;
    }
  }
}
