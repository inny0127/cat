"""Procedural 3D cat: an anatomical signed-distance sculpt built around a skeleton.

Every primitive belongs to a bone, so after polygonising, each vertex is skinned to the bones
whose shapes it came from. Units are metres; +y up, +z is the direction the cat faces, +x is
the cat's left.
"""
import json, sys, os
import numpy as np

# ------------------------------------------------------------------ skeleton (rest = standing)
def P(*v): return np.array(v, float)

BONES = {}   # name -> (parent, head position)
def bone(name, parent, pos): BONES[name] = (parent, P(*pos))

bone('root', None, (0, 0, -0.03))
bone('hips', 'root', (0, 0.194, -0.138))
bone('spine1', 'hips', (0, 0.200, -0.082))
bone('spine2', 'spine1', (0, 0.202, -0.018))
bone('chest', 'spine2', (0, 0.198, 0.045))
bone('neck1', 'chest', (0, 0.200, 0.090))
bone('neck2', 'neck1', (0, 0.215, 0.118))
bone('head', 'neck2', (0, 0.230, 0.140))
HC = P(0, 0.240, 0.163)      # centre of the head
bone('jaw', 'head', tuple(HC + P(0, -0.014, -0.004)))
for s, x in (('L', 1), ('R', -1)):
    bone('ear' + s, 'head', tuple(HC + P(x * 0.030, 0.029, -0.007)))
    bone('scap' + s, 'chest', (x * 0.028, 0.212, 0.078))
    bone('arm' + s, 'scap' + s, (x * 0.042, 0.150, 0.098))
    bone('fore' + s, 'arm' + s, (x * 0.042, 0.098, 0.074))
    bone('wrist' + s, 'fore' + s, (x * 0.040, 0.028, 0.090))
    bone('hand' + s, 'wrist' + s, (x * 0.040, 0.012, 0.106))
    bone('thigh' + s, 'hips', (x * 0.044, 0.178, -0.146))
    bone('shin' + s, 'thigh' + s, (x * 0.047, 0.112, -0.100))
    bone('hock' + s, 'shin' + s, (x * 0.045, 0.058, -0.172))
    bone('foot' + s, 'hock' + s, (x * 0.043, 0.014, -0.150))
TAIL_N = 10
tail_pts = [P(0, 0.200, -0.182) + (P(0, -0.11, -0.27) * i / TAIL_N) for i in range(TAIL_N + 1)]
for i in range(TAIL_N):
    bone(f'tail{i}', 'hips' if i == 0 else f'tail{i-1}', tail_pts[i])

def pos(name): return BONES[name][1]

EYE_R = 0.0102
EYE_EULER = (-0.12, 0.22, 0.08)          # three.js XYZ order, left eye; the right one is mirrored
def eye_centre(x): return HC + P(x * 0.0195, 0.005, 0.029)
def euler_xyz(a, b, c):
    ca, sa, cb, sb, cc, sc = np.cos(a), np.sin(a), np.cos(b), np.sin(b), np.cos(c), np.sin(c)
    rx = np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])
    ry = np.array([[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]])
    rz = np.array([[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]])
    return rx @ ry @ rz
def eye_rot(x): return euler_xyz(EYE_EULER[0], x * EYE_EULER[1], x * EYE_EULER[2])

# ------------------------------------------------------------------ SDF primitives
PRIMS = []
def ell(bone_, c, r, k=0.02, rot=None):
    PRIMS.append(dict(t='ell', b=bone_, c=P(*c), r=P(*r), k=k, rot=rot))
def cone(bone_, a, b, ra, rb, k=0.012):
    PRIMS.append(dict(t='cone', b=bone_, a=P(*a), bb=P(*b), ra=ra, rb=rb, k=k))
def sub(bone_, c, r, k=0.006):
    PRIMS.append(dict(t='sub', b=bone_, c=P(*c), r=P(*r), k=k))
def H(*o): return tuple(HC + P(*o))

