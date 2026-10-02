import * as THREE from 'three';

/**
 * Cat eyes. The eyeball has a recessed iris seen through a bulging cornea (parallax), a slit
 * pupil that opens into a disc, and a wet highlight darkened under the lids. The lids are part of
 * the furred body (see fur.ts); blinking, squinting and sleepy eyes come from moving their edges.
 */
const EYE_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vViewLocal;
varying vec3 vN;
varying vec3 vView;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  vViewLocal = normalize((inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const EYE_FRAG = /* glsl */ `
uniform float uPupil;      // 0 slit .. 1 round
uniform vec3 uIrisA;       // round the pupil
uniform vec3 uIrisB;       // the body of the iris
uniform vec3 uIrisC;       // toward the rim
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uSkyCol;
uniform float uRadius;
uniform float uUpper;
uniform float uLower;
uniform float uSide;
uniform mat3 uGaze;        // ball frame -> lid frame
varying vec3 vLocal;
varying vec3 vViewLocal;
varying vec3 vN;
varying vec3 vView;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float vn(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }

// the room as the cornea mirrors it: a bright rectangular soft box at the key, a smaller one at the
// fill, pale walls above the horizon and the darker floor below
vec3 env(vec3 r) {
  vec3 c = mix(vec3(0.05, 0.045, 0.04), uSkyCol * 0.9, smoothstep(-0.2, 0.25, r.y));
  vec3 k = normalize(uKeyDir);
  vec3 u = normalize(cross(k, vec3(0.0, 1.0, 0.0)));
  vec3 w = cross(u, k);
  float dk = dot(r, k);
  if (dk > 0.0) {
    vec2 q = vec2(dot(r, u), dot(r, w)) / dk;
    // a soft box with rounded corners
    vec2 bq = max(abs(q) - vec2(0.3, 0.2), 0.0);
    float box = smoothstep(0.12, 0.0, length(bq)) * smoothstep(0.5, 0.3, abs(q.x)) * smoothstep(0.38, 0.22, abs(q.y));
    c += uKeyCol * 14.0 * box;
  }
  c += uFillCol * 6.0 * smoothstep(0.95, 0.98, dot(r, normalize(uFillDir)));
  return c;
}

vec3 irisAt(vec2 ip) {
  float rr = length(ip) / 0.83;
  float th = atan(ip.y, ip.x);
  vec3 c = mix(uIrisA, uIrisB, smoothstep(0.12, 0.5, rr));
  c = mix(c, uIrisC, smoothstep(0.55, 0.95, rr));
  // stroma: fine radial fibres and a few deeper furrows
  float fib = vn(th * 41.0 + rr * 3.0) * 0.45 + vn(th * 97.0 - rr * 7.0) * 0.35 + vn(th * 13.0 + rr * 9.0) * 0.2;
  c *= 0.7 + 0.6 * fib;
  c *= 1.0 - 0.35 * smoothstep(0.75, 0.95, vn(th * 23.0 + 5.0)) * smoothstep(0.25, 0.6, rr);
  // collarette round the pupil zone
  c *= 1.0 + 0.3 * smoothstep(0.06, 0.0, abs(rr - 0.3 - 0.04 * vn(th * 7.0)));
  // dark limbal ring
  c = mix(c, c * 0.22, smoothstep(0.82, 0.99, rr));
  return mix(c, vec3(0.05, 0.035, 0.025), smoothstep(0.99, 1.04, rr));
}

void main() {
  vec3 d = vLocal / uRadius;
  // the iris sits ~35% of the radius behind the cornea: refract the view onto it
  vec3 v = -normalize(vViewLocal);
  vec3 r = refract(v, normalize(d), 1.0 / 1.336);
  float t = (d.z - 0.64) / max(0.15, -r.z);
  vec2 ip = (d + r * max(t, 0.0)).xy;
  vec3 col = irisAt(ip);
  // pupil: a slit in bright light, opening to a disc
  vec2 pr = vec2(0.045 + 0.55 * uPupil, 0.74 - 0.12 * uPupil);
  float pd = length(ip / pr);
  col = mix(col, vec3(0.004), smoothstep(1.12, 0.9, pd));

  vec3 N = normalize(vN), V = normalize(vView);
  // light inside the eye: soft, from the room, shaded by the lids
  vec3 dl = uGaze * d;
  float xo = dl.x * uSide;
  float up = uUpper - 0.9 * dl.x * dl.x + 0.12 * xo;
  float lo = uLower + 0.95 * dl.x * dl.x + 0.16 * xo;
  float shade = mix(0.12, 1.0, smoothstep(0.0, 0.35, up - dl.y)) * mix(0.5, 1.0, smoothstep(0.0, 0.14, dl.y - lo));
  vec3 lightIn = uKeyCol * (0.35 + 0.65 * max(dot(N, uKeyDir), 0.0)) * 0.55 + uSkyCol * 0.6;
  col *= lightIn * shade;
  // the wet cornea mirrors the room
  vec3 R = reflect(-V, N);
  float fres = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col += env(R) * fres * mix(0.35, 1.0, shade);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface CatEye {
  group: THREE.Group;
  ball: THREE.Mesh;
  eyeMat: THREE.ShaderMaterial;
  side: 1 | -1;
}

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export interface EyeLights {
  uKeyDir: { value: THREE.Vector3 }; uKeyCol: { value: THREE.Color };
  uFillDir: { value: THREE.Vector3 }; uFillCol: { value: THREE.Color }; uSkyCol: { value: THREE.Color };
}

export function makeEye(radius: number, side: 1 | -1, lights: EyeLights): CatEye {
  const group = new THREE.Group();
  const uUpper = { value: 0.62 };
  const uLower = { value: -0.5 };
  const uSide = { value: side };
  const eyeMat = new THREE.ShaderMaterial({
    uniforms: {
      uPupil: { value: 0.15 },
      uIrisA: { value: srgb(0.78, 0.72, 0.34) },
      uIrisB: { value: srgb(0.82, 0.58, 0.22) },
      uIrisC: { value: srgb(0.56, 0.36, 0.13) },
      ...lights,
      uRadius: { value: radius },
      uGaze: { value: new THREE.Matrix3() },
      uUpper, uLower, uSide,
    },
    vertexShader: EYE_VERT,
    fragmentShader: EYE_FRAG,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 36), eyeMat);
  group.add(ball);
  return { group, ball, eyeMat, side };
}

/** set openness 0 (shut) .. 1 (wide); squint lifts the lower lid */
/**
 * Set the lids of one eye: open 0 (shut) .. 1 (wide); squint lifts the lower lid. The lids are
 * furred skin drawn by the coat shader, which reads `lids` (left upper/lower, right upper/lower).
 */
export function setLids(e: CatEye, lids: THREE.Vector4, open: number, squint = 0) {
  const o = Math.max(0, Math.min(1, open));
  // the lower lid rises a little as the eye shuts; the upper one comes down to meet it
  const lower = -0.52 + 0.35 * Math.max(0, Math.min(1, squint)) + 0.18 * (1 - o);
  const upper = lower - 0.04 + (0.66 - lower + 0.04) * o;
  e.eyeMat.uniforms.uLower.value = lower;
  e.eyeMat.uniforms.uUpper.value = upper;
  if (e.side > 0) { lids.x = upper; lids.y = lower; } else { lids.z = upper; lids.w = lower; }
}
