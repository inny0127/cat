import * as THREE from 'three';
import { GRADE_GLSL } from './grade';

/**
 * Cat eyes. The eyeball has a recessed iris seen through a bulging cornea (parallax), a slit
 * pupil that opens into a disc, and a wet highlight darkened under the lids. The lids are part of
 * the furred body (see fur.ts); blinking, squinting and sleepy eyes come from moving their edges.
 */
/**
 * The eye opening, in the eye's frame (units of the eyeball radius; +z out of the eye): an almond
 * whose corners lie on a line tilted so the inner corner sits lower, toward the nose. ul holds the
 * upper and lower lid heights at the middle; xo is x measured toward the outer corner. Shared by
 * the eyeball (for lid shadows) and the coat shader (which cuts the opening in the lids).
 */
export const LID_GLSL = /* glsl */ `
const float LID_XC = 0.62;
vec2 lidCurves(float x, float xo, vec2 ul) {
  // a round eye whose inner corner draws out to a point, down toward the nose; the big eyeball
  // shows only through this opening
  float u = xo / LID_XC;
  float cy = -0.02 + 0.08 * u;
  float e = max(0.0, 1.0 - u * u);
  float inner = max(-u, 0.0);
  float fu = pow(e, 0.45 + 0.35 * inner) * (1.0 + 0.06 * u);
  float fl = pow(e, 0.5 + 0.45 * inner);
  return vec2(cy + (ul.x + 0.03) * fu, cy + (ul.y + 0.03) * fl);
}
`;

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
${LID_GLSL}
uniform float uPupil;      // 0 slit .. 1 round
uniform float uShine;      // 1 bright, wet eyes .. 0 dull (an ill cat)
uniform float uFlat;       // pixel art: a flat iris and a pupil wide enough to survive the low resolution
uniform vec3 uIrisA;       // round the pupil
uniform vec3 uIrisB;       // the body of the iris
uniform vec3 uIrisC;       // toward the rim
uniform vec3 uFleck;       // bright flecks in the stroma
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
uniform float uOwnLids;    // a model with plain sockets: the eye draws its own lids over the ball
uniform vec3 uLidCol;      // ... in the skin round the eye
uniform vec2 uLidScale;    // ... and leaves an opening this much wider and taller than the coat's lids
uniform sampler2D uLidMap; // ... or in the model's painted coat, where it maps onto the lids:
uniform vec3 uLidU;        //     u = dot(uLidU, (x, y, 1)) in the lid frame, v likewise
uniform vec3 uLidV;
uniform float uLidTex;
${GRADE_GLSL}
varying vec3 vLocal;
varying vec3 vViewLocal;
varying vec3 vN;
varying vec3 vView;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) { return vn2(p) * 0.5 + vn2(p * 2.07 + 3.1) * 0.3 + vn2(p * 4.3 + 7.7) * 0.2; }

// the room as the cornea mirrors it: a bright soft box at the key, a smaller one at the fill,
// pale walls above the horizon and the darker floor below
vec3 env(vec3 r) {
  vec3 c = mix(vec3(0.04, 0.035, 0.03), uSkyCol * 0.8, smoothstep(-0.25, 0.3, r.y));
  vec3 k = normalize(uKeyDir);
  vec3 u = normalize(cross(k, vec3(0.0, 1.0, 0.0)));
  vec3 w = cross(u, k);
  float dk = dot(r, k);
  if (dk > 0.0) {
    vec2 q = vec2(dot(r, u), dot(r, w)) / dk;
    vec2 bq = max(abs(q) - vec2(0.3, 0.2), 0.0);
    c += uKeyCol * 3.0 * smoothstep(0.25, 0.0, length(bq));
  }
  c += uFillCol * 5.0 * smoothstep(0.96, 0.985, dot(r, normalize(uFillDir)));
  return c;
}