# torso: deep chest and belly (fur included), level back ~0.25 m
ell('chest', (0, 0.172, 0.048), (0.051, 0.069, 0.070), k=0.03)
ell('chest', (0, 0.150, 0.095), (0.040, 0.054, 0.036), k=0.03)      # chest ruff
ell('spine2', (0, 0.180, -0.018), (0.052, 0.064, 0.060), k=0.035)
ell('spine1', (0, 0.186, -0.080), (0.047, 0.058, 0.050), k=0.035)
ell('hips', (0, 0.186, -0.138), (0.052, 0.056, 0.050), k=0.03)
# short neck carrying the head about level with the back
cone('neck1', (0, 0.196, 0.085), (0, 0.214, 0.118), 0.040, 0.035, k=0.03)
cone('neck2', (0, 0.214, 0.118), (0, 0.230, 0.142), 0.035, 0.032, k=0.025)
# head: a wide, low cranium over full cheeks; the muzzle drops well below the eyes, nose leather in front
ell('head', H(0, 0.005, -0.008), (0.041, 0.034, 0.041), k=0.012)        # cranium
ell('head', H(0, 0.012, 0.016), (0.028, 0.019, 0.024), k=0.010)         # brow / forehead
for x in (1, -1):
    ell('head', H(x * 0.021, -0.012, 0.010), (0.025, 0.022, 0.025), k=0.014)   # cheeks
    ell('head', H(x * 0.0082, -0.0235, 0.0415), (0.0105, 0.0085, 0.0092), k=0.004)  # whisker pads
ell('head', H(0, -0.020, 0.033), (0.018, 0.014, 0.016), k=0.007)        # muzzle
ell('head', H(0, -0.0065, 0.036), (0.0085, 0.0135, 0.0125), k=0.008)    # nose bridge
ell('head', H(0, -0.0160, 0.0450), (0.0060, 0.0048, 0.0052), k=0.003)   # nose leather
ell('head', H(0, -0.0192, 0.0458), (0.0034, 0.0030, 0.0042), k=0.003)   # point of the nose
ell('jaw', H(0, -0.0335, 0.031), (0.0120, 0.0075, 0.0120), k=0.006)     # chin
# eyes: a socket round each eyeball, filled by the lids (a skin sphere just outside the ball;
# the shader cuts the opening). The ball itself is a separate mesh.
for x in (1, -1):
    c = tuple(HC + P(x * 0.0195, 0.005, 0.029))
    sub('head', c, (0.0122, 0.0122, 0.0122), k=0.003)
    PRIMS.append(dict(t='ell', b='head', c=P(*c), r=P(0.011, 0.011, 0.011), k=0.0025, rot=None))
# legs: short below the body, thick upper limbs
for s, x in (('L', 1), ('R', -1)):
    ell('scap' + s, (x * 0.038, 0.185, 0.075), (0.024, 0.055, 0.036), k=0.02)
    cone('arm' + s, pos('arm' + s), pos('fore' + s), 0.023, 0.017, k=0.014)
    cone('fore' + s, pos('fore' + s), pos('wrist' + s), 0.0155, 0.0115, k=0.008)
    cone('wrist' + s, pos('wrist' + s), pos('hand' + s), 0.0115, 0.0115, k=0.006)
    ell('hand' + s, (x * 0.040, 0.0115, 0.109), (0.0165, 0.011, 0.020), k=0.006)
    ell('thigh' + s, (x * 0.042, 0.156, -0.120), (0.031, 0.062, 0.050), k=0.025)
    cone('shin' + s, pos('shin' + s), pos('hock' + s), 0.019, 0.010, k=0.01)
    cone('hock' + s, pos('hock' + s), pos('foot' + s), 0.0105, 0.0112, k=0.006)
    ell('foot' + s, (x * 0.043, 0.0115, -0.145), (0.0162, 0.011, 0.022), k=0.006)
# tail: one smooth tapering tube
for i in range(TAIL_N):
    r0 = 0.0175 - 0.0065 * i / TAIL_N
    r1 = 0.0175 - 0.0065 * (i + 1) / TAIL_N
    cone(f'tail{i}', tail_pts[i], tail_pts[i + 1], r0, r1, k=0.02)

