import { clamp, polylineDist, smoothstep } from '../util/math';

export type Pt = readonly [number, number];

export interface LayerInfo {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EyeAnchor {
  c: Pt;
  a: Pt; // outer corner of the painted closed lid line
  b: Pt; // inner corner (towards the nose)
}

export interface RigData {
  sourceSize: number;
  outScale: number;
  paper: [number, number, number];
  anchors: {
    headPivot: Pt;
    earLPivot: Pt;
    earRPivot: Pt;
    earLTip: Pt;
    earRTip: Pt;
    tailPivot: Pt;
    tailTip: Pt;
    eyeA: EyeAnchor;
    eyeB: EyeAnchor;
    nose: Pt;
    chin: Pt;
    pawL: Pt;
    breathCenter: Pt;
    body: Pt;
  };
  layers: Record<LayerName, LayerInfo>;
  order: LayerName[];
  polys: { head: Pt[]; earL: Pt[]; earR: Pt[]; tail: Pt[] };
}

export type LayerName = 'body' | 'tail' | 'head' | 'earR' | 'earL';

/** Back of the skull, where the head layer stays glued to the neck fur. */
export const HEAD_ATTACH: Pt[] = [
  [205, 150], [207, 172], [210, 200], [213, 230], [219, 260], [228, 288],
];

/**
 * Painting-space silhouette helper built from silhouette.png: coverage and a signed distance
 * (positive inside, in painting px) used for hit testing, rim weights and the soft shadow.
 */
export class Silhouette {
  readonly size: number;
  readonly cover: Float32Array;
  readonly sdf: Float32Array;
  constructor(img: ImageData) {
    const n = (this.size = img.width);
    this.cover = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) this.cover[i] = img.data[i * 4] / 255;
    this.sdf = signedDistance(this.cover, n);
  }
  at(arr: Float32Array, x: number, y: number) {
    const n = this.size;
    x = clamp(x, 0, n - 1.001);
    y = clamp(y, 0, n - 1.001);
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const i = iy * n + ix;
    const a = arr[i], b = arr[i + 1], c = arr[i + n], d = arr[i + n + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  coverage(x: number, y: number) {
    return this.at(this.cover, x, y);
  }
  distance(x: number, y: number) {
    return this.at(this.sdf, x, y);
  }
  /** outward unit normal of the silhouette near (x, y) */
  normal(x: number, y: number): [number, number] {
    const e = 1.5;
    const gx = this.distance(x + e, y) - this.distance(x - e, y);
    const gy = this.distance(x, y + e) - this.distance(x, y - e);
    const l = Math.hypot(gx, gy) || 1;
    return [-gx / l, -gy / l];
  }
}

function signedDistance(cover: Float32Array, n: number) {
  const INF = 1e9;
  const inside = new Float32Array(n * n);
  const outside = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const isIn = cover[i] >= 0.5;
    inside[i] = isIn ? INF : 0;
    outside[i] = isIn ? 0 : INF;
  }
  chamfer(inside, n);
  chamfer(outside, n);
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = inside[i] > 0 ? inside[i] - 0.5 : -(outside[i] - 0.5);
  return out;
}

function chamfer(d: Float32Array, n: number) {
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - n] + a);
        if (x > 0) v = Math.min(v, d[i - n - 1] + b);
        if (x < n - 1) v = Math.min(v, d[i - n + 1] + b);
      }
      d[i] = v;
    }
  for (let y = n - 1; y >= 0; y--)
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < n - 1) v = Math.min(v, d[i + 1] + a);
      if (y < n - 1) {
        v = Math.min(v, d[i + n] + a);
        if (x < n - 1) v = Math.min(v, d[i + n + 1] + b);
        if (x > 0) v = Math.min(v, d[i + n - 1] + b);
      }
      d[i] = v;
    }
}

/** Static per-vertex skinning weights. Two vec4s: [head, earL, earR, tail], [breath, paw, back, rim]. */
export function vertexWeights(rig: RigData, sil: Silhouette, layer: LayerName, x: number, y: number) {
  const A = rig.anchors;
  let head = 0, earL = 0, earR = 0, tail = 0;
  if (layer === 'head' || layer === 'earL' || layer === 'earR') {
    head = smoothstep(4, 46, polylineDist(x, y, HEAD_ATTACH));
  }
  if (layer === 'earL') earL = earWeight(x, y, [92, 292], A.earLTip);
  if (layer === 'earR') earR = earWeight(x, y, [178, 250], A.earRTip);
  if (layer === 'tail') {
    const [px, py] = A.tailPivot, [tx, ty] = A.tailTip;
    const t = Math.hypot(x - px, y - py) / Math.hypot(tx - px, ty - py);
    tail = smoothstep(0.08, 1.0, t);
  }
  // breathing: rib cage bump, nothing at the floor contact or out at the face
  let breath = 0;
  if (layer === 'body' || layer === 'tail') {
    const dx = (x - 385) / 215, dy = (y - 275) / 165;
    breath = Math.exp(-(dx * dx + dy * dy) * 1.1) * (1 - smoothstep(400, 470, y)) * smoothstep(195, 280, x);
  } else if (layer !== 'earL') {
    // the neck end of the head breathes with the body a little
    breath = 0.25 * (1 - head);
  }
  let paw = 0;
  if (layer === 'body') {
    const [cx, cy] = A.pawL;
    paw = 1 - smoothstep(16, 44, Math.hypot(x - cx, y - cy));
    paw *= 1 - smoothstep(118, 140, x);
  }
  // rim and back bands from the silhouette distance field
  const d = sil.distance(x, y);
  const rim = d > -6 ? 1 - smoothstep(0, 30, d) : 0;
  const [, ny] = sil.normal(x, y);
  let back = 0;
  if (layer === 'body' || layer === 'tail') back = rim * smoothstep(0.05, 0.6, -ny) * smoothstep(215, 300, x);
  return [head, earL, earR, tail, clamp(breath), paw, back, layer === 'earL' || layer === 'earR' ? 0 : rim];
}

function earWeight(x: number, y: number, base: Pt, tip: Pt) {
  const ax = tip[0] - base[0], ay = tip[1] - base[1];
  const t = ((x - base[0]) * ax + (y - base[1]) * ay) / (ax * ax + ay * ay);
  return smoothstep(0.02, 0.7, t);
}

export async function loadRig(base: string): Promise<RigData> {
  const res = await fetch(base + 'rig.json');
  if (!res.ok) throw new Error('rig.json ' + res.status);
  return res.json();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image ' + src));
    img.src = src;
  });
}

export function imageData(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
