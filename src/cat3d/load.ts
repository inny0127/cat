import * as THREE from 'three';

export interface BoneDef {
  name: string;
  parent: string | null;
  pos: [number, number, number];
}

export interface Landmarks {
  head: [number, number, number];
  eyeL: [number, number, number];
  eyeR: [number, number, number];
  eyeRadius: number;
  eyeEulerL: [number, number, number];
  eyeEulerR: [number, number, number];
  nose: [number, number, number];
  padL: [number, number, number];
  padR: [number, number, number];
}

export interface CatAsset {
  landmarks: Landmarks;
  bones: BoneDef[];
  meshes: Record<string, THREE.BufferGeometry>;
}

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
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, base + m.idx, m.index), 1));
    g.computeBoundingSphere();
    meshes[m.name] = g;
  }
  return { landmarks: head.landmarks, bones: head.bones, meshes };
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
