import * as THREE from 'three';
import type { Cat3D } from './cat';
import { NMAT, PIX, PIX_GLSL, rampTexture } from './pixclass';

const FLOOR_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FLOOR_FRAG = /* glsl */ `
#include <packing>
uniform vec3 uPaper;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn;
uniform float uShadowSoft;
uniform float uShadowDark;
uniform vec4 uCaps[40];
uniform float uPixel;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
${PIX_GLSL}
void main() {
  float sh = 1.0;
  if (uShadowOn > 0.5) {
    vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
    sc.xyz /= sc.w;
    if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) {
      float a = hash(gl_FragCoord.xy) * 6.2832;
      float sum = 0.0;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 16.0) * uShadowSoft;
        float t = fi * 2.39996 + a;
        float d = unpackRGBAToDepth(texture2D(uShadowMap, sc.xy + vec2(cos(t), sin(t)) * r));
        sum += step(sc.z - 0.002, d);
      }
      sh = sum / 16.0;
    }
  }
  // contact shadow: how much of the sky the body hides from this bit of floor
  float vis = 1.0;
  for (int i = 0; i < 20; i++) {
    vec4 A = uCaps[2 * i];
    vec3 B = uCaps[2 * i + 1].xyz;
    vec3 ab = B - A.xyz;
    float t = clamp(dot(vWorld - A.xyz, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    vec3 d = A.xyz + ab * t - vWorld;
    float l2 = max(dot(d, d), 1e-6);
    float cosT = d.y * inversesqrt(l2);
    vis *= 1.0 - 0.8 * clamp(cosT, 0.0, 1.0) * clamp(A.w * A.w / l2, 0.0, 1.0);
  }
  if (uPixel > 0.5) { gl_FragColor = pixRoom(${PIX.paper}, mix(0.4, 0.9, sh) * mix(0.55, 1.0, vis), 0.25); return; }
  vec3 c = uPaper * mix(1.0, uShadowDark, 1.0 - sh) * mix(0.55, 1.0, vis);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export interface StageOptions {
  paper?: string;            // backdrop colour (display sRGB)
  exposure?: number;
  shadowSize?: number;       // metres covered by the key light's shadow
  /** pixel art: the scene is drawn this many art pixels across, in a fixed palette, and blown up */
  pixel?: number;
}

// Pixel art: the scene is rendered small, every surface writing its material and its light
// (pixclass.ts); this pass paints each art pixel from its material's ramp and draws it as a block of
// screen pixels.
const PIXEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** the irises keep a palette of their own (they write colour, alpha 0.75) */
const PAL_EYE = ['#ecd98a', '#c4c25a', '#8a8a36', '#4f5222', '#121010', '#ffffff'];
const eyePalette = () => PAL_EYE.map((h) => new THREE.Vector3(...new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB().toArray()));

const PIXEL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uRampTex;
uniform vec2 uSize;
uniform float uExposure;
uniform float uNear;
uniform float uFar;
uniform vec3 uPalEye[${PAL_EYE.length}];
uniform vec3 uGlow;      // a lamp's halo: centre (art pixels) and radius; radius 0 for none
uniform vec3 uSteam;     // steam off a hot drink: where it rises from (art pixels), and how much
uniform vec3 uMotes[16]; // dust in the sunlight: where (art pixels), and how bright (0 for none)
uniform float uTime;
varying vec2 vUv;

// Khronos PBR Neutral, as the full-resolution stage uses
vec3 neutral(vec3 c) {
  c *= uExposure;
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < 0.76) return c;
  float d = 0.24;
  float np = 1.0 - d * d / (peak + d - 0.76);
  c *= np / peak;
  float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
  return mix(c, vec3(np), g);
}
vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 oklab(vec3 c) {
  c = toLin(c);
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float invDepth(ivec2 q) { return 1.0 / lin(texelFetch(uDepth, q, 0).r); }
vec3 snapEye(vec3 c) {
  vec3 q = oklab(c);
  float best = 1e9; vec3 r = c;
  for (int i = 0; i < ${PAL_EYE.length}; i++) {
    vec3 e = oklab(uPalEye[i]) - q;
    float d = dot(e * vec3(1.0, 1.4, 1.4), e);
    if (d < best) { best = d; r = uPalEye[i]; }
  }
  return r;
}
vec3 ramp(int m, int step) { return texelFetch(uRampTex, ivec2(clamp(step, 0, 4), m), 0).rgb; }

// what lies under an art pixel: 1 the cat, 2 the room, 0 anything else; its material and light
int kindAt(ivec2 q, out int mat, out float light, out float third) {
  vec4 t = texelFetch(uColor, q, 0);
  mat = int(t.r * ${NMAT}.0);
  light = t.g;
  third = t.b;
  if (texelFetch(uDepth, q, 0).r >= 0.99999) return 0;
  return t.a > 0.9 ? 1 : (t.a > 0.4 && t.a < 0.6) ? 2 : 0;
}

const float TH[4] = float[](0.16, 0.32, 0.52, 0.76);
// the step of the ramp a light falls on; the room dithers across the edges of its bands (the soft
// gradients of a pixel-art wall), the cat keeps clean bands
int stepOf(float L, bool dither, ivec2 p) {
  float s = 0.0;
  if (L < TH[0]) s = L / TH[0] - 0.5;
  else if (L >= TH[3]) s = 4.0 + (L - TH[3]) / (1.0 - TH[3]) * 0.5;
  else for (int i = 0; i < 3; i++) if (L >= TH[i] && L < TH[i + 1]) s = float(i + 1) + (L - TH[i]) / (TH[i + 1] - TH[i]) - 0.5;
  float b = 0.0;
  if (dither) {
    int bx = p.x & 3, by = p.y & 3;
    const float BAYER[16] = float[](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    b = (BAYER[(bx ^ by) * 4 + by] / 16.0 - 0.47) * 0.42;
  }
  return int(floor(s + 0.5 + b));
}

void main() {
  ivec2 p = ivec2(vUv * uSize);
  vec4 src = texelFetch(uColor, p, 0);
  int mat; float L0, B0;
  int kind = kindAt(p, mat, L0, B0);
  if (kind == 0) {
    if (texelFetch(uDepth, p, 0).r >= 0.99999) { gl_FragColor = vec4(toSRGB(src.rgb), 1.0); return; }
    // the irises in their own palette; a colour written to be shown as it is (the sky)
    if (src.a > 0.7 && src.a < 0.8) gl_FragColor = vec4(snapEye(toSRGB(neutral(src.rgb))), 1.0);
    else gl_FragColor = vec4(src.rgb, 1.0);
    return;
  }
  // a single pixel of a material none of its neighbours share takes the commonest of theirs, and
  // the light is evened a little over the same material: clean shapes and bands, not specks
  int nm[8];
  float nl[8];
  int k = 0, same = 0;
  for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
    if (dx == 0 && dy == 0) continue;
    int m2; float l2, b2;
    int k2 = kindAt(p + ivec2(dx, dy), m2, l2, b2);
    nm[k] = k2 == kind ? m2 : -1; nl[k] = l2; k++;
    if (k2 == kind && m2 == mat) same++;
  }
  if (same == 0) {
    int best = mat, bestN = 0;
    for (int i = 0; i < 8; i++) {
      if (nm[i] < 0) continue;
      int n = 0;
      for (int j = 0; j < 8; j++) if (nm[j] == nm[i]) n++;
      if (n > bestN) { bestN = n; best = nm[i]; }
    }
    mat = best;
  }
  float sumL = L0 * 4.0, sumW = 4.0;
  for (int i = 0; i < 8; i++) if (nm[i] == mat) { sumL += nl[i]; sumW += 1.0; }
  float L = sumL / sumW;
  // the room's third channel: what glows (the lamp's shade at night: lit from within), or what
  // may dither across its light's bands (big smooth walls), or neither
  // the halo round a glowing lamp: the air near it is lighter, in dithered rings
  if (uGlow.z > 0.0) {
    float g = 1.0 - length(vec2(p) - uGlow.xy) / uGlow.z;
    if (g > 0.0) L += 0.32 * g * g;
  }
  int level = stepOf(L, (kind == 2 && B0 > 0.1 && B0 < 0.5) || (uGlow.z > 0.0 && length(vec2(p) - uGlow.xy) < uGlow.z), p);
  // steam curling up off a hot drink, and dust turning in the sunlight: a soft warm white over
  // whatever is behind
  float haze = 0.0;
  if (uSteam.z > 0.0) {
    vec2 q = vec2(p) - uSteam.xy;
    if (q.y > 0.0 && q.y < 13.0) {
      for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float x = sin(q.y * 0.55 - uTime * 2.2 + fi * 2.4) * (0.6 + q.y * 0.12) + (fi - 0.5) * 2.0;
        float gap = fract(q.y * 0.11 - uTime * 0.35 + fi * 0.5);
        if (abs(q.x - x) < 0.6 && gap > 0.25 && q.y < 13.0 - fi * 3.0) haze = max(haze, 0.42 * (1.0 - q.y / 14.0) * uSteam.z);
      }
    }
  }
  for (int i = 0; i < 16; i++) {
    if (uMotes[i].z > 0.0 && floor(uMotes[i].x) == float(p.x) && floor(uMotes[i].y) == float(p.y)) haze = max(haze, 0.75 * uMotes[i].z);
  }
  // the cat: the light catching an edge from behind lifts it a step
  if (kind == 1 && B0 > 0.4) level += 1;
  if (kind == 2 && B0 > 0.5) level = 4;
  // just behind something nearer (a leg across the chest, the bed's rim on the floor): a line in
  // this colour's own shade, never black
  float w = invDepth(p);
  float front = max(max(invDepth(p + ivec2(-1, 0)), invDepth(p + ivec2(1, 0))), max(invDepth(p + ivec2(0, 1)), invDepth(p + ivec2(0, -1)))) - w;
  if (front > 0.035 * w && w > 0.25) level -= 1;
  gl_FragColor = vec4(mix(ramp(mat, level), vec3(1.0, 0.97, 0.9), haze), 1.0);
}`;