// the iris: amber deepening toward a dark limbal ring, mottled with golden flecks and fine
// radial fibres (ip in units of the ball radius; the limbus is at 0.77)
vec3 irisAt(vec2 ip) {
  float rr = length(ip) / 0.77;
  vec2 dir = ip / max(length(ip), 1e-4);
  vec3 c = mix(uIrisA, uIrisB, smoothstep(0.15, 0.55, rr));
  c = mix(c, uIrisC, smoothstep(0.55, 0.95, rr));
  // radial fibres and crypts: noise that varies round the circle far more than along the radius
  float fib = fbm2(dir * 15.0 + vec2(rr * 1.2, 0.0));
  float fib2 = fbm2(dir * 41.0 + vec2(0.0, rr * 2.5));
  c *= 0.78 + 0.3 * fib + 0.18 * fib2;
  // the collarette: a paler, wavy ring part-way out, with the gold flecks gathered inside it
  float coll = smoothstep(0.06, 0.0, abs(rr - 0.42 - 0.05 * (fib - 0.5)));
  float fl = fbm2(ip * 52.0);
  float inner = smoothstep(0.55, 0.3, rr);
  c = mix(c, uFleck, smoothstep(0.52, 0.7, fl) * (0.25 + 0.5 * inner) * smoothstep(0.98, 0.6, rr));
  c = mix(c, uFleck * 0.9, coll * 0.2 * smoothstep(0.35, 0.7, fbm2(dir * 9.0 + 3.0)));
  c *= 0.88 + 0.24 * fbm2(ip * 120.0 + 11.0);
  // the iris sinks toward its rim, darkening into the limbal ring
  c *= mix(1.0, 0.6, smoothstep(0.8, 0.97, rr));
  c = mix(c, vec3(0.05, 0.03, 0.01), smoothstep(0.94, 1.02, rr));
  return mix(c, vec3(0.045, 0.03, 0.02), smoothstep(1.0, 1.05, rr));
}

// a painted model's own lids: level corners and a rounder upper lid, a gentle face rather than the
// sharp upswept almond (a slant at the outer corner reads as a glare); the same size of opening
vec2 lidCurvesSoft(float xo, vec2 ul) {
  float u = xo / LID_XC;
  float e = max(0.0, 1.0 - u * u);
  float inner = max(-u, 0.0);
  float cy = -0.02 + 0.015 * u;
  // wide open the upper lid is a round dome; as it comes down it keeps an arc (it slides over a
  // ball) instead of flattening into a bar
  float fu = pow(e, 0.4 + 0.3 * clamp((0.5 - ul.x) / 0.6, 0.0, 1.0) + 0.25 * inner);
  float fl = pow(e, 0.55 + 0.35 * inner);
  return vec2(cy + (ul.x + 0.03) * fu, cy + (ul.y + 0.03) * fl);
}

