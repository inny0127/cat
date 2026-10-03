"""Fripouille: a realistic textured cat, rigged with this project's skeleton (the pixel-art cat).

Source model: "3d modelling my cat: Fripouille" by guillaume bolis
  https://sketchfab.com/3d-models/3d-modelling-my-cat-fripouille-0ab14bf98e754f8d90fe1bf1c84ca66c
  licensed CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
Changes made here: rigged to our skeleton (bones and weights), the tail straightened onto the
skeleton's rest line, rescaled and turned to our axes. Its own eyeballs, whiskers and material maps
are not used: the procedural eyes sit in its sockets and the procedural whiskers on its muzzle.

The Sketchfab glTF does not hold together: the body's vertices are stored point-reflected and at a
different scale from what its bind matrices expect. The body is put back by fitting the rings of
vertices that two neighbouring bones share (they ring the joint between them) to the rig's joints;
everything after that is worked out from the mesh itself.

  python3 tools/cat3d/fripouille.py [out.bin] [fripouille.glb]
"""
import io, json, os, struct, sys, urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import model as M  # noqa: E402  (our skeleton)

URL = 'https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-125/0ab14bf98e754f8d90fe1bf1c84ca66c.glb'
CREDIT = ('"3d modelling my cat: Fripouille" by guillaume bolis (https://sketchfab.com/guillaume.bolis.neko), '
          'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Rigged, re-posed and given procedural eyes for this app.')

# the source rig's bones, by what they are
SPINE = ['Bone_01', 'Bone.001_02', 'Bone.002_03', 'Bone.003_04', 'Bone.004_05']   # pelvis .. head
FRONT = [['Bone.015_06', 'Bone.016_07', 'Bone.017_08', 'Bone.018_09'], ['Bone.019_010', 'Bone.020_011', 'Bone.021_012', 'Bone.022_013']]
HIND = [['Bone.011_020', 'Bone.012_021', 'Bone.013_022', 'Bone.014_023'], ['Bone.023_024', 'Bone.024_00', 'Bone.025_025', 'Bone.026_026']]
TAIL = ['Bone.005_014', 'Bone.006_015', 'Bone.007_016', 'Bone.008_017', 'Bone.009_018', 'Bone.010_019']


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ reading the glTF
class GLB:
    def __init__(self, path):
        b = open(path, 'rb').read()
        n = struct.unpack('<I', b[12:16])[0]
        self.g = json.loads(b[20:20 + n])
        o = 20 + n
        self.bin = b[o + 8:o + 8 + struct.unpack('<I', b[o:o + 4])[0]]

    def acc(self, i):
        a = self.g['accessors'][i]
        bv = self.g['bufferViews'][a['bufferView']]
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]
        nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        isz = np.dtype(dt).itemsize * nc
        stride = bv.get('byteStride', 0) or isz
        raw = np.frombuffer(self.bin, np.uint8, count=stride * (a['count'] - 1) + isz, offset=off)
        arr = raw[np.arange(a['count'])[:, None] * stride + np.arange(isz)[None]].view(dt).reshape(a['count'], nc)
        if a.get('normalized'): return arr / np.iinfo(dt).max
        return arr.astype(np.float64) if dt == np.float32 else arr

    def blob(self, image):
        bv = self.g['bufferViews'][image['bufferView']]
        return self.bin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]