# ------------------------------------------------------------------ evaluation
def d_ell(p, c, r):
    q = (p - c) / r
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm((p - c) / (r * r), axis=-1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

def d_cone(p, a, b, ra, rb):
    ba = b - a
    pa = p - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    r = ra + (rb - ra) * h
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - r

def prim_d(pr, p):
    if pr['t'] in ('ell', 'sub'): return d_ell(p, pr['c'], pr['r'])
    return d_cone(p, pr['a'], pr['bb'], pr['ra'], pr['rb'])

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def smax(a, b, k):
    return -smin(-a, -b, k)

def sdf(p):
    d = np.full(p.shape[:-1], 1e3)
    for pr in PRIMS:
        if pr['t'] == 'sub':
            d = smax(d, -prim_d(pr, p), pr['k'])
        else:
            d = smin(d, prim_d(pr, p), pr['k'])
    return d

def polygonize(step=0.0022):
    from skimage import measure
    lo = P(-0.10, -0.005, -0.50); hi = P(0.10, 0.34, 0.26)
    xs = np.arange(lo[0], hi[0], step); ys = np.arange(lo[1], hi[1], step); zs = np.arange(lo[2], hi[2], step)
    vol = np.empty((len(xs), len(ys), len(zs)), np.float32)
    for i, x in enumerate(xs):
        Y, Z = np.meshgrid(ys, zs, indexing='ij')
        p = np.stack([np.full_like(Y, x), Y, Z], -1)
        vol[i] = sdf(p)
    verts, faces, normals, _ = measure.marching_cubes(vol, 0.0, spacing=(step, step, step))
    verts += lo
    return verts, faces

def skin_weights(verts):
    """weights from how close each vertex is to the surface of each bone's primitives"""
    names = list(BONES.keys())
    idx = {n: i for i, n in enumerate(names)}
    acc = np.zeros((len(verts), len(names)))
    ds = []
    for pr in PRIMS:
        if pr['t'] == 'sub': continue
        ds.append((pr['b'], prim_d(pr, verts)))
    dmin = np.min([d for _, d in ds], axis=0)
    for b, d in ds:
        w = np.exp(-np.maximum(d - dmin, 0) / 0.006)
        acc[:, idx[b]] = np.maximum(acc[:, idx[b]], w)
    # keep the 4 strongest
    order = np.argsort(-acc, axis=1)[:, :4]
    w4 = np.take_along_axis(acc, order, 1)
    w4 /= w4.sum(1, keepdims=True)
    return order.astype(np.uint16), w4.astype(np.float32), names

def export_bin(out, meshes, names):
    """Binary layout: header json (bones, mesh ranges) + float/uint arrays, read by src/cat3d/load.ts"""
    blobs, desc, off = [], [], 0
    def add(arr):
        nonlocal off
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-len(b)) % 4
        blobs.append(b + b'\0' * pad)
        o = off
        off += len(b) + pad
        return o
    for mesh in meshes:
        name, v, f, n, j, w, reg = mesh[:7]
        aux = mesh[7] if len(mesh) > 7 else np.zeros((len(v), 3))
        desc.append(dict(name=name, count=len(v), index=len(f) * 3,
                         pos=add(v.astype(np.float32)), nrm=add(n.astype(np.float32)),
                         jnt=add(j.astype(np.uint16)), wgt=add(w.astype(np.float32)), idx=add(f.astype(np.uint32)),
                         reg=add(reg.astype(np.float32)), aux=add(aux.astype(np.float32))))
    E = lambda x: eye_centre(x).round(5).tolist()
    marks = dict(head=HC.round(5).tolist(), eyeL=E(1), eyeR=E(-1), eyeRadius=EYE_R,
                 eyeEulerL=list(EYE_EULER), eyeEulerR=[EYE_EULER[0], -EYE_EULER[1], -EYE_EULER[2]],
                 nose=(HC + P(0, -0.016, 0.050)).round(5).tolist(),
                 padL=(HC + P(0.0105, -0.0215, 0.0480)).round(5).tolist(), padR=(HC + P(-0.0105, -0.0215, 0.0480)).round(5).tolist())
    head = json.dumps(dict(landmarks=marks, bones=[{'name': nm, 'parent': BONES[nm][0], 'pos': BONES[nm][1].round(5).tolist()} for nm in names],
                           meshes=desc)).encode()
    head += b' ' * ((-len(head)) % 4)
    with open(out, 'wb') as fh:
        fh.write(np.array([len(head)], np.uint32).tobytes())
        fh.write(head)
        for b in blobs: fh.write(b)


