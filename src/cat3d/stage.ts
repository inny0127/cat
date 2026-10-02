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
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export interface StageOptions {
  paper?: string;            // backdrop colour (display sRGB)
  exposure?: number;
  shadowSize?: number;       // metres covered by the key light's shadow
}

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
    addEventListener('resize', () => this.resize());
  }

  add(cat: Cat3D) {
    this.cats.push(cat);
    this.scene.add(cat.group);
    // the floor takes the contact shadow of the first cat's capsules
    if (this.cats.length === 1) this.floorMat.uniforms.uCaps.value = cat.shared.uCaps.value;
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  render() {
    const cat = this.cats[0];
    if (cat) {
      // the key light's shadow follows the cat
      const c = cat.group.position;
      this.key.target.position.set(c.x, 0.1, c.z);
      this.key.position.copy(cat.shared.uKeyDir.value).multiplyScalar(2.5).add(this.key.target.position);
      this.key.target.updateMatrixWorld();
      cat.setPixel((2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.renderer.domElement.height);
    }
    this.renderer.render(this.scene, this.camera);
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
      this.renderer.render(this.scene, this.camera);
    }
  }
}
