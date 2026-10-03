import * as THREE from 'three';
import type { Cat3D } from './cat';

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
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
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
  vec3 c = uPaper * mix(1.0, uShadowDark, 1.0 - sh) * mix(0.55, 1.0, vis);
  gl_FragColor = vec4(c, 0.25);   // alpha marks the floor for the pixel-art pass
  #include <colorspace_fragment>
}`;

/** a palette as display-sRGB vectors, padded to the shader's array length */
const palette = (hex: string[]) => {
  const v = hex.map((h) => new THREE.Vector3(...new THREE.Color().setStyle(h, THREE.SRGBColorSpace).convertLinearToSRGB().toArray()));
  while (v.length < NPAL) v.push(v[v.length - 1].clone());
  return v;
};

export interface StageOptions {
  paper?: string;            // backdrop colour (display sRGB)
  exposure?: number;
  shadowSize?: number;       // metres covered by the key light's shadow
  /** pixel art: the scene is drawn this many art pixels across, in a fixed palette, and blown up */
  pixel?: number;
}

// Pixel art: the scene is rendered small (linear HDR), then each art pixel is tone mapped, snapped to
// a fixed palette and outlined where the depth jumps, and drawn as a block of screen pixels.
const PIXEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** palettes, display sRGB: the cat's own colours, its eyes', and the room's (so shaded cream on the
 *  cat turns peach rather than borrowing the floor's greys, and a grey shadow on white fur never
 *  turns the olive of the eyes). The eyes mark themselves with alpha 0.75, the floor with 0.25. */
const PAL_CAT = [
  // ginger, light to dark
  '#fde6bd', '#f8cb8c', '#efa75c', '#de8337', '#c06222', '#954418', '#662c12',
  // white fur, shading toward rose
  '#fffaf7', '#f9e9e4', '#f0d5cc', '#e3bcae', '#cfa08f',
  // pink skin: inside the ears, the nose, the pads; the inside of the mouth
  '#f8c6c0', '#ee9f9a', '#d47f7f', '#9c3f45',
  // outlines
  '#3c2416', '#21140d',
];
const PAL_EYE = ['#ecd98a', '#c4c25a', '#8a8a36', '#4f5222', '#121010', '#ffffff'];
const PAL_BG = ['#f4eee4', '#e6dccd', '#d0c2ae', '#b3a28b', '#8f7d67', '#6d5b48', '#3c2416'];
/** the room's things (alpha 0.35): wood, the bed's dusty blue, the red bowl, kibble, water, litter */
const PAL_PROP = [
  '#f7f3ec', '#d9d1c4', '#c8a27a', '#a57f58', '#7a5a3c', '#4f3a27',
  '#b9cbe0', '#8fa7c4', '#6a84a6', '#4b6283',
  '#eba3a3', '#cf6f74', '#a24c55', '#6e2f38',
  '#c58b52', '#93602f', '#5f3c1e',
  '#c4e6f4', '#86c4e3', '#5a9cc6',
  '#e3dccd', '#c2b8a6', '#968c7a',
  // the sky through the window: day, dawn and dusk, night
  '#a9d4ee', '#fde3c0', '#f3b17e', '#e88f7a', '#34416a', '#222c4d', '#f6e7a8',
  '#3c2416',
];
const OUTLINE = 16;   // index of the outline colour in PAL_CAT
const NPAL = Math.max(PAL_CAT.length, PAL_BG.length, PAL_EYE.length, PAL_PROP.length);

const PIXEL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uSize;
uniform float uExposure;
uniform float uNear;
uniform float uFar;
uniform float uDither;
uniform vec3 uPalCat[${NPAL}];
uniform vec3 uPalEye[${NPAL}];
uniform vec3 uPalBg[${NPAL}];
uniform vec3 uPalProp[${NPAL}];
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
// the nearest colour of a palette (0 room, 1 cat, 2 eyes, 3 the room's things), and the second
// nearest with how close the colour sits between them
vec3 snap(vec3 c, int pal, out vec3 second, out float t) {
  vec3 q = oklab(c);
  float d1 = 1e9, d2 = 1e9; vec3 c1 = c, c2 = c;
  int n = pal == 3 ? ${PAL_PROP.length} : pal == 2 ? ${PAL_EYE.length} : pal == 1 ? ${PAL_CAT.length} : ${PAL_BG.length};
  for (int i = 0; i < ${NPAL}; i++) {
    if (i >= n) break;
    vec3 p = pal == 3 ? uPalProp[i] : pal == 2 ? uPalEye[i] : pal == 1 ? uPalCat[i] : uPalBg[i];
    vec3 e = oklab(p) - q;
    float d = dot(e * vec3(1.0, 1.4, 1.4), e);
    if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = p; }
    else if (d < d2) { d2 = d; c2 = p; }
  }
  second = c2;
  t = sqrt(d1) / max(sqrt(d1) + sqrt(d2), 1e-5);
  return c1;
}
void main() {
  ivec2 p = ivec2(vUv * uSize);
  vec4 src = texelFetch(uColor, p, 0);
  vec3 c = toSRGB(neutral(src.rgb));
  // the floor marks itself with alpha 0.25, the room's things 0.35, the eyes 0.75; the backdrop is
  // at the far plane
  float depth = texelFetch(uDepth, p, 0).r;
  bool cat = src.a > 0.5 && depth < 0.99999;
  int pal = depth >= 0.99999 ? 0 : src.a < 0.3 ? 0 : src.a < 0.5 ? 3 : src.a < 0.9 ? 2 : 1;
  vec3 c2; float t;
  vec3 s = snap(c, pal, c2, t);
  // a little ordered dithering where a colour falls between two palette entries
  if (uDither > 0.5) {
    int bx = p.x & 3, by = p.y & 3;
    float b = float(((bx ^ by) * 4 + bx) * 4 + by) ; // scrambled 4x4 order
    float th = fract(b * 0.0625 * 7.0) * 0.5;
    if (t > 0.5 - th * 0.35 && t > 0.38) s = c2;
  }
  // outlines: an art pixel in front of its neighbour by more than a few centimetres is an edge
  float w = 1.0 / lin(texelFetch(uDepth, p, 0).r);
  float wl = 1.0 / lin(texelFetch(uDepth, p + ivec2(-1, 0), 0).r), wr = 1.0 / lin(texelFetch(uDepth, p + ivec2(1, 0), 0).r);
  float wu = 1.0 / lin(texelFetch(uDepth, p + ivec2(0, 1), 0).r), wd = 1.0 / lin(texelFetch(uDepth, p + ivec2(0, -1), 0).r);
  // how far the neighbours fall behind the surface this pixel lies on: across a plane, inverse
  // depth changes linearly on screen, so only a real step leaves a second difference
  float behind = max(2.0 * w - wl - wr, 2.0 * w - wu - wd);
  if (w < 0.25) behind = 0.0;                                           // nothing to outline out at the horizon
  if (behind > 0.1 * w) s = uPalCat[${OUTLINE}];                        // against the backdrop
  else if (behind > 0.035 * w) { vec3 c3; float t3; s = snap(s * 0.62, pal, c3, t3); }  // a limb in front of the body
  gl_FragColor = vec4(s, 1.0);
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
        uDither: { value: new URLSearchParams(location.search).has('dither') ? 1 : 0 },
        uPalCat: { value: palette(PAL_CAT) },
        uPalEye: { value: palette(PAL_EYE) },
        uPalProp: { value: palette(PAL_PROP) },
        uPalBg: { value: palette(PAL_BG) },
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