# ------------------------------------------------------------------ ears
def ear_mesh(side, names):
    """A cupped triangular shell, thin, skinned to its ear bone (blending into the head at the base)."""
    x = 1 if side == 'L' else -1
    base = pos('ear' + side)
    H_, W_, T_ = 0.042, 0.038, 0.0032
    nu, nv = 18, 14
    # ear frame: up, outward tilt, facing forward and a bit out
    tilt, turn = np.radians(24), np.radians(22)
    up = np.array([x * np.sin(tilt), np.cos(tilt), 0.0])
    fwd = np.array([x * np.sin(turn), 0.0, np.cos(turn)])
    fwd -= up * (fwd @ up); fwd /= np.linalg.norm(fwd)
    side_v = np.cross(up, fwd) * x
    def root_t(q):
        # how far along `up` from q the skull surface is; the ear starts 2.5 mm under the skin
        lo, hi = -0.04, 0.03
        for _ in range(40):
            mid = (lo + hi) / 2
            if sdf((q + up * mid)[None])[0] < -0.0025: lo = mid
            else: hi = mid
        return lo
    t0s = []
    for k in range(nv + 1):
        v = k / nv * 2 - 1
        t0s.append(root_t(base - fwd * 0.004 + side_v * (v * W_ / 2) - fwd * 0.013 * (1 - v * v)))
    verts, regs = [], []
    for sheet in (0, 1):
        for i in range(nu + 1):
            u = i / nu
            w = W_ * (1 - u) ** 0.62 * (1 - 0.3 * u)
            for k in range(nv + 1):
                v = k / nv * 2 - 1
                cup = 0.013 * (1 - v * v) * (1 - u) ** 0.5
                t0 = t0s[k]
                p = base + up * (t0 + (H_ - t0) * u) - fwd * 0.004 + side_v * (v * w / 2) - fwd * cup
                if sheet == 1:
                    p = p - fwd * T_ * (1 - 0.6 * u)
                verts.append(p)
                regs.append(1.0 if sheet == 0 and abs(v) < 0.8 and u < 0.92 else 2.0)
    verts = np.array(verts)
    faces = []
    row = nv + 1
    sheet_n = (nu + 1) * row
    for sh in (0, 1):
        o = sh * sheet_n
        for i in range(nu):
            for k in range(nv):
                a_ = o + i * row + k; b_ = a_ + 1; c_ = a_ + row; d_ = c_ + 1
                if sh == 0: faces += [(a_, c_, b_), (b_, c_, d_)]
                else: faces += [(a_, b_, c_), (b_, d_, c_)]
    # close the rim (sides and tip) between the sheets
    for i in range(nu):
        for k in (0, nv):
            a_ = i * row + k; c_ = a_ + row
            a2, c2 = a_ + sheet_n, c_ + sheet_n
            if k == 0: faces += [(a_, a2, c_), (c_, a2, c2)]
            else: faces += [(a_, c_, a2), (c_, c2, a2)]
    faces = np.array(faces)
    import trimesh
    m = trimesh.Trimesh(verts, faces, process=False)
    normals = np.asarray(m.vertex_normals)
    names_idx = {n: i for i, n in enumerate(names)}
    j = np.zeros((len(verts), 4), np.uint16); w = np.zeros((len(verts), 4), np.float32)
    hgt = ((verts - base) @ up) / H_
    we = np.clip((hgt + 0.05) / 0.3, 0, 1)
    j[:, 0] = names_idx['ear' + side]; j[:, 1] = names_idx['head']
    w[:, 0] = we; w[:, 1] = 1 - we
    return ('ear' + side, verts, faces, normals, j, w, np.array(regs))