/**
 * The world the cat lives in: a seamless paper backdrop that also takes its soft shadow, a soft
 * key light from the front left with a fill and a little back light, filmic tone mapping. The fur
 * shader does its own lighting, so the light directions and colours live in its uniforms; this
 * class keeps the shadow map and the floor in step with them.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly key = new THREE.DirectionalLight(0xffffff, 1);
  readonly floor: THREE.Mesh;
  private readonly floorMat: THREE.ShaderMaterial;
  private cats: Cat3D[] = [];
  readonly paper: THREE.Color;
  /** pixel art: the small render target and the pass that blows it up */
  private pixel: { width: number; rt: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;

  constructor(opts: StageOptions = {}, canvas?: HTMLCanvasElement) {
    // The fur writes partial alpha (alpha-to-coverage) - an opaque drawing buffer keeps the page
    // from showing through it.
    const cv = canvas ?? document.createElement('canvas');
    const context = cv.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })!;
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, context, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = new URLSearchParams(location.search).get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = opts.exposure ?? 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;   // we filter it ourselves
    this.paper = new THREE.Color().setStyle(opts.paper ?? '#f3efe9', THREE.SRGBColorSpace);
    this.scene.background = this.paper;
    this.camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.01, 40);

    const s = (opts.shadowSize ?? 0.9) / 2;
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 6 });
    this.key.shadow.bias = 0;
    this.scene.add(this.key, this.key.target);

    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uPaper: { value: this.paper.clone() },
        uShadowMap: { value: null },
        uShadowMatrix: { value: this.key.shadow.matrix },
        uShadowOn: { value: 0 },
        uShadowSoft: { value: 0.012 },
        uShadowDark: { value: 0.8 },
        uCaps: { value: [] as THREE.Vector4[] },
        uPixel: { value: opts.pixel ? 1 : 0 },
      },
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      toneMapped: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    if (opts.pixel) this.setupPixel(opts.pixel, opts.exposure ?? 1.15);
    addEventListener('resize', () => this.resize());
  }

  private setupPixel(width: number, exposure: number) {
    const rt = new THREE.WebGLRenderTarget(width, width, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthTexture: new THREE.DepthTexture(width, width, THREE.FloatType),
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: rt.texture }, uDepth: { value: rt.depthTexture }, uSize: { value: new THREE.Vector2() },
        uExposure: { value: exposure }, uNear: { value: this.camera.near }, uFar: { value: this.camera.far },
        uPalEye: { value: eyePalette() },
        uRampTex: { value: rampTexture() },
        uGlow: { value: new THREE.Vector3() },
        uSteam: { value: new THREE.Vector3() },
        uMotes: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
        uTime: { value: 0 },
      },
      vertexShader: PIXEL_VERT, fragmentShader: PIXEL_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const scene = new THREE.Scene();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const quad = new THREE.Mesh(tri, mat);
    quad.frustumCulled = false;
    scene.add(quad);
    this.pixel = { width, rt, scene, cam: new THREE.Camera(), mat };
    this.sizePixel();
  }

  private sizePixel() {
    if (!this.pixel) return;
    const w = this.pixel.width, h = Math.max(1, Math.round(w * innerHeight / innerWidth));
    this.pixel.rt.setSize(w, h);
    this.pixel.mat.uniforms.uSize.value.set(w, h);
  }

  /** draw the scene: straight to the screen, or small and then as pixel art */
  private draw() {
    if (!this.pixel) { this.renderer.render(this.scene, this.camera); return; }
    this.renderer.setRenderTarget(this.pixel.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.pixel.scene, this.pixel.cam);
  }

  /** a halo round a light at a world point (radius in metres; 0 for none), in art pixels */
  setGlow(at: THREE.Vector3 | null, radius = 0) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uGlow.value as THREE.Vector3;
    if (!at || radius <= 0) { u.set(0, 0, 0); return; }
    const v = at.clone().project(this.camera);
    const size = this.pixel.mat.uniforms.uSize.value as THREE.Vector2;
    const d = this.camera.position.distanceTo(at);
    const px = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * d / size.y;
    u.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y, radius / px);
  }

  /** a world point in art pixels (x, y from the bottom left) */
  toArt(at: THREE.Vector3, out = new THREE.Vector2()) {
    const v = at.clone().project(this.camera);
    const size = this.pixel ? (this.pixel.mat.uniforms.uSize.value as THREE.Vector2) : new THREE.Vector2(1, 1);
    return out.set((v.x * 0.5 + 0.5) * size.x, (v.y * 0.5 + 0.5) * size.y);
  }

  /** steam rising off a hot drink at a world point (amount 0 for none) */
  setSteam(at: THREE.Vector3 | null, amount = 1) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uSteam.value as THREE.Vector3;
    if (!at || amount <= 0) { u.set(0, 0, 0); return; }
    const a = this.toArt(at);
    u.set(Math.floor(a.x), Math.floor(a.y), amount);
  }

  /** dust motes: world points with a brightness each (up to 16) */
  setMotes(motes: { p: THREE.Vector3; b: number }[]) {
    if (!this.pixel) return;
    const u = this.pixel.mat.uniforms.uMotes.value as THREE.Vector3[];
    const a = new THREE.Vector2();
    for (let i = 0; i < u.length; i++) {
      const m = motes[i];
      if (!m || m.b <= 0) { u[i].set(0, 0, 0); continue; }
      this.toArt(m.p, a);
      u[i].set(a.x, a.y, m.b);
    }
  }

  /** the pixel pass's clock (steam) */
  setTime(t: number) {
    if (this.pixel) this.pixel.mat.uniforms.uTime.value = t;
  }

  /** rows of art pixels (or of screen pixels when not pixel art) */
  pixelRows() {
    return this.pixel ? this.pixel.rt.height : this.renderer.domElement.height;
  }

  add(cat: Cat3D) {
    this.cats.push(cat);
    this.scene.add(cat.group);
    // the floor takes the contact shadow of the first cat's capsules
    if (this.cats.length === 1) this.floorMat.uniforms.uCaps.value = cat.shared.uCaps.value;
    // light bounced off the floor onto the underside: a pale floor lights the paws and belly
    cat.shared.uGroundCol.value.copy(this.paper).multiplyScalar(0.42);
    // pixel art draws the coat as flat colour; the fur's own texture would only be noise
    if (this.pixel) cat.setPixelArt(true);
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.sizePixel();
  }

  render() {
    const cat = this.cats[0];
    if (cat) {
      // the key light's shadow follows the cat
      const c = cat.group.position;
      this.key.target.position.set(c.x, 0.1, c.z);
      this.key.position.copy(cat.shared.uKeyDir.value).multiplyScalar(2.5).add(this.key.target.position);
      this.key.target.updateMatrixWorld();
      const rows = this.pixel ? this.pixel.rt.height : this.renderer.domElement.height;
      cat.setPixel((2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / rows);
    }
    this.draw();
    // the shadow map exists after the first frame; hand it to the shaders that filter it themselves
    const map = this.key.shadow.map?.texture ?? null;
    if (map && this.floorMat.uniforms.uShadowMap.value !== map) {
      this.floorMat.uniforms.uShadowMap.value = map;
      this.floorMat.uniforms.uShadowOn.value = 1;
      for (const k of this.cats) {
        k.shared.uShadowMap.value = map;
        k.shared.uShadowMatrix.value = this.key.shadow.matrix;
        k.shared.uShadowOn.value = 1;
      }
      this.draw();
    }
  }
}
