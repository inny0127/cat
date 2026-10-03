import * as THREE from 'three';

/**
 * The cat model was made to be drawn a few dozen pixels across: some six thousand flat triangles,
 * whose straight edges no pixel art ever shows. Drawn smooth, its outline would be a polygon. Each
 * triangle is replaced here by a curved patch through its corners that follows their normals (PN
 * triangles: Vlachos et al. 2001), cut into n x n smaller triangles: the same shape, rounded. The
 * patches meet edge to edge (an edge's curve depends only on its two ends), so there are no
 * cracks. Everything else a vertex carries (skin weights, uv, the mouth's regions) is blended from
 * the corners.
 */
export function subdividePN(src: THREE.BufferGeometry, n = 3): THREE.BufferGeometry {
  const P = src.getAttribute('position') as THREE.BufferAttribute;
  const N = src.getAttribute('normal') as THREE.BufferAttribute;
  const SI = src.getAttribute('skinIndex') as THREE.BufferAttribute;
  const SW = src.getAttribute('skinWeight') as THREE.BufferAttribute;
  const REG = src.getAttribute('reg') as THREE.BufferAttribute | undefined;
  const AUX = src.getAttribute('aux') as THREE.BufferAttribute | undefined;
  const UV = src.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const index = src.getIndex()!;
  const V = P.count, T = index.count / 3;

  // the new vertices: the old ones first (unchanged), then those along edges (shared by the two
  // triangles either side), then those inside each triangle
  const perTri = ((n + 1) * (n + 2)) / 2;
  const cap = V + T * perTri;
  const pos = new Float32Array(cap * 3), nrm = new Float32Array(cap * 3);
  const si = new Uint16Array(cap * 4), sw = new Float32Array(cap * 4);
  const reg = new Float32Array(cap), aux = new Float32Array(cap * 3), uv = new Float32Array(cap * 2);
  for (let v = 0; v < V; v++) {
    pos.set([P.getX(v), P.getY(v), P.getZ(v)], v * 3);
    nrm.set([N.getX(v), N.getY(v), N.getZ(v)], v * 3);
    si.set([SI.getX(v), SI.getY(v), SI.getZ(v), SI.getW(v)], v * 4);
    sw.set([SW.getX(v), SW.getY(v), SW.getZ(v), SW.getW(v)], v * 4);
    if (REG) reg[v] = REG.getX(v);
    if (AUX) aux.set([AUX.getX(v), AUX.getY(v), AUX.getZ(v)], v * 3);
    if (UV) uv.set([UV.getX(v), UV.getY(v)], v * 2);
  }
  let count = V;
  const edgeIds = new Map<number, number>();
  const tris: number[] = [];

  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const nn = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const b = { b210: new THREE.Vector3(), b120: new THREE.Vector3(), b021: new THREE.Vector3(), b012: new THREE.Vector3(), b102: new THREE.Vector3(), b201: new THREE.Vector3(), b111: new THREE.Vector3() };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  // a control point near corner i toward corner j: (2 Pi + Pj - ((Pj - Pi) . Ni) Ni) / 3
  const ctrl = (out: THREE.Vector3, i: number, j: number) => {
    const w = tmp.copy(p[j]).sub(p[i]).dot(nn[i]);
    return out.copy(p[i]).multiplyScalar(2).add(p[j]).addScaledVector(nn[i], -w).divideScalar(3);
  };
  const bones = new Map<number, number>();

  /** a new vertex at barycentric (w, u, v) of the corners (a, b, c) */
  const make = (c: number[], w: number, u: number, v: number) => {
    const id = count++;
    const w2 = w * w, u2 = u * u, v2 = v * v;
    const q = tmp2.set(0, 0, 0)
      .addScaledVector(p[0], w2 * w).addScaledVector(p[1], u2 * u).addScaledVector(p[2], v2 * v)
      .addScaledVector(b.b210, 3 * w2 * u).addScaledVector(b.b120, 3 * w * u2)
      .addScaledVector(b.b201, 3 * w2 * v).addScaledVector(b.b021, 3 * u2 * v)
      .addScaledVector(b.b102, 3 * w * v2).addScaledVector(b.b012, 3 * u * v2)
      .addScaledVector(b.b111, 6 * w * u * v);
    pos.set([q.x, q.y, q.z], id * 3);
    const bw = [w, u, v];
    let nx = 0, ny = 0, nz = 0;
    bones.clear();
    for (let k = 0; k < 3; k++) {
      const s = c[k], l = bw[k];
      nx += nrm[s * 3] * l; ny += nrm[s * 3 + 1] * l; nz += nrm[s * 3 + 2] * l;
      reg[id] += reg[s] * l;
      for (let a = 0; a < 3; a++) aux[id * 3 + a] += aux[s * 3 + a] * l;
      for (let a = 0; a < 2; a++) uv[id * 2 + a] += uv[s * 2 + a] * l;
      for (let a = 0; a < 4; a++) {
        const wt = sw[s * 4 + a] * l;
        if (wt > 0) bones.set(si[s * 4 + a], (bones.get(si[s * 4 + a]) ?? 0) + wt);
      }
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nrm.set([nx / nl, ny / nl, nz / nl], id * 3);
    // the four strongest bones, their weights summing to one again
    const top = [...bones.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = top.reduce((a, t) => a + t[1], 0) || 1;
    top.forEach(([bone, wt], a) => { si[id * 4 + a] = bone; sw[id * 4 + a] = wt / sum; });
    return id;
  };

  const grid = new Int32Array(perTri);
  const at = (i: number, j: number) => j * (n + 1) - (j * (j - 1)) / 2 + i;
  for (let t = 0; t < T; t++) {
    const c = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    for (let k = 0; k < 3; k++) {
      p[k].set(pos[c[k] * 3], pos[c[k] * 3 + 1], pos[c[k] * 3 + 2]);
      nn[k].set(nrm[c[k] * 3], nrm[c[k] * 3 + 1], nrm[c[k] * 3 + 2]);
    }
    ctrl(b.b210, 0, 1); ctrl(b.b120, 1, 0); ctrl(b.b021, 1, 2);
    ctrl(b.b012, 2, 1); ctrl(b.b102, 2, 0); ctrl(b.b201, 0, 2);
    const E = tmp.copy(b.b210).add(b.b120).add(b.b021).add(b.b012).add(b.b102).add(b.b201).divideScalar(6);
    const Vc = tmp2.copy(p[0]).add(p[1]).add(p[2]).divideScalar(3);
    b.b111.copy(E).addScaledVector(E.clone().sub(Vc), 0.5);
    // the grid of points: (i, j) at u = i / n (toward the second corner), v = j / n (the third)
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n - j; i++) {
        let id: number;
        if (i === 0 && j === 0) id = c[0];
        else if (i === n && j === 0) id = c[1];
        else if (i === 0 && j === n) id = c[2];
        else {
          // on an edge: shared with the neighbour, found by its two corners and how far along
          let ea = -1, eb = -1, k = 0;
          if (j === 0) { ea = c[0]; eb = c[1]; k = i; } else if (i === 0) { ea = c[0]; eb = c[2]; k = j; } else if (i + j === n) { ea = c[1]; eb = c[2]; k = j; }
          if (ea >= 0) {
            if (ea > eb) { [ea, eb] = [eb, ea]; k = n - k; }
            const key = (ea * V + eb) * (n + 1) + k;
            const found = edgeIds.get(key);
            if (found !== undefined) id = found;
            else { id = make(c, 1 - (i + j) / n, i / n, j / n); edgeIds.set(key, id); }
          } else id = make(c, 1 - (i + j) / n, i / n, j / n);
        }
        grid[at(i, j)] = id;
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n - j; i++) {
        tris.push(grid[at(i, j)], grid[at(i + 1, j)], grid[at(i, j + 1)]);
        if (i < n - 1 - j) tris.push(grid[at(i + 1, j)], grid[at(i + 1, j + 1)], grid[at(i, j + 1)]);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, count * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm.slice(0, count * 3), 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si.slice(0, count * 4), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw.slice(0, count * 4), 4));
  if (REG) g.setAttribute('reg', new THREE.BufferAttribute(reg.slice(0, count), 1));
  if (AUX) g.setAttribute('aux', new THREE.BufferAttribute(aux.slice(0, count * 3), 3));
  if (UV) g.setAttribute('uv', new THREE.BufferAttribute(uv.slice(0, count * 2), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(tris), 1));
  g.computeBoundingSphere();
  return g;
}