# ------------------------------------------------------------------ eyelids
def lid_mesh(side, names):
    """A sphere of skin just outside the eyeball; the shader cuts the opening and furs the rest.
    aux carries each vertex's direction in the eye's own frame (+z looks out of the eye)."""
    x = 1 if side == 'L' else -1
    c, R = eye_centre(x), eye_rot(x)
    r = EYE_R * 1.08
    nth, nph = 40, 64
    dirs = []
    for i in range(nth + 1):
        th = np.pi * i / nth                      # from +z (front) to -z
        for k in range(nph):
            ph = 2 * np.pi * k / nph
            dirs.append((np.sin(th) * np.cos(ph), np.sin(th) * np.sin(ph), np.cos(th)))
    dirs = np.array(dirs)
    keep_rows = int(nth * 0.62)                   # the back of the ball is buried in the skull
    faces = []
    for i in range(keep_rows):
        for k in range(nph):
            a_ = i * nph + k; b_ = i * nph + (k + 1) % nph; c_ = a_ + nph; d_ = b_ + nph
            faces += [(a_, c_, b_), (b_, c_, d_)]
    nv_ = (keep_rows + 1) * nph
    dirs = dirs[:nv_]
    faces = np.array(faces)
    verts = c + (dirs * r) @ R.T
    normals = dirs @ R.T
    names_idx = {n: i for i, n in enumerate(names)}
    j = np.zeros((len(verts), 4), np.uint16); w = np.zeros((len(verts), 4), np.float32)
    j[:, 0] = names_idx['head']; w[:, 0] = 1
    return ('lid' + side, verts, faces, normals, j, w, np.full(len(verts), 3.0), dirs)


def main():
    import trimesh
    import pymeshlab
    out = sys.argv[1] if len(sys.argv) > 1 else 'cat_body'
    v, f = polygonize(float(sys.argv[2]) if len(sys.argv) > 2 else 0.0018)
    target = int(sys.argv[3]) if len(sys.argv) > 3 else 45000
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(v, f[:, ::-1].copy()))   # skimage winds inward for our sign
    ms.meshing_remove_duplicate_vertices()
    ms.apply_coord_taubin_smoothing(lambda_=0.5, mu=-0.53, stepsmoothnum=12)
    # quadric collapse keeps detail where the surface bends (face, paws) and never opens holes
    ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target, qualitythr=0.6, preservetopology=True,
                                                 optimalplacement=True, planarquadric=True, preservenormal=True)
    ms.meshing_remove_unreferenced_vertices()
    mm = ms.current_mesh()
    m = trimesh.Trimesh(mm.vertex_matrix(), mm.face_matrix(), process=True)
    parts = m.split(only_watertight=False)
    m = max(parts, key=lambda x: len(x.faces))
    m.remove_unreferenced_vertices()
    m.fix_normals()
    # recompute from the final winding (trimesh's cached normals can lag behind a flip)
    m = trimesh.Trimesh(np.asarray(m.vertices), np.asarray(m.faces), process=False)
    if m.volume < 0: m.invert()
    vn = np.asarray(m.vertex_normals)
    out_ = np.mean(np.sum(vn * (m.vertices - m.vertices.mean(0)), 1) > 0)
    print('body faces', len(m.faces), 'watertight', m.is_watertight, 'normals outward', round(float(out_), 3))
    j, w, names = skin_weights(np.asarray(m.vertices))
    body = ('body', np.asarray(m.vertices), np.asarray(m.faces), vn, j, w, np.zeros(len(m.vertices)))
    meshes = [body, ear_mesh('L', names), ear_mesh('R', names)]
    export_bin(out + '.cat', meshes, names)
    # static preview with ears
    allm = [trimesh.Trimesh(mm[1], mm[2], process=False) for mm in meshes]
    trimesh.util.concatenate(allm).export(out + '.glb')


if __name__ == '__main__':
    main()
