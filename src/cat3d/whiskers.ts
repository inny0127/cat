import * as THREE from 'three';

/**
 * Whiskers: tapered white tubes in rows on the whisker pads, a few above each eye. Real whiskers
 * are thinner than a pixel at most distances, so each tube is kept at least half a pixel wide and
 * made correspondingly transparent. Each vertex remembers its root so the whole fan can swing
 * forward (curious) or flatten back (afraid).
 */
export interface Whiskers {
  mesh: THREE.Mesh;
  /** -1 pressed back .. 0 relaxed .. 1 pushed forward */
  setSpread(v: number): void;
  /** world size of one screen pixel at 1 m from the camera */
  setPixel(px: number): void;
}

export function makeWhiskers(padL: THREE.Vector3, padR: THREE.Vector3, eyeL: THREE.Vector3, eyeR: THREE.Vector3): Whiskers {
  const pos: number[] = [];
  const ofs: number[] = [];
  const rad: number[] = [];
  const root: number[] = [];
  const tt: number[] = [];
  const side: number[] = [];
  const idx: number[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const add = (start: THREE.Vector3, dir: THREE.Vector3, len: number, droop: number, r0: number, sx: number, sway: number) => {
    const seg = 14, sides = 3;
    const base = pos.length / 3;
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(), tan = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      // out along dir, sagging under its own weight, the tip swinging back a little
      p.copy(start).addScaledVector(dir, len * t);
      p.y -= droop * t * t;
      p.z -= sway * t * t;
      tan.copy(dir).multiplyScalar(len).add(new THREE.Vector3(0, -2 * droop * t, -2 * sway * t)).normalize();
      n1.crossVectors(tan, up).normalize();
      n2.crossVectors(tan, n1).normalize();
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        pos.push(p.x, p.y, p.z);
        ofs.push(n1.x * Math.cos(a) + n2.x * Math.sin(a), n1.y * Math.cos(a) + n2.y * Math.sin(a), n1.z * Math.cos(a) + n2.z * Math.sin(a));
        rad.push(r0 * (1 - t * 0.85));
        root.push(start.x, start.y, start.z);
        tt.push(t);
        side.push(sx);
      }
    }
    for (let i = 0; i < seg; i++)
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k, b = base + i * sides + ((k + 1) % sides);
        const c = a + sides, d = b + sides;
        idx.push(a, c, b, b, c, d);
      }
  };
  for (const [pad, sx] of [[padL, 1], [padR, -1]] as const) {
    // four rows on the pad; the upper rows longest, the front ones shorter
    for (let row = 0; row < 4; row++) {
      const count = row === 0 ? 3 : 4;
      for (let j = 0; j < count; j++) {
        const elev = 0.22 - row * 0.17 + (rnd() - 0.5) * 0.07;
        const fan = 0.35 + j * 0.16 + row * 0.04 + (rnd() - 0.5) * 0.08;   // angle back from straight ahead
        const dir = new THREE.Vector3(sx * Math.sin(fan + 0.55), Math.sin(elev), Math.cos(fan + 0.55) * 0.9).normalize();
        const start = pad.clone().add(new THREE.Vector3(sx * (0.0006 * j), 0.0024 - row * 0.0017, -j * 0.0019 - row * 0.0006));
        const len = (0.064 - row * 0.007 - (count - 1 - j) * 0.004) * (0.92 + rnd() * 0.16);
        add(start, dir, len, 0.006 + rnd() * 0.006 + row * 0.002, 0.00011, sx, 0.004 + rnd() * 0.006);
      }
    }
  }
  for (const [eye, sx] of [[eyeL, 1], [eyeR, -1]] as const) {
    for (let j = 0; j < 4; j++) {
      const dir = new THREE.Vector3(sx * (0.3 + j * 0.14), 0.88, 0.3 - j * 0.1).normalize();
      add(eye.clone().add(new THREE.Vector3(sx * (-0.002 + j * 0.0022), 0.0118, 0.006 - j * 0.0012)), dir, 0.021 + j * 0.0045, 0.004, 0.00008, sx, 0.006);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('ofs', new THREE.Float32BufferAttribute(ofs, 3));
  g.setAttribute('rad', new THREE.Float32BufferAttribute(rad, 1));
  g.setAttribute('root', new THREE.Float32BufferAttribute(root, 3));
  g.setAttribute('t', new THREE.Float32BufferAttribute(tt, 1));
  g.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  const uSpread = { value: 0 };
  const uPx = { value: 0.001 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSpread, uPx },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 ofs; attribute float rad; attribute vec3 root; attribute float t; attribute float side;
      uniform float uSpread;
      uniform float uPx;
      varying float vt;
      varying float vA;
      vec3 swing(vec3 o, float a) { return vec3(o.x * cos(a) + o.z * sin(a), o.y, -o.x * sin(a) + o.z * cos(a)); }
      void main() {
        vt = t;
        // swing about a vertical axis through the root: forward (+) or back (-)
        float a = -uSpread * 0.55 * side;
        vec3 c = root + swing(position - root, a) + vec3(0.0, uSpread * 0.006 * t, 0.0);
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        // never thinner than half a pixel; fade instead
        float r = max(rad, 0.5 * uPx * -mv.z);
        vA = rad / r;
        mv.xyz += normalize(normalMatrix * swing(ofs, a)) * r;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vt;
      varying float vA;
      void main() {
        vec3 c = mix(vec3(0.93, 0.9, 0.86), vec3(0.99, 0.98, 0.96), smoothstep(0.0, 0.3, vt));
        gl_FragColor = vec4(c * mix(0.88, 1.0, vt), vA * (1.0 - smoothstep(0.75, 1.0, vt) * 0.6));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  return {
    mesh,
    setSpread: (v: number) => { uSpread.value = v; },
    setPixel: (px: number) => { uPx.value = px; },
  };
}
