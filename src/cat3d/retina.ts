import * as THREE from 'three';
import { NMAT, PIX_STEPS, RAMPS } from './pixclass';

/**
 * The cat's retina: the room drawn from where its eyes are, the way its head faces, small (a few
 * hundred receptors, each some four degrees of the view) and wide (two halves side by side, each a
 * hundred degrees across, the one turned off to the left, the other to the right: some two hundred
 * degrees in all, as a cat's eyes take in), a dozen or so times a second; and read back off the
 * graphics card without waiting on it, so what the eye sees reaches the brain a frame or two late,
 * as it does.
 *
 * What comes of it (a frame) is plain brightness at each receptor, with the way in the world each
 * one looked along as it was taken. What the brain makes of that is midbrain.ts's business.
 */
export interface EyeFrame {
  /** brightness at each receptor (0 .. 1), w across, h down, the top row first */
  lum: Float32Array;
  w: number;
  h: number;
  /** the way each receptor looked, in the world: its bearing (world yaw: atan2(x, z)) and its
   *  elevation above level (rad) */
  az: Float32Array;
  el: Float32Array;
  /** when it was taken (s, the app's clock) */
  t: number;
}

/** how bright each step of each material's ramp is to a cat's eye (its painted colour, in linear
 *  light, weighed as a cat's eye weighs it: most for blue-green, least for red) */
const RAMP_LUM: number[][] = RAMPS.map((ramp) => ramp.map((hex) => {
  const c = new THREE.Color(hex);
  return 0.12 * c.r + 0.58 * c.g + 0.3 * c.b;
}));
const lumOf = (r: number, g: number, b: number) => 0.12 * r + 0.58 * g + 0.3 * b;

/** receptors across each half, and down */
const HW = 24;
const H = 16;
/** each half's view across (rad), and how far round from straight ahead each is turned */
const HALF = (100 * Math.PI) / 180;
const TURN = (50 * Math.PI) / 180;

export class Retina {
  readonly w = HW * 2;
  readonly h = H;
  /** the last frame read back (null: none yet) */
  latest: EyeFrame | null = null;
  /** frames a second (it is looked at no oftener) */
  rate = 12;
  /** off: nothing drawn, nothing read (asleep, out of the room, a machine that cannot) */
  on = true;
  /** where the eyes are, and the way the head faces (world), as the cat has them this frame */
  readonly eye = new THREE.Vector3();
  readonly fwd = new THREE.Vector3(0, 0, 1);
  /** what is left out of the view: the cat itself (its eyes are inside its head) */
  hide: THREE.Object3D | null = null;
  /** small bright things drawn over the picture after it is made, not in the room itself (the red
   *  dot of the laser pointer, a moth, a glint of sun): where (world) and how bright (0 .. 1); put
   *  into the frame where the receptors that looked that way are */
  readonly marks: { p: THREE.Vector3; lum: number }[] = [];
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly cams = [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()];
  private readonly px: Uint8Array;
  private busy = false;
  private due = 0;
  private broken = false;
  private readonly tmp = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly clear = new THREE.Color();
  /** the tangent of half each half's view across and down, for the way each receptor looks */
  private readonly tanX = Math.tan(HALF / 2);
  private readonly tanY: number;

  constructor() {
    this.px = new Uint8Array(this.w * this.h * 4);
    const aspect = HW / H;
    this.tanY = this.tanX / aspect;
    const fovY = (2 * Math.atan(this.tanY) * 180) / Math.PI;
    for (const c of this.cams) {
      c.fov = fovY;
      c.aspect = aspect;
      c.near = 0.03;
      c.far = 30;
      c.updateProjectionMatrix();
    }
  }

