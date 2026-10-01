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
uniform vec3 uIrisIn;
uniform vec3 uIrisOut;
uniform vec3 uLightDir;
uniform float uRadius;
uniform float uUpper;
uniform float uLower;
uniform float uSide;
varying vec3 vLocal;
varying vec3 vViewLocal;
varying vec3 vN;
varying vec3 vView;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float vn(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec3 d = vLocal / uRadius;
  // the iris is a disc ~35% of the radius behind the cornea: refract the view onto it
  vec3 v = -normalize(vViewLocal);
  vec3 r = refract(v, normalize(d), 1.0 / 1.34);
  float depth = 0.36;
  float t = (d.z - (1.0 - depth)) / max(0.15, -r.z);
  vec2 ip = (d + r * max(t, 0.0)).xy;
  float rr = length(ip) / 0.83;
  float th = atan(ip.y, ip.x);
  vec3 iris = mix(uIrisIn, uIrisOut, smoothstep(0.1, 0.95, rr));
  iris *= 0.78 + 0.45 * (vn(th * 13.0 + rr * 4.0) * 0.6 + vn(th * 37.0 - rr * 9.0) * 0.4);
  iris = mix(iris, iris * 0.35, smoothstep(0.78, 1.0, rr));
  vec3 col = mix(iris, vec3(0.13, 0.08, 0.05), smoothstep(0.98, 1.06, rr));
  vec2 pr = vec2(0.06 + 0.52 * uPupil, 0.70 - 0.12 * uPupil);
  float pd = length(ip / pr);
  col = mix(col, vec3(0.008), smoothstep(1.08, 0.92, pd));
  vec3 N = normalize(vN), V = normalize(vView), L = normalize(uLightDir);
  vec3 R = reflect(-V, N);
  float spec = pow(max(dot(R, L), 0.0), 400.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float lit = 0.5 + 0.5 * max(dot(N, L), 0.0);
  // the upper lid shades the ball just beneath it; the lower lid a little
  float xo = d.x * uSide;
  float up = uUpper - 0.9 * d.x * d.x + 0.12 * xo;
  float lo = uLower + 0.95 * d.x * d.x + 0.16 * xo;
  float shade = mix(0.3, 1.0, smoothstep(0.0, 0.32, up - d.y)) * mix(0.6, 1.0, smoothstep(0.0, 0.12, d.y - lo));
  col = col * lit * 1.05 * shade + vec3(1.0) * spec * 2.0 * shade + vec3(0.8, 0.85, 0.95) * fres * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface CatEye {
  group: THREE.Group;
  ball: THREE.Mesh;
  eyeMat: THREE.ShaderMaterial;
  side: 1 | -1;
}

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export function makeEye(radius: number, side: 1 | -1, lightDir: THREE.Vector3): CatEye {
  const group = new THREE.Group();
  const uUpper = { value: 0.62 };
  const uLower = { value: -0.5 };
  const uSide = { value: side };
  const eyeMat = new THREE.ShaderMaterial({
    uniforms: {
      uPupil: { value: 0.25 },
      uIrisIn: { value: srgb(0.78, 0.76, 0.36) },
      uIrisOut: { value: srgb(0.86, 0.68, 0.26) },
      uLightDir: { value: lightDir },
      uRadius: { value: radius },
      uUpper, uLower, uSide,
    },
    vertexShader: EYE_VERT,
    fragmentShader: EYE_FRAG,
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 36, 28), eyeMat);
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
