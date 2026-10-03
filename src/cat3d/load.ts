import * as THREE from 'three';

export interface BoneDef {
  name: string;
  parent: string | null;
  pos: [number, number, number];
}

export interface Landmarks {
  head: [number, number, number];
  /** a model with plain sockets: the eyes draw their own lids, this much wider/taller than ours, in this skin (display sRGB) */
  lidScale?: [number, number];
  lidCol?: [number, number, number];
  /** where each eye's lids fall on the painted coat: u = a x + b y + c, v = d x + e y + f (lid frame, ball radii) */
  lidUVL?: number[];
  lidUVR?: number[];
  eyeL: [number, number, number];
  eyeR: [number, number, number];
  eyeRadius: number;
  headScale?: number;
  eyeEulerL: [number, number, number];
  eyeEulerR: [number, number, number];
  tailBase: number[];
  tailVec: number[];
  legTop: number;
  backY: number;
  bellyY: number;
  bib: number[];
  ribs: number[];
  nose: [number, number, number];
  padL: [number, number, number];
  padR: [number, number, number];
}

export interface Correctives {
  poses: string[];
  /** RGBA half-float texture: for pose k, rows [2k*rows, (2k+1)*rows) hold position deltas and the next block normal deltas */
  texture: THREE.DataTexture;
  width: number;
  rows: number;
}

/** roots of the individually drawn guard hairs */
export interface StrandRoots {
  count: number;
  pos: Float32Array;
  nrm: Float32Array;
  jnt: Uint16Array;
  wgt: Float32Array;
  /** nearest body vertex, for the posture correctives */
  vid: Float32Array;
  seed: Float32Array;
  /** 0 body, 1 inside the ear; and the ear's own coordinates (see ear_mesh) */
  reg: Float32Array;
  aux: Float32Array;
}

export interface CatAsset {
  landmarks: Landmarks;
  bones: BoneDef[];
  meshes: Record<string, THREE.BufferGeometry>;
  correctives: Correctives | null;
  strands: StrandRoots | null;
  /** a painted coat (the model's own texture) instead of the procedural fur */
  texture: THREE.Texture | null;
  /** attribution the model's licence asks for */
  credit: string | null;
  /** the coat in a few flat colours, one per material, for pixel art (pixclass.ts) */
  pixTexture: THREE.Texture | null;
}

export const CORR_WIDTH = 1024;

/** Reads the binary written by tools/cat3d/model.py: u32 header length, JSON header, arrays. */
export async function loadCatAsset(url: string): Promise<CatAsset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('cat asset ' + res.status);
  const buf = await res.arrayBuffer();
  const headLen = new Uint32Array(buf, 0, 1)[0];
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen)));
  const base = 4 + headLen;
  const meshes: Record<string, THREE.BufferGeometry> = {};
  for (const m of head.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, base + m.pos, m.count * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, base + m.nrm, m.count * 3), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(buf, base + m.jnt, m.count * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(buf, base + m.wgt, m.count * 4), 4));
    g.setAttribute('reg', new THREE.BufferAttribute(new Float32Array(buf, base + m.reg, m.count), 1));
    g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(buf, base + m.aux, m.count * 3), 3));
    if (m.uv !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, base + m.uv, m.count * 2), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, base + m.idx, m.index), 1));
    g.computeBoundingSphere();
    meshes[m.name] = g;
  }
  let correctives: Correctives | null = null;
  if (head.correctives) {
    const c = head.correctives;
    const n = c.count as number;
    const P = c.poses.length as number;
    const src = new Uint16Array(buf, base + c.data, P * 2 * n * 3);
    const rows = Math.ceil(n / CORR_WIDTH);
    const tex = new Uint16Array(CORR_WIDTH * rows * 2 * P * 4);
    for (let k = 0; k < P * 2; k++) {
      for (let v = 0; v < n; v++) {
        const o = (k * rows * CORR_WIDTH + v) * 4, i = (k * n + v) * 3;
        tex[o] = src[i]; tex[o + 1] = src[i + 1]; tex[o + 2] = src[i + 2]; tex[o + 3] = 0;
      }
    }
    const texture = new THREE.DataTexture(tex, CORR_WIDTH, rows * 2 * P, THREE.RGBAFormat, THREE.HalfFloatType);
    texture.needsUpdate = true;
    correctives = { poses: c.poses, texture, width: CORR_WIDTH, rows };
  }
  let strands: StrandRoots | null = null;
  if (head.strands) {
    const t = head.strands;
    const n = t.count as number;
    strands = {
      count: n,
      pos: new Float32Array(buf, base + t.pos, n * 3),
      nrm: new Float32Array(buf, base + t.nrm, n * 3),
      jnt: new Uint16Array(buf, base + t.jnt, n * 4),
      wgt: new Float32Array(buf, base + t.wgt, n * 4),
      vid: new Float32Array(buf, base + t.vid, n),
      seed: new Float32Array(buf, base + t.seed, n),
      reg: t.reg !== undefined ? new Float32Array(buf, base + t.reg, n) : new Float32Array(n),
      aux: t.aux !== undefined ? new Float32Array(buf, base + t.aux, n * 3) : new Float32Array(n * 3),
    };
  }
  const image = async (t: { data: number; bytes: number; mime: string } | undefined) => {
    if (!t) return null;
    const bmp = await createImageBitmap(new Blob([new Uint8Array(buf, base + t.data, t.bytes)], { type: t.mime }));
    const tex = new THREE.Texture(bmp);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;   // glTF's UVs
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };
  const texture = await image(head.texture);
  const pixTexture = await image(head.pixtex);
  return { landmarks: head.landmarks, bones: head.bones, meshes, correctives, strands, texture, credit: head.credit ?? null, pixTexture };
}

/** Bones with identity rest rotations, positioned at their joints (world-aligned rest frame). */
export function buildSkeleton(defs: BoneDef[]) {
  const bones: THREE.Bone[] = [];
  const byName = new Map<string, THREE.Bone>();
  for (const d of defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    bones.push(b);
    byName.set(d.name, b);
  }
  defs.forEach((d, i) => {
    const b = bones[i];
    if (d.parent) {
      const p = defs.find((x) => x.name === d.parent)!;
      b.position.set(d.pos[0] - p.pos[0], d.pos[1] - p.pos[1], d.pos[2] - p.pos[2]);
      byName.get(d.parent)!.add(b);
    } else {
      b.position.set(d.pos[0], d.pos[1], d.pos[2]);
    }
  });
  const root = bones[defs.findIndex((d) => !d.parent)];
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { skeleton, root, byName };
}