  /**
   * Called each frame once the room is drawn: if a frame is due and none is on its way back, the
   * room drawn from the eyes (both halves) and sent to be read back. `now` is the app's clock (s).
   */
  capture(r: THREE.WebGLRenderer, scene: THREE.Scene, now: number) {
    if (!this.on || this.broken || this.busy || now < this.due) return;
    this.due = now + 1 / this.rate;
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(this.w, this.h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      this.rt.scissorTest = true;
    }
    const rt = this.rt;
    // (each half turned off to its own side of the way the head faces, level: a cat holds its head
    // level, and so the view)
    const yaw = Math.atan2(this.fwd.x, this.fwd.z), pitch = Math.asin(Math.max(-1, Math.min(1, this.fwd.y)));
    const was = this.hide?.visible ?? false, shadows = r.shadowMap.autoUpdate, target = r.getRenderTarget();
    // (nothing behind the room's open front: cleared to nothing, not the paper the page is drawn on)
    const bg = scene.background, clear = r.getClearColor(this.clear), alpha = r.getClearAlpha();
    scene.background = null;
    r.setClearColor(0x000000, 0);
    if (this.hide) this.hide.visible = false;
    r.shadowMap.autoUpdate = false;
    try {
      for (let k = 0; k < 2; k++) {
        const c = this.cams[k], a = yaw + (k === 0 ? TURN : -TURN);
        c.position.copy(this.eye);
        c.up.copy(this.up);
        c.lookAt(this.to.set(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch)).add(this.eye));
        c.updateMatrixWorld();
        // (the cat's left half on the left of the frame: the left one turned to +x, which from
        // behind the cat is its left)
        const x = k === 0 ? 0 : HW;
        rt.viewport.set(x, 0, HW, H);
        rt.scissor.set(x, 0, HW, H);
        r.setRenderTarget(rt);
        r.render(scene, c);
      }
    } finally {
      r.shadowMap.autoUpdate = shadows;
      if (this.hide) this.hide.visible = was;
      scene.background = bg;
      r.setClearColor(clear, alpha);
    }
    // the way each receptor looked, as the halves stood when they were drawn
    const n = this.w * this.h, az = new Float32Array(n), el = new Float32Array(n);
    for (let k = 0; k < 2; k++) {
      const q = this.cams[k].quaternion;
      for (let j = 0; j < H; j++) {
        // (read back from the bottom row up: row j of the frame is drawn row H-1-j)
        const ny = 1 - ((j + 0.5) / H) * 2;
        for (let i = 0; i < HW; i++) {
          const nx = ((i + 0.5) / HW) * 2 - 1;
          const d = this.tmp.set(nx * this.tanX, ny * this.tanY, -1).normalize().applyQuaternion(q);
          const idx = j * this.w + k * HW + i;
          az[idx] = Math.atan2(d.x, d.z);
          el[idx] = Math.asin(Math.max(-1, Math.min(1, d.y)));
        }
      }
    }
    // (and the small bright things, as the eye had them when it looked)
    const eye = this.eye.clone(), marks = this.marks.map((k) => ({ p: k.p.clone(), lum: k.lum }));
    this.busy = true;
    let read: Promise<unknown>;
    try {
      read = r.readRenderTargetPixelsAsync(rt, 0, 0, this.w, this.h, this.px);
    } catch {
      // (a machine that cannot read it back: no retina, the eyes' work done the old way)
      this.broken = true;
      this.busy = false;
      r.setRenderTarget(target);
      return;
    }
    r.setRenderTarget(target);
    // (and nothing else read back into the buffer it waits on meanwhile)
    const gl = r.getContext() as WebGL2RenderingContext;
    if (gl.PIXEL_PACK_BUFFER !== undefined) gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    read.then(() => {
      const lum = new Float32Array(n), px = this.px;
      for (let j = 0; j < H; j++) {
        const src = (H - 1 - j) * this.w;
        for (let i = 0; i < this.w; i++) {
          lum[j * this.w + i] = this.bright(px, (src + i) * 4);
        }
      }
      for (const k of marks) {
        const dx = k.p.x - eye.x, dy = k.p.y - eye.y, dz = k.p.z - eye.z;
        const ka = Math.atan2(dx, dz), ke = Math.atan2(dy, Math.hypot(dx, dz));
        for (let i = 0; i < n; i++) {
          const d = Math.hypot(Math.atan2(Math.sin(az[i] - ka), Math.cos(az[i] - ka)) * Math.cos(ke), el[i] - ke);
          if (d < 0.075) lum[i] = Math.max(lum[i], k.lum * (1 - d / 0.075));
        }
      }
      this.latest = { lum, w: this.w, h: this.h, az, el, t: now };
      this.busy = false;
    }, () => {
      this.broken = true;
      this.busy = false;
    });
  }

  /** how bright a receptor's bit of the room is. The room and the cat are drawn as which material
   *  and how much light is on it (pixclass.ts), for the pixel pass to paint; here, the painted
   *  colour of that much light on that material. The sky, the lamp's bulb, the lit windows across
   *  the way are drawn as the colour they are; the irises as theirs; nothing there (out past the
   *  room's open front, where you are), dim */
  private bright(px: Uint8Array, o: number) {
    const a = px[o + 3];
    if (a < 8) return 0.08;
    if (a > 240 || (a > 110 && a < 145)) {
      const m = Math.max(0, Math.min(RAMP_LUM.length - 1, Math.floor((px[o] / 255) * NMAT))), L = px[o + 1] / 255;
      let k = 0;
      while (k < 4 && L >= PIX_STEPS[k]) k++;
      return RAMP_LUM[m][k];
    }
    if (a > 175 && a < 205) return 0.25;
    return Math.min(1, lumOf(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255));
  }

  dispose() {
    this.rt?.dispose();
    this.rt = null;
  }
}