// the lid skin over the ball (dl: lid frame), lit as the painted coat is (skin.ts)
vec3 lidSkin(vec3 N, vec3 dl) {
  vec3 col = uLidCol;
  if (uLidTex > 0.5) col = texture2D(uLidMap, vec2(dot(uLidU, vec3(dl.xy, 1.0)), dot(uLidV, vec3(dl.xy, 1.0)))).rgb;
  if (uFlat > 0.5) return gradePaint(col) * mix(0.64, 1.0, smoothstep(0.3, 0.6, dot(N, uKeyDir) * 0.5 + 0.5)) * 0.87;
  float wrap = clamp((dot(N, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
  return col * (uKeyCol * 0.3183 * wrap + uFillCol * 0.3183 * max(dot(N, uFillDir), 0.0) + uSkyCol * 1.4);
}

void main() {
  vec3 d = vLocal / uRadius;
  // own lids: how far inside the opening (units of the ball radius; < 0 under a lid), and the line
  // where the lids meet once they are (nearly) shut
  // the lid's dark margin: about an art pixel in pixel art
  float rim = uFlat > 0.5 ? 0.16 : 0.07;
  float lidIn = 1.0;
  bool seam = false;
  vec3 dlo = uGaze * d;
  // the upper lid's edge is a dark line; the lower lid's is finer and browner
  vec3 rimCol = vec3(0.02, 0.012, 0.008);
  if (uOwnLids > 0.5) {
    float xs = dlo.x / uLidScale.x;
    vec2 lco = lidCurvesSoft(xs * uSide, vec2(uUpper, uLower)) * uLidScale.y;
    float inU = lco.x - dlo.y, inL = dlo.y - lco.y;
    lidIn = min(inU, inL);
    float u = xs * uSide / LID_XC;
    seam = lco.x - lco.y < rim && abs(dlo.y - 0.5 * (lco.x + lco.y)) < rim * 0.7 && abs(u) < 0.92;
    if (!seam && inL < inU && lidIn >= 0.0) {
      lidIn = lidIn * 2.0;
      rimCol = vec3(0.09, 0.05, 0.035);
    }
  }
  // the iris sits ~35% of the radius behind the cornea: refract the view onto it
  vec3 v = -normalize(vViewLocal);
  vec3 r = refract(v, normalize(d), 1.0 / 1.336);
  float t = (d.z - 0.64) / max(0.15, -r.z);
  vec2 ip = (d + r * max(t, 0.0)).xy;
  vec3 col = irisAt(ip);
  // pupil: a spindle-shaped slit in bright light (two arcs meeting in points), opening to a disc
  float hh = mix(0.72, 0.6, uPupil);
  float pw = min(mix(0.028, 0.6, pow(uPupil, 1.4)), hh);
  float rho = (hh * hh + pw * pw) / (2.0 * pw);
  float pd = length(vec2(abs(ip.x) + rho - pw, ip.y)) - rho;    // < 0 inside
  float edge = 0.012 + 0.01 * uPupil;
  col = mix(col, col * 0.45, smoothstep(edge * 3.0, 0.0, pd));    // the iris darkens into the pupil rim
  col = mix(col, vec3(0.006, 0.006, 0.008), smoothstep(edge, -edge, pd));
  if (uFlat > 0.5) {
    // pixel art: the iris lighter round the pupil, shaded under the upper lid and darker at its
    // rim; an upright oval pupil and a small square highlight
    float rr = length(ip) / 0.77;
    vec3 iris = mix(uIrisA * 1.45, uIrisB * 1.2, smoothstep(0.25, 0.9, rr));
    iris *= mix(0.62, 1.0, smoothstep(0.3, -0.15, ip.y));
    iris = mix(iris, uIrisC * 0.9, smoothstep(0.82, 0.98, rr));
    vec2 q = ip / vec2(0.15 + 0.26 * uPupil, 0.46 + 0.1 * uPupil);
    float pupil = step(length(q), 1.0);
    vec2 gq = abs(ip - vec2(-0.2, 0.22));
    vec2 gq2 = abs(ip - vec2(0.2, -0.2));
    float glint = max(step(max(gq.x, gq.y), 0.12) * step(0.3, uShine), step(max(gq2.x, gq2.y), 0.05) * step(0.75, uShine));
    vec3 c = mix(iris, vec3(0.004), pupil);
    c = mix(c, vec3(1.0), glint);
    if (lidIn < rim) c = lidIn < 0.0 && !seam ? lidSkin(normalize(vN), dlo) : rimCol;
    // alpha 0.75 tells the pixel pass to use the eyes' palette; lids are coat
    gl_FragColor = vec4(c, lidIn < rim ? 1.0 : 0.75);
    return;
  }

  vec3 N = normalize(vN), V = normalize(vView);
  // in the lid's frame: the lids shade the ball beneath them; the third eyelid shows dark at the
  // inner corner
  vec3 dl = uGaze * d;
  float xo = dl.x * uSide;
  vec2 lc = lidCurves(dl.x, xo, vec2(uUpper, uLower));
  float shade = mix(0.35, 1.0, smoothstep(0.0, 0.45, lc.x - dl.y)) * mix(0.5, 1.0, smoothstep(0.0, 0.16, dl.y - lc.y));
  col = mix(col, vec3(0.05, 0.025, 0.02), smoothstep(-0.48, -0.7, xo));
  // the iris sits in the shade of the lids and brow, behind the cornea
  vec3 lightIn = uKeyCol * (0.3 + 0.7 * max(dot(N, uKeyDir), 0.0)) * 0.26 + uSkyCol * 0.6;
  col *= lightIn * shade;
  // the wet cornea mirrors the room
  vec3 R = reflect(-V, N);
  float fres = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col += env(R) * fres * mix(0.3, 1.0, shade) * mix(0.3, 1.0, uShine);
  if (uOwnLids > 0.5) col = seam ? rimCol : lidIn < 0.0 ? lidSkin(N, dlo) : mix(rimCol, col, smoothstep(0.0, rim, lidIn));
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
      uShine: { value: 1 },
      uFlat: { value: 0 },
      // amber, sampled from a photograph of a ginger tabby's eye
      // golden amber, between the photographs' copper and hazel
      // olive gold, as in the photographs of ginger tabbies in daylight
      // gold round the pupil into olive green: a ginger tabby's eye in soft daylight
      uIrisA: { value: srgb(0.85, 0.77, 0.4) },
      uIrisB: { value: srgb(0.6, 0.63, 0.3) },
      uIrisC: { value: srgb(0.32, 0.34, 0.15) },
      uFleck: { value: srgb(0.86, 0.8, 0.56) },
      ...lights,
      uRadius: { value: radius },
      uGaze: { value: new THREE.Matrix3() },
      uOwnLids: { value: 0 },
      uLidCol: { value: new THREE.Color(0.6, 0.3, 0.12) },
      uLidScale: { value: new THREE.Vector2(1, 1) },
      uLidMap: { value: null as THREE.Texture | null },
      uLidU: { value: new THREE.Vector3() },
      uLidV: { value: new THREE.Vector3() },
      uLidTex: { value: 0 },
      uSolidGain: { value: 1 },
      uSolidSat: { value: 1 },
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
  const lower = -0.43 + 0.3 * Math.max(0, Math.min(1, squint)) + 0.15 * (1 - o);
  const upper = lower - 0.04 + (0.5 - lower + 0.04) * o;
  e.eyeMat.uniforms.uLower.value = lower;
  e.eyeMat.uniforms.uUpper.value = upper;
  if (e.side > 0) { lids.x = upper; lids.y = lower; } else { lids.z = upper; lids.w = lower; }
}