def load(path):
    G = GLB(path)
    mats = G.g['materials']
    node = next(n for n in G.g['nodes'] if 'mesh' in n and mats[G.g['meshes'][n['mesh']]['primitives'][0]['material']]['name'] == 'SHD_frip')
    pr = G.g['meshes'][node['mesh']]['primitives'][0]
    at = {k: G.acc(v) for k, v in pr['attributes'].items()}
    sk = G.g['skins'][node['skin']]
    ibm = G.acc(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    names = [G.g['nodes'][j]['name'] for j in sk['joints']]
    children = {i: [sk['joints'].index(c) for c in G.g['nodes'][j].get('children', []) if c in sk['joints']] for i, j in enumerate(sk['joints'])}
    W = np.zeros((len(at['POSITION']), len(names)))
    for c in range(4): np.add.at(W, (np.arange(len(W)), at['JOINTS_0'][:, c].astype(int)), at['WEIGHTS_0'][:, c])
    tex = mats[pr['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
    png = G.blob(G.g['images'][G.g['textures'][tex]['source']])
    return dict(pos=at['POSITION'], uv=at['TEXCOORD_0'], faces=G.acc(pr['indices']).reshape(-1, 3).astype(np.int64),
                W=W, rig=np.array([np.linalg.inv(m)[:3, 3] for m in ibm]), names=names, children=children, png=png)


def fetch():
    path = os.path.join(HERE, '.cache', 'fripouille.glb')
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print('downloading', URL)
        urllib.request.urlretrieve(URL, path)
    return path


# ------------------------------------------------------------------ putting the body back and in our frame
def umeyama(X, Y, reflect=False):
    """similarity (s, R, t) taking points X onto Y in the least-squares sense"""
    mx, my = X.mean(0), Y.mean(0)
    U, S, Vt = np.linalg.svd((Y - my).T @ (X - mx))
    D = np.eye(3)
    if not reflect and np.linalg.det(U @ Vt) < 0: D[2, 2] = -1
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / ((X - mx) ** 2).sum()
    return s, R, my - s * R @ mx


def place(F):
    """vertices and rig joints in metres, our axes (+z forward, +y up, +x the cat's left), floor at 0"""
    raw, W, rig = F['pos'], F['W'], F['rig']
    A, B = [], []
    for i, ch in F['children'].items():
        for c in ch:
            m = np.minimum(W[:, i], W[:, c])
            if m.max() < 0.15: continue
            w = m * m
            A.append((raw * w[:, None]).sum(0) / w.sum())
            B.append(rig[c])
    s, R, t = umeyama(np.array(A), np.array(B), reflect=True)
    res = np.linalg.norm(s * np.array(A) @ R.T + t - np.array(B), axis=1)
    print('body -> rig: scale %.5f, det %+.0f, joint rings off by %.1f%% of the rig' % (s, np.linalg.det(R), 100 * res.mean() / np.ptp(B, 0).max()))
    P = s * raw @ R.T + t
    k = {n: i for i, n in enumerate(F['names'])}

    def paw(chain):
        q = P[W[:, k[chain[-1]]] > 0.5]
        return q[q[:, 1] < np.percentile(q[:, 1], 15)].mean(0)
    front = np.mean([paw(c) for c in FRONT], 0)
    hind = np.mean([paw(c) for c in HIND], 0)
    f = front - hind
    f[1] = 0
    f /= np.linalg.norm(f)
    up = np.array([0, 1.0, 0])
    Rr = np.stack([np.cross(up, f), up, f])
    # the same distance between front and hind paws as our skeleton
    sc = (M.pos('handL')[2] - M.pos('footL')[2]) / np.linalg.norm((front - hind)[[0, 2]])

    def ours(p): return (np.asarray(p) - hind) @ Rr.T * sc + np.array([0, 0, M.pos('footL')[2]])
    V, J = ours(P), ours(rig)
    floor = V[:, 1].min()
    V[:, 1] -= floor
    J[:, 1] -= floor
    faces = F['faces'].copy()
    a, b, c = V[faces[:, 0]], V[faces[:, 1]], V[faces[:, 2]]
    if np.einsum('ij,ij->i', a, np.cross(b, c)).sum() < 0: faces = faces[:, ::-1].copy()   # wind outward
    return V, J, faces, k


# ------------------------------------------------------------------ the tail, straightened
def catmull(ctrl, n=400):
    """centripetal Catmull-Rom through ctrl (2D), sampled by n points"""
    P = np.vstack([2 * ctrl[0] - ctrl[1], ctrl, 2 * ctrl[-1] - ctrl[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1:i + 3]
        t0 = 0
        t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5
        t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5
        t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
        for t in np.linspace(t1, t2, n // (len(ctrl) - 1), endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(ctrl[-1])
    return np.array(out)


def straighten_tail(V, W, J, k):
    """The model's tail hangs in a curve; our skeleton's rest tail is a straight line (the poses
    bend it from there). Unroll it: each vertex keeps its distance along the tail and its offset
    from the centreline, measured in the side plane (the tail is straight seen from above)."""
    tw = W[:, [k[n] for n in TAIL]].sum(1)
    ctrl = [J[k[n]] for n in TAIL]
    d = ctrl[-1] - ctrl[-2]
    d /= np.linalg.norm(d)
    tip = ctrl[-1] + d * ((V[tw > 0.5] - ctrl[-1]) @ d).max()
    C = catmull(np.array([[p[2], p[1]] for p in ctrl + [tip]]))      # (z, y)
    seg = np.diff(C, axis=0)
    s = np.r_[0, np.cumsum(np.linalg.norm(seg, axis=1))]
    L = s[-1]
    T = seg / np.linalg.norm(seg, axis=1, keepdims=True)
    N = np.stack([-T[:, 1], T[:, 0]], 1)
    base = C[0]
    dv = np.array([M.TAIL_VEC[2], M.TAIL_VEC[1]])
    dv /= np.linalg.norm(dv)
    nv = np.array([-dv[1], dv[0]])
    sel = np.where(tw > 0.01)[0]
    a = V[sel][:, [2, 1]]
    # nearest point on the centreline
    rel = a[:, None, :] - C[None, :-1, :]
    t = np.clip(np.einsum('ijk,jk->ij', rel, seg) / (seg ** 2).sum(1), 0, 1)
    dist = np.linalg.norm(rel - t[..., None] * seg[None], axis=2)
    j = np.argmin(dist, 1)
    tj = t[np.arange(len(sel)), j]
    u = s[j] + tj * np.linalg.norm(seg[j], axis=1)
    foot = C[j] + tj[:, None] * seg[j]
    along = np.einsum('ij,ij->i', a - foot, T[j])         # past either end of the centreline
    h = np.einsum('ij,ij->i', a - foot, N[j])
    u = u + along
    b = base + dv * u[:, None] + nv * h[:, None]
    beta = smoothstep(0.004, 0.03, u) * np.clip(tw[sel] / 0.6, 0, 1)
    out = V.copy()
    out[sel, 2] += (b[:, 0] - a[:, 0]) * beta
    out[sel, 1] += (b[:, 1] - a[:, 1]) * beta
    tail = [np.array([0, base[1], base[0]]) + np.array([0, dv[1], dv[0]]) * L * i / M.TAIL_N for i in range(M.TAIL_N + 1)]
    print('tail: %.3f m long, unrolled from a %.0f degree hang' % (L, np.degrees(np.arctan2(-(tip[1] - ctrl[0][1]), -(tip[2] - ctrl[0][2])))))
    return out, tail


# ------------------------------------------------------------------ eyes, from the painted sockets
def sample_surface(V, faces, n, seed=1):
    rng = np.random.default_rng(seed)
    a, b, c = V[faces[:, 0]], V[faces[:, 1]], V[faces[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    fi = rng.choice(len(faces), n, p=area / area.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s1 = np.sqrt(r1)
    bary = np.stack([1 - s1, s1 * (1 - r2), s1 * r2], 1)
    pts = (V[faces[fi]] * bary[:, :, None]).sum(1)
    return pts, fi, bary


def eye_sockets(V, faces, uv, tex, headw, nose):
    """The eye openings are painted near-black in the model's texture: find them on the surface"""
    pts, fi, bary = sample_surface(V, faces, 600000)
    puv = (uv[faces[fi]] * bary[:, :, None]).sum(1)
    H, Wd = tex.shape[:2]
    px = np.clip((puv[:, 0] % 1) * (Wd - 1), 0, Wd - 1).astype(int)
    py = np.clip((puv[:, 1] % 1) * (H - 1), 0, H - 1).astype(int)
    col = tex[py, px]
    lum = col @ [0.3, 0.59, 0.11]
    fn = np.cross(V[faces[:, 1]] - V[faces[:, 0]], V[faces[:, 2]] - V[faces[:, 0]])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True)
    face = (headw[faces[fi]].mean(1) > 0.5) & (pts[:, 1] > nose[1] + 0.004) & (pts[:, 2] > nose[2] - 0.06) & (np.abs(pts[:, 0]) < 0.035)
    out = {}
    for side, x in (('L', 1), ('R', -1)):
        sel = face & (lum < 0.16) & (pts[:, 0] * x > 0)
        q = pts[sel]
        c = q.mean(0)
        n = fn[fi[sel]].mean(0)
        n /= np.linalg.norm(n)
        X = q - c
        X -= np.outer(X @ n, n)
        ev = np.linalg.eigvalsh(X.T @ X / len(X))[::-1]
        half = 2 * np.sqrt(ev[:2])                        # half-extents of the opening, long and short
        ring = face & (pts[:, 0] * x > 0) & (lum > 0.25)
        dd = np.linalg.norm(pts - c, axis=1)
        ring &= (dd > 1.4 * half[0]) & (dd < 2.4 * half[0])
        out[side] = dict(c=c, n=n, half=half, skin=np.median(col[ring], 0))
    return out


def uv_islands(faces, n):
    """the model's UV islands: its vertices are split along the UV seams, so each connected piece of
    the index mesh is one island"""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import connected_components
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    return connected_components(sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)[1]


def eye_islands(V, isl, o):
    """the islands at one eye: the socket's own (inside the opening, under the ball), and the face's
    (which has most of the ring of skin round the opening)"""
    d = np.linalg.norm(V - o['c'], axis=1)
    pit = [i for i in np.unique(isl[d < o['half'][0]]) if np.median(d[isl == i]) < 1.6 * o['half'][0]]
    ring = (d > 1.2 * o['half'][0]) & (d < 2.2 * o['half'][0])
    return pit, int(np.bincount(isl[ring]).argmax())


def paint_out_eyes(tex8, V, faces, uv, sockets, isl):
    """The texture paints the eyes into the sockets (near-black, with a dark rim). Our eyes draw
    their own, and their lids show this texture round the opening, so: the socket's inside is
    painted a shaded fur colour, and the dark rim and the hole the opening leaves in the face's
    UV island are filled with the fur round them."""
    import cv2
    from scipy.spatial import ConvexHull
    H, Wd = tex8.shape[:2]
    px = lambda t: np.round(t * [Wd - 1, H - 1]).astype(np.int32)
    out = tex8.copy()
    lum = tex8.astype(float) @ [0.3, 0.59, 0.11] / 255
    hole = np.zeros((H, Wd), np.uint8)
    cen = V[faces].mean(1)
    fisl = isl[faces[:, 0]]
    for o in sockets.values():
        pit, face = eye_islands(V, isl, o)
        m = np.zeros((H, Wd), np.uint8)
        for f in faces[np.isin(fisl, pit)]: cv2.fillPoly(m, [px(uv[f])], 255)
        m = cv2.dilate(m, np.ones((5, 5), np.uint8))
        out[m > 0] = np.round(np.clip(o['skin'] * 0.55, 0, 1) * 255).astype(np.uint8)
        # the face round the opening: its triangles near the eye, and the hole they leave
        own = np.zeros((H, Wd), np.uint8)
        near = (np.linalg.norm(cen - o['c'], axis=1) < 1.7 * o['half'][0]) & (fisl == face)
        for f in faces[near]: cv2.fillPoly(own, [px(uv[f])], 255)
        e = np.concatenate([faces[fisl == face][:, [0, 1]], faces[fisl == face][:, [1, 2]], faces[fisl == face][:, [2, 0]]])
        es, cnt = np.unique(np.sort(e, 1), axis=0, return_counts=True)
        edge = es[cnt == 1]
        rim = edge[(np.linalg.norm(V[edge].mean(1) - o['c'], axis=1) < 1.4 * o['half'][0])]
        if len(rim) >= 3:
            q = uv[np.unique(rim)]
            poly = px(q[ConvexHull(q).vertices])
            hm = np.zeros((H, Wd), np.uint8)
            cv2.fillPoly(hm, [poly], 255)
            hole |= cv2.dilate(hm, np.ones((5, 5), np.uint8)) & ~own
        hole |= cv2.dilate(((own > 0) & (lum < 0.3)).astype(np.uint8) * 255, np.ones((5, 5), np.uint8)) & own
    out = cv2.inpaint(out[:, :, ::-1].copy(), hole, 6, cv2.INPAINT_TELEA)[:, :, ::-1]
    print('painted eyes filled: %d texels' % (hole > 0).sum())
    return out


def hug_eyes(V, faces, inv, isl, eyes, sockets):
    """Close each socket round its ball, as lids hug an eye: the face's edge round the opening comes
    onto the ball, the face near it follows smoothly (a harmonic blend over the surface out to
    twice the ball's radius), and the socket's inside tucks under the ball. Without this the low
    socket shows round the ball as a dark ring, and a shut eye looks like a lens cap."""
    import scipy.sparse as sp
    nU = inv.max() + 1
    U = np.zeros((nU, 3))
    U[inv] = V
    f = inv[faces]
    e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nU, nU)).tocsr()
    A = ((A + A.T) > 0).astype(np.float64)
    P = sp.diags(1 / np.maximum(np.asarray(A.sum(1)).ravel(), 1)) @ A
    for s in ('L', 'R'):
        c, r = eyes[s]['c'], eyes[s]['r']
        pit, face = eye_islands(V, isl, sockets[s])
        in_pit = np.zeros(nU, bool)
        in_pit[inv[np.isin(isl, pit)]] = True
        in_face = np.zeros(nU, bool)
        in_face[inv[isl == face]] = True
        d = U - c
        dist = np.linalg.norm(d, axis=1)
        dirn = d / np.maximum(dist, 1e-9)[:, None]
        D = np.zeros((nU, 3))
        rim = in_pit & in_face
        D[rim] = c + dirn[rim] * 1.02 * r - U[rim]
        inner = in_pit & ~in_face
        D[inner] = c + dirn[inner] * np.minimum(dist[inner], 0.95 * r)[:, None] - U[inner]
        free = in_face & ~rim & (dist < 2.2 * r)
        for _ in range(300):
            D[free] = (P @ D)[free]
        U += D
        print('eye %s: socket edge pulled onto the ball by up to %.1f mm' % (s, 1000 * np.linalg.norm(D[rim], axis=1).max()))
    return U[inv]


def lid_uv(V, uv, isl, o, eye, R, r):
    """An affine map from the eye's lid frame (x, y in ball radii) to texture UV, fitted on the
    face's island round the socket: the eye's own lids show the fur the head has there."""
    q = (V - eye) @ R / r
    _, face = eye_islands(V, isl, o)
    sel = (np.linalg.norm(q[:, :2], axis=1) < 2.2 * o['half'][0] / r) & (q[:, 2] > -0.3) & (isl == face)
    A = np.c_[q[sel, 0], q[sel, 1], np.ones(sel.sum())]
    coef, *_ = np.linalg.lstsq(A, uv[sel], rcond=None)
    err = np.linalg.norm(A @ coef - uv[sel], axis=1)
    return coef, float(np.median(err)), int(sel.sum())


# ------------------------------------------------------------------ weights
def chain_weights(V, pts, blend):
    """Weights over a chain of bones (bone i runs from pts[i] to pts[i+1]): each vertex goes to the
    bone it lies nearest, shared with the neighbouring bone across each joint"""
    n = len(pts) - 1
    T = np.zeros((len(V), n))
    D = np.zeros((len(V), n))
    for i in range(n):
        ab = pts[i + 1] - pts[i]
        T[:, i] = np.clip(((V - pts[i]) @ ab) / (ab @ ab), 0, 1)
        D[:, i] = np.linalg.norm(V - (pts[i] + T[:, i:i + 1] * ab), axis=1)
    near = np.argmin(D, 1)
    rows = np.arange(len(V))
    t = T[rows, near]
    a = np.where(near > 0, np.clip(0.5 * (1 - t / blend), 0, 0.5), 0)
    b = np.where(near < n - 1, np.clip(0.5 * (1 - (1 - t) / blend), 0, 0.5), 0)
    w = np.zeros((len(V), n))
    w[rows, near] = 1 - a - b
    m = near > 0
    w[rows[m], near[m] - 1] += a[m]
    m = near < n - 1
    w[rows[m], near[m] + 1] += b[m]
    return w


def merged(V):
    """index of each vertex's first copy (the UV seams split vertices that are one point)"""
    _, first, inv = np.unique(np.round(V, 7), axis=0, return_index=True, return_inverse=True)
    return inv.ravel(), first


def smooth(Wt, faces, inv, iters, keep=None):
    """diffuse weights over the surface (seam copies share one value)"""
    import scipy.sparse as sp
    nU = inv.max() + 1
    f = inv[faces]
    e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nU, nU)).tocsr()
    A = ((A + A.T) > 0).astype(np.float64)
    P = sp.diags(1 / np.maximum(np.asarray(A.sum(1)).ravel(), 1)) @ A
    cnt = np.bincount(inv, minlength=nU)[:, None]
    U = np.zeros((nU, Wt.shape[1]))
    np.add.at(U, inv, Wt)
    U /= cnt
    k = np.zeros((nU, 1)) if keep is None else np.bincount(inv, keep, minlength=nU)[:, None] / cnt
    for _ in range(iters):
        U = U * (0.5 + 0.5 * k) + (P @ U) * (0.5 - 0.5 * k)
    return U[inv]


def normals(V, faces, inv):
    fn = np.cross(V[faces[:, 1]] - V[faces[:, 0]], V[faces[:, 2]] - V[faces[:, 0]])
    nU = inv.max() + 1
    acc = np.zeros((nU, 3))
    for c in range(3): np.add.at(acc, inv[faces[:, c]], fn)
    acc /= np.linalg.norm(acc, axis=1, keepdims=True) + 1e-12
    return acc[inv]


# ------------------------------------------------------------------ main
def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'public', 'cat3d', 'fri.bin')
    F = load(sys.argv[2] if len(sys.argv) > 2 else fetch())
    V, J, faces, k = place(F)
    W = F['W']
    jp = lambda n: J[k[n]]
    V, tail = straighten_tail(V, W, J, k)
    inv, first = merged(V)
    tex = np.asarray(Image.open(io.BytesIO(F['png'])).convert('RGB')).astype(float) / 255

    # --- regions, as the model's artist weighted them
    side_of = lambda chain: 'L' if jp(chain[-1])[0] > 0 else 'R'
    G = {'trunk': W[:, [k[n] for n in SPINE[:4]]].sum(1), 'head': W[:, k[SPINE[4]]], 'tail': W[:, [k[n] for n in TAIL]].sum(1)}
    for c in FRONT: G[side_of(c) + 'F'] = W[:, [k[n] for n in c]].sum(1)
    for c in HIND: G[side_of(c) + 'H'] = W[:, [k[n] for n in c]].sum(1)
    tot = sum(G.values())
    for g in G: G[g] = G[g] / np.maximum(tot, 1e-9)

    # --- landmarks on the head
    headw = G['head']
    midline = (headw > 0.5) & (np.abs(V[:, 0]) < 0.004)
    nose = V[midline][np.argmax(V[midline][:, 2])]
    sockets = eye_sockets(V, faces, F['uv'], tex, headw, nose)

    # --- our skeleton, fitted into this body
    B = {n: M.pos(n).copy() for n in M.BONES}
    # the neck and head where the model carries them
    B['neck1'] = jp(SPINE[3]) * [0, 1, 1]
    B['head'] = jp(SPINE[4]) * [0, 1, 1]
    B['neck2'] = B['neck1'] + (B['head'] - B['neck1']) * 0.58
    # legs: our joint heights (the poses are built on them), across and along where the model's leg
    # runs at that height. The model's foreleg is straight: the shoulder joint stays as far forward as
    # ours (well inside its chest) and the elbow is set back a little, which gives the leg its bend
    # to fold along and our foreleg's length
    for chains, ours, toe in ((FRONT, ['scap', 'arm', 'fore', 'wrist', 'hand'], 'hand'), (HIND, ['thigh', 'shin', 'hock', 'foot'], 'foot')):
        for c in chains:
            s = side_of(c)
            w = sum(W[:, k[n]] for n in c)
            q = V[w > 0.5]
            pawc = q[q[:, 1] < np.percentile(q[:, 1], 15)].mean(0)
            line = np.array([jp(n) for n in c] + [pawc])           # top to bottom, falling height
            for n in ours:
                y = B[n + s][1]
                yy = line[:, 1][::-1]
                B[n + s][0] = np.interp(y, yy, line[:, 0][::-1])
                B[n + s][2] = np.interp(y, yy, line[:, 2][::-1])
            if ours[0] == 'scap':
                B['arm' + s][2] = M.pos('arm' + s)[2]
                B['fore' + s][2] -= 0.012
    # tail along the straightened line
    for i in range(M.TAIL_N): B[f'tail{i}'] = tail[i]
    # ears: where each ear rises off the skull
    for s, x in (('L', 1), ('R', -1)):
        e = (headw > 0.5) & (V[:, 0] * x > 0.02) & (V[:, 1] > 0.284) & (V[:, 1] < 0.296)
        B['ear' + s] = V[e].mean(0)
    # eyes: a ball in each painted socket, its front just proud of the opening
    eyes = {}
    fwd = np.array([0, 0, 1.0])
    for s in ('L', 'R'):
        o = sockets[s]
        r = 1.32 * o['half'][0]
        gaze = 0.8 * fwd + 0.2 * o['n']
        gaze /= np.linalg.norm(gaze)
        eyes[s] = dict(c=o['c'] - fwd * 0.71 * r, r=r, gaze=gaze, half=o['half'], skin=o['skin'])
    R_eye = (eyes['L']['r'] + eyes['R']['r']) / 2
    isl = uv_islands(faces, len(V))
    tex8 = paint_out_eyes((tex * 255).round().astype(np.uint8), V, faces, F['uv'], sockets, isl)
    V = hug_eyes(V, faces, inv, isl, eyes, sockets)
    buf = io.BytesIO()
    Image.fromarray(tex8).save(buf, 'PNG', optimize=True)
    png = buf.getvalue()
    eyeMid = (eyes['L']['c'] + eyes['R']['c']) / 2
    # jaw hinge: back under the eye, a little above the corner of the mouth (as in our own head)
    B['jaw'] = np.array([0, nose[1] - 0.008, eyeMid[2] - 0.04])
    print('bones moved from our own skeleton (cm):', {n: round(float(np.linalg.norm(B[n] - M.pos(n))) * 100, 1) for n in B if np.linalg.norm(B[n] - M.pos(n)) > 0.005})

    # --- weights: the artist's regions, shared out over our bones by where each vertex lies
    names = list(M.BONES.keys())
    bi = {n: i for i, n in enumerate(names)}
    Wo = np.zeros((len(V), len(names)))

    def add(group, bones, pts, blend):
        cw = chain_weights(V, [np.asarray(p) for p in pts], blend)
        for i, n in enumerate(bones): Wo[:, bi[n]] += G[group] * cw[:, i]
    trunk = ['hips', 'spine1', 'spine2', 'chest', 'neck1', 'neck2']
    add('trunk', trunk, [B[n] for n in trunk] + [B['head']], 0.5)
    for s in ('L', 'R'):
        fl = ['scap' + s, 'arm' + s, 'fore' + s, 'wrist' + s, 'hand' + s]
        add(s + 'F', fl, [B[n] for n in fl] + [B['hand' + s] + [0, -0.004, 0.022]], 0.3)
        hl = ['thigh' + s, 'shin' + s, 'hock' + s, 'foot' + s]
        add(s + 'H', hl, [B[n] for n in hl] + [B['foot' + s] + [0, -0.004, 0.024]], 0.3)
    tl = [f'tail{i}' for i in range(M.TAIL_N)]
    add('tail', tl, tail, 0.5)
    # the head: ears off the skull, the lower jaw below the mouth line
    ear = {s: smoothstep(0.283, 0.295, V[:, 1]) * smoothstep(0.016, 0.024, V[:, 0] * x) for s, x in (('L', 1), ('R', -1))}
    mouth = nose[1] - 0.012
    jaw = smoothstep(mouth + 0.002, mouth - 0.004, V[:, 1]) * smoothstep(B['jaw'][2] - 0.006, B['jaw'][2] + 0.01, V[:, 2])
    hw = G['head']
    Wo[:, bi['earL']] += hw * ear['L']
    Wo[:, bi['earR']] += hw * ear['R']
    Wo[:, bi['jaw']] += hw * jaw * (1 - ear['L'] - ear['R'])
    Wo[:, bi['head']] += hw * np.clip(1 - ear['L'] - ear['R'] - jaw, 0, 1)
    head_all = Wo[:, bi['head']] + Wo[:, bi['jaw']]
    Wo = smooth(Wo, faces, inv, 8, keep=np.clip((head_all - 0.6) / 0.3, 0, 1))
    Wo /= Wo.sum(1, keepdims=True)
    order = np.argsort(-Wo, axis=1)[:, :4]
    w4 = np.take_along_axis(Wo, order, 1)
    w4 /= w4.sum(1, keepdims=True)

    Nn = normals(V, faces, inv)
    out_frac = np.mean(np.einsum('ij,ij->i', Nn, V - V.mean(0)) > 0)
    print('vertices', len(V), 'triangles', len(faces), 'normals outward %.2f' % out_frac)

    E = lambda a: np.round(np.asarray(a, float), 5).tolist()

    def euler(g, roll):
        # three.js XYZ order: the eye's +z onto the gaze
        return [float(np.arctan2(-g[1], g[2])), float(np.arcsin(np.clip(g[0], -1, 1))), roll]
    pad = np.array([0.0128, -0.0079, -0.0055])
    lm = dict(head=E((eyeMid + B['head']) / 2), eyeL=E(eyes['L']['c']), eyeR=E(eyes['R']['c']), eyeRadius=round(float(R_eye), 5), headScale=1.0,
              eyeEulerL=euler(eyes['L']['gaze'], M.EYE_EULER[2]), eyeEulerR=euler(eyes['R']['gaze'], -M.EYE_EULER[2]),
              # the opening the eye's own lids leave, against our default lids (eye.ts), and their skin
              lidScale=E([np.mean([eyes[s]['half'][0] / eyes[s]['r'] for s in 'LR']) / 0.62, np.mean([eyes[s]['half'][1] / eyes[s]['r'] for s in 'LR']) / 0.465]),
              lidCol=E(np.mean([eyes[s]['skin'] for s in 'LR'], 0)),
              tailBase=E(tail[0]), tailVec=E(tail[-1] - tail[0]), legTop=0.132, backY=0.25, bellyY=0.15, bib=[0, 0.168, 0.096], ribs=[0, 0.19, -0.01],
              nose=E(nose), padL=E(nose + pad), padR=E(nose + pad * [-1, 1, 1]))
    for s, key in (('L', 'eyeEulerL'), ('R', 'eyeEulerR')):
        coef, err, n = lid_uv(V, F['uv'], isl, sockets[s], eyes[s]['c'], M.euler_xyz(*lm[key]), R_eye)
        lm['lidUV' + s] = E(coef.T.ravel())          # u = a.x + b.y + c, v = d.x + e.y + f
        print('lid -> texture map, eye %s: %d head vertices, median miss %.4f of the texture' % (s, n, err))
    print('eyes: radius %.1f mm, centres %s / %s, lid opening x%s' % (R_eye * 1000, lm['eyeL'], lm['eyeR'], lm['lidScale']))
    export(out, V, faces, Nn, order, w4, F['uv'], names, B, lm, png)
    print('wrote', out)


def export(out, V, faces, Nn, j, w, uv, names, B, lm, png):
    """same layout as model.py's export_bin (read by src/cat3d/load.ts), plus UVs and the texture"""
    blobs, off = [], 0

    def add(arr):
        nonlocal off
        b = arr if isinstance(arr, bytes) else np.ascontiguousarray(arr).tobytes()
        pad = (-len(b)) % 4
        blobs.append(b + b'\0' * pad)
        o = off
        off += len(b) + pad
        return o
    n = len(V)
    mesh = dict(name='body', count=n, index=len(faces) * 3, pos=add(V.astype(np.float32)), nrm=add(Nn.astype(np.float32)),
                jnt=add(j.astype(np.uint16)), wgt=add(w.astype(np.float32)), idx=add(faces.astype(np.uint32)),
                reg=add(np.zeros(n, np.float32)), aux=add(np.zeros((n, 3), np.float32)), uv=add(uv.astype(np.float32)))
    texture = dict(data=add(png), bytes=len(png), mime='image/png')
    bones = [{'name': nm, 'parent': M.BONES[nm][0], 'pos': np.round(B[nm], 5).tolist()} for nm in names]
    head = json.dumps(dict(landmarks=lm, bones=bones, meshes=[mesh], correctives=None, strands=None, texture=texture, credit=CREDIT)).encode()
    head += b' ' * ((-len(head)) % 4)
    with open(out, 'wb') as fh:
        fh.write(np.array([len(head)], np.uint32).tobytes())
        fh.write(head)
        for b in blobs: fh.write(b)


if __name__ == '__main__':
    main()
