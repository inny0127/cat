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

# proportions from feline anatomy (adult domestic cat, ~4 kg): withers ~0.24 m, sternum ~0.12,
# humerus 0.074, radius 0.080, femur 0.088, tibia 0.094, hind cannon 0.061
bone('root', None, (0, 0, -0.03))
bone('hips', 'root', (0, 0.218, -0.150))
bone('spine1', 'hips', (0, 0.224, -0.088))
bone('spine2', 'spine1', (0, 0.226, -0.025))
bone('chest', 'spine2', (0, 0.222, 0.040))
bone('neck1', 'chest', (0, 0.226, 0.088))
bone('neck2', 'neck1', (0, 0.246, 0.116))
bone('head', 'neck2', (0, 0.266, 0.136))
HC = P(0, 0.276, 0.159)      # centre of the head
HS = 1.2                      # the whole head (skull, face, eyes, ears) is drawn at this scale
bone('jaw', 'head', tuple(HC + P(0, -0.014, -0.004) * HS))
for s, x in (('L', 1), ('R', -1)):
    bone('ear' + s, 'head', tuple(HC + P(x * 0.0245, 0.03, 0.004) * HS))
    bone('scap' + s, 'chest', (x * 0.030, 0.240, 0.066))
    bone('arm' + s, 'scap' + s, (x * 0.040, 0.178, 0.104))
    bone('fore' + s, 'arm' + s, (x * 0.045, 0.112, 0.070))
    bone('wrist' + s, 'fore' + s, (x * 0.040, 0.034, 0.088))
    bone('hand' + s, 'wrist' + s, (x * 0.039, 0.012, 0.104))
    bone('thigh' + s, 'hips', (x * 0.045, 0.200, -0.160))
    bone('shin' + s, 'thigh' + s, (x * 0.050, 0.126, -0.112))
    bone('hock' + s, 'shin' + s, (x * 0.046, 0.068, -0.186))
    bone('foot' + s, 'hock' + s, (x * 0.044, 0.013, -0.160))
TAIL_N = 10
TAIL_BASE = P(0, 0.222, -0.198)
TAIL_VEC = P(0, -0.12, -0.26)
tail_pts = [TAIL_BASE + TAIL_VEC * i / TAIL_N for i in range(TAIL_N + 1)]
for i in range(TAIL_N):
    bone(f'tail{i}', 'hips' if i == 0 else f'tail{i-1}', tail_pts[i])

def pos(name): return BONES[name][1]

EYE_R = 0.0092 * HS
EYE_EULER = (-0.12, 0.22, 0.08)          # three.js XYZ order, left eye; the right one is mirrored
def eye_centre(x): return HC + P(x * 0.0146, 0.005, 0.0275) * HS
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
    sc = HS if bone_ in ('head', 'jaw') else 1.0
    PRIMS.append(dict(t='ell', b=bone_, c=P(*c), r=P(*r) * sc, k=k * sc, rot=rot))
def cone(bone_, a, b, ra, rb, k=0.012):
    PRIMS.append(dict(t='cone', b=bone_, a=P(*a), bb=P(*b), ra=ra, rb=rb, k=k))
def sub(bone_, c, r, k=0.006):
    PRIMS.append(dict(t='sub', b=bone_, c=P(*c), r=P(*r), k=k))
def H(*o): return tuple(HC + P(*o) * HS)

# torso: deep ribcage down to the sternum between the elbows, waist tucked up, rounded rump
ell('chest', (0, 0.192, 0.048), (0.052, 0.068, 0.070), k=0.03)
ell('chest', (0, 0.168, 0.092), (0.038, 0.050, 0.036), k=0.03)      # brisket
ell('spine2', (0, 0.202, -0.022), (0.055, 0.064, 0.060), k=0.035)
ell('spine1', (0, 0.204, -0.088), (0.053, 0.060, 0.052), k=0.035)
ell('hips', (0, 0.208, -0.150), (0.050, 0.056, 0.050), k=0.03)
# neck carrying the head a little above the back
cone('neck1', (0, 0.218, 0.082), (0, 0.246, 0.116), 0.041, 0.036, k=0.03)
cone('neck2', (0, 0.246, 0.116), (0, 0.266, 0.140), 0.036, 0.031, k=0.025)
# head: a wide, low cranium over full cheeks; the muzzle drops well below the eyes, nose leather in front
ell('head', H(0, 0.009, -0.003), (0.0305, 0.028, 0.031), k=0.012)       # cranium
ell('head', H(0, 0.02, 0.002), (0.028, 0.0155, 0.03), k=0.012)         # broad flat forehead
ell('head', H(0, 0.011, 0.016), (0.026, 0.016, 0.024), k=0.010)         # brow
for x in (1, -1):
    # the orbit's rim: a brow over the eye and a cheekbone under it, as far forward as the cornea
    ell('head', H(x * 0.0155, 0.0162, 0.025), (0.0122, 0.0054, 0.0086), k=0.006)  # brow ridge
    ell('head', H(x * 0.0172, -0.0068, 0.025), (0.0116, 0.005, 0.0082), k=0.006)  # cheekbone
for x in (1, -1):
    ell('head', H(x * 0.016, -0.008, 0.007), (0.0155, 0.018, 0.019), k=0.014)   # cheeks
    ell('head', H(x * 0.0082, -0.0194, 0.0398), (0.0094, 0.0078, 0.0086), k=0.006)  # whisker pads
ell('head', H(0, -0.0162, 0.032), (0.0165, 0.0122, 0.0152), k=0.007)    # muzzle
ell('head', H(0, -0.0045, 0.0355), (0.0072, 0.0118, 0.0125), k=0.008)  # nose bridge
ell('head', H(0, -0.0120, 0.0440), (0.0066, 0.0050, 0.0055), k=0.003)   # nose leather
ell('head', H(0, -0.0154, 0.0448), (0.0036, 0.0030, 0.0042), k=0.003)   # point of the nose
ell('jaw', H(0, -0.0272, 0.0315), (0.0094, 0.006, 0.0094), k=0.006)     # chin
# eyes: a socket round each eyeball, filled by the lids (a skin sphere just outside the ball;
# the shader cuts the opening). The ball itself is a separate mesh.
for x in (1, -1):
    c = tuple(eye_centre(x))
    sub('head', c, (0.0108 * HS,) * 3, k=0.003)
    PRIMS.append(dict(t='ell', b='head', c=P(*c), r=P(0.0096, 0.0096, 0.0096) * HS, k=0.004, rot=None))
# legs, with round paws and four toes each
TOES = [(-0.0112, -0.004), (-0.0038, 0.0), (0.0038, 0.0), (0.0112, -0.004)]
for s, x in (('L', 1), ('R', -1)):
    ell('scap' + s, (x * 0.036, 0.205, 0.075), (0.022, 0.050, 0.034), k=0.02)
    cone('arm' + s, pos('arm' + s), pos('fore' + s), 0.024, 0.018, k=0.014)
    cone('fore' + s, pos('fore' + s), pos('wrist' + s), 0.016, 0.012, k=0.008)
    cone('wrist' + s, pos('wrist' + s), pos('hand' + s), 0.012, 0.0115, k=0.006)
    ell('hand' + s, (x * 0.039, 0.0115, 0.106), (0.0172, 0.0112, 0.019), k=0.006)
    for tx, tz in TOES:
        ell('hand' + s, (x * 0.039 + tx, 0.0085, 0.121 + tz), (0.0062, 0.0072, 0.0068), k=0.0035)
    ell('thigh' + s, (x * 0.043, 0.176, -0.135), (0.031, 0.066, 0.054), k=0.025)
    cone('shin' + s, pos('shin' + s), pos('hock' + s), 0.020, 0.011, k=0.01)
    cone('hock' + s, pos('hock' + s), pos('foot' + s), 0.0105, 0.0112, k=0.006)
    ell('foot' + s, (x * 0.044, 0.0115, -0.161), (0.0162, 0.0112, 0.021), k=0.006)
    for tx, tz in TOES:
        ell('foot' + s, (x * 0.044 + tx * 0.95, 0.0085, -0.146 + tz), (0.0060, 0.0070, 0.0066), k=0.0035)
# tail: one smooth tapering tube
for i in range(TAIL_N):
    r0 = 0.0182 - 0.0075 * i / TAIL_N
    r1 = 0.0182 - 0.0075 * (i + 1) / TAIL_N
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
    if pr['t'] in ('ell', 'sub'):
        if pr.get('R') is not None:
            return d_ell((p - pr['c']) @ pr['R'], 0.0, pr['r'])
        return d_ell(p, pr['c'], pr['r'])
    return d_cone(p, pr['a'], pr['bb'], pr['ra'], pr['rb'])

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def smax(a, b, k):
    return -smin(-a, -b, k)

def sdf(p, prims=None):
    d = np.full(p.shape[:-1], 1e3)
    for pr in (PRIMS if prims is None else prims):
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

def skin_weights(verts, faces=None, iters=30):
    """Weights from how close each vertex is to the surface of each bone's primitives, then
    diffused over the surface so joints bend in smooth folds instead of creasing (the head is
    left crisp so the jaw line can open)."""
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
    acc /= acc.sum(1, keepdims=True)
    if faces is not None and iters:
        import scipy.sparse as sp
        V = len(verts)
        e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
        A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(V, V)).tocsr()
        A = ((A + A.T) > 0).astype(np.float64)
        deg = np.asarray(A.sum(1)).ravel()
        P = sp.diags(1 / np.maximum(deg, 1)) @ A
        head = acc[:, idx['head']] + acc[:, idx['jaw']]
        keep = np.clip((head - 0.65) / 0.3, 0, 1)[:, None]
        for _ in range(iters):
            acc = acc * (0.5 + 0.5 * keep) + (P @ acc) * (0.5 - 0.5 * keep)
    # keep the 4 strongest
    order = np.argsort(-acc, axis=1)[:, :4]
    w4 = np.take_along_axis(acc, order, 1)
    w4 /= w4.sum(1, keepdims=True)
    return order.astype(np.uint16), w4.astype(np.float32), names

def export_bin(out, meshes, names, corr=None, strands=None):
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
                 tailBase=TAIL_BASE.round(5).tolist(), tailVec=TAIL_VEC.round(5).tolist(),
                 legTop=0.132, backY=0.262, bellyY=0.15, bib=[0, 0.168, 0.096], ribs=[0, 0.19, -0.01],
                 nose=(HC + P(0, -0.012, 0.049) * HS).round(5).tolist(), headScale=HS,
                 padL=(HC + P(0.0105, -0.0175, 0.0470) * HS).round(5).tolist(), padR=(HC + P(-0.0105, -0.0175, 0.0470) * HS).round(5).tolist())
    corr_desc = None
    if corr:
        # half floats: [pose][pos|normal][vertex][xyz]
        arr = np.stack([np.stack([dp, dn]) for dp, dn in corr]).astype(np.float16)
        corr_desc = dict(poses=CORRECT, count=int(arr.shape[2]), data=add(arr))
    strand_desc = None
    if strands is not None:
        spos, snrm, sj, sw, sidx, sseed = strands
        strand_desc = dict(count=int(len(spos)), pos=add(spos.astype(np.float32)), nrm=add(snrm.astype(np.float32)),
                           jnt=add(sj.astype(np.uint16)), wgt=add(sw.astype(np.float32)),
                           vid=add(sidx.astype(np.float32)), seed=add(sseed.astype(np.float32)))
    head = json.dumps(dict(landmarks=marks, bones=[{'name': nm, 'parent': BONES[nm][0], 'pos': BONES[nm][1].round(5).tolist()} for nm in names],
                           meshes=desc, correctives=corr_desc, strands=strand_desc)).encode()
    head += b' ' * ((-len(head)) % 4)
    with open(out, 'wb') as fh:
        fh.write(np.array([len(head)], np.uint32).tobytes())
        fh.write(head)
        for b in blobs: fh.write(b)


# ------------------------------------------------------------------ ears
def ear_mesh(side, names):
    """The pinna: a cupped cone with a rounded tip, thick at the base and thin at the edges, skinned
    to its ear bone (blending into the head at the base). aux carries (height up the ear, position
    across it: -1 at the edge nearer the midline, +1 at the outer edge; 0 inner sheet / 1 outer)
    for the coat shader."""
    x = 1 if side == 'L' else -1
    base = pos('ear' + side)
    H_, W_ = 0.036 * HS, 0.037 * HS
    nu, nv = 24, 18
    # ear frame: up, outward tilt, facing forward and a bit out
    tilt, turn = np.radians(30), np.radians(24)
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
    def cup_of(u, v):
        # a deep funnel at the base, shallowing toward the tip; the outer edge curls forward a little
        return 0.021 * (1 - v * v) * (1 - u) ** 0.65 - 0.002 * max(v, 0) ** 3 * (1 - u)
    t0s = []
    for k in range(nv + 1):
        v = k / nv * 2 - 1
        t0s.append(root_t(base - fwd * 0.004 + side_v * (v * W_ / 2) - fwd * cup_of(0, v)))
    verts, regs, aux = [], [], []
    for sheet in (0, 1):
        for i in range(nu + 1):
            u = i / nu
            # rounded tip: the width falls away smoothly over the last fifth
            w = W_ * (1 - u ** 2.2) ** 0.55 * (1 - 0.2 * u)
            thick = 0.0055 * (1 - u) ** 1.5 + 0.0012
            for k in range(nv + 1):
                v = k / nv * 2 - 1
                t0 = t0s[k]
                p = base + up * (t0 + (H_ - t0) * u) - fwd * 0.004 + side_v * (v * w / 2) - fwd * cup_of(u, v)
                if sheet == 1:
                    # the back of the ear bulges: thickest down the middle
                    p = p - fwd * thick * (0.35 + 0.65 * (1 - v * v))
                verts.append(p)
                regs.append(1.0 if sheet == 0 and abs(v) < 0.86 and u < 0.94 else 2.0)
                aux.append((u, v, sheet))
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
    return ('ear' + side, verts, faces, normals, j, w, np.array(regs), np.array(aux))


# ------------------------------------------------------------------ pose correctives
# Linear blend skinning creases joints and leaves body parts as separate lumps. For each posture
# the cat can hold, the same primitives are posed with their bones and smooth-unioned again, and
# every skinned vertex is moved onto that surface. The difference, taken back into bind space, is
# a corrective the renderer adds in proportion to how much of that posture the cat is in.
CORRECT = ['sit', 'loaf', 'sphinx', 'side', 'curl', 'crouch', 'arch', 'stretch']

# Extra sculpting that only exists in one posture, in that posture's own model space (floor at
# y = 0): the soft mass that hides folded legs in a loaf, the haunch of a sitting cat, and a floor
# the body flattens against when it lies down.
POSE_SCULPT = {
    'loaf': dict(floor=0.003, extra=[
        ((0, 0.058, -0.06), (0.076, 0.076, 0.158), 0.045),      # the loaf: one low rounded mound
        ((0, 0.045, 0.068), (0.062, 0.046, 0.052), 0.035),       # chest over the tucked forearms
    ]),
    'sphinx': dict(floor=0.003, extra=[
        ((0, 0.066, -0.085), (0.068, 0.07, 0.13), 0.035),
    ]),
    'sit': dict(floor=0.003, extra=[
        ((0.034, 0.052, -0.09), (0.036, 0.05, 0.06), 0.03),     # haunches
        ((-0.034, 0.052, -0.09), (0.036, 0.05, 0.06), 0.03),
    ]),
    'side': dict(floor=0.003, extra=[]),
    'curl': dict(floor=0.003, extra=[]),
}

def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def posed_prims(bones_posed, pose_name=None):
    """the sculpt with every primitive carried by its bone: bones_posed[name] = (R, t)"""
    out = []
    for c, r, k in POSE_SCULPT.get(pose_name, {}).get('extra', []):
        out.append(dict(t='ell', b='spine2', c=P(*c), r=P(*r), k=k, R=None))
    for pr in PRIMS:
        R, t = bones_posed[pr['b']]
        rest = pos(pr['b'])
        M = lambda x: R @ (x - rest) + t
        q = dict(pr)
        if pr['t'] in ('ell', 'sub'):
            q['c'] = M(pr['c'])
            q['R'] = R
        else:
            q['a'] = M(pr['a']); q['bb'] = M(pr['bb'])
        out.append(q)
    # unions first, carved sockets last
    return [q for q in out if q['t'] != 'sub'] + [q for q in out if q['t'] == 'sub']

def sdf_posed(p, prims, floor=None):
    d = sdf(p, prims)
    if floor is not None:
        d = smax(d, -(p[..., 1] - floor), 0.008)
    return d

def sdf_grad(p, prims, h=0.0004, floor=None):
    g = np.zeros_like(p)
    for i in range(3):
        e = np.zeros(3); e[i] = h
        g[:, i] = (sdf_posed(p + e, prims, floor) - sdf_posed(p - e, prims, floor)) / (2 * h)
    return g

def correctives(verts, normals, j, w, names, posed_path):
    data = json.load(open(posed_path))
    assert data['names'] == names, 'poses.json was made for another skeleton'
    idx = {n: i for i, n in enumerate(names)}
    # dynamic parts (gaze, tail physics) stay plain-skinned
    free = np.zeros(len(verts))
    for b in ['head', 'jaw'] + [f'tail{i}' for i in range(TAIL_N)]:
        free += (w * (j == idx[b])).sum(1)
    for b in ['neck2']:
        free += 0.5 * (w * (j == idx[b])).sum(1)
    keep = np.clip(1 - free, 0, 1)
    planes = []
    for name in CORRECT:
        P = data['poses'][name]
        Rs = [quat_mat(b['q']) for b in P]
        ts = [np.array(b['p']) for b in P]
        bones_posed = {n: (Rs[i], ts[i]) for i, n in enumerate(names)}
        prims = posed_prims(bones_posed, name)
        floor = POSE_SCULPT.get(name, {}).get('floor')
        # linear blend skinning of the rest mesh
        A = np.zeros((len(verts), 3, 3)); x = np.zeros_like(verts)
        for k in range(4):
            jk = j[:, k]; wk = w[:, k][:, None]
            Rk = np.stack([Rs[i] for i in jk]); tk = np.stack([ts[i] for i in jk]); rk = np.stack([pos(names[i]) for i in jk])
            x += wk * (np.einsum('nij,nj->ni', Rk, verts - rk) + tk)
            A += wk[:, :, None] * Rk
        lbs = x.copy()
        for it in range(10):
            d = sdf_posed(x, prims, floor)
            g = sdf_grad(x, prims, floor=floor)
            step = -(d / np.maximum((g * g).sum(1), 1e-8))[:, None] * g
            n_ = np.linalg.norm(step, axis=1, keepdims=True)
            x = x + step * np.minimum(1, 0.006 / np.maximum(n_, 1e-9))
        delta = x - lbs
        far = np.linalg.norm(delta, axis=1)
        trust = np.clip((0.045 - far) / 0.015, 0, 1) * keep
        delta *= trust[:, None]
        g = sdf_grad(x, prims, floor=floor)
        npos = g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        nl = np.einsum('nij,nj->ni', np.linalg.inv(A), npos)
        nl /= np.maximum(np.linalg.norm(nl, axis=1, keepdims=True), 1e-9)
        nl = normals + (nl - normals) * trust[:, None]
        dp = np.einsum('nij,nj->ni', np.linalg.inv(A), delta)
        dn = nl - normals
        print(f'  corrective {name:8s} mean {np.mean(far) * 1000:.2f} mm  max {np.max(far * trust) * 1000:.1f} mm  untrusted {np.mean(trust < 0.5) * 100:.1f}%')
        planes.append((dp.astype(np.float32), dn.astype(np.float32)))
    return planes

# ------------------------------------------------------------------ guard-hair strands
def strand_roots(verts, faces, normals, count, seed=11):
    """Roots for individually drawn guard hairs: area-weighted points on the body, each carrying the
    skin of its nearest vertex (and that vertex's index, for the pose correctives)."""
    rng = np.random.default_rng(seed)
    tri = verts[faces]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    pick = rng.choice(len(faces), size=count, p=area / area.sum())
    r1, r2 = rng.random(count), rng.random(count)
    s1 = np.sqrt(r1)
    bc = np.stack([1 - s1, s1 * (1 - r2), s1 * r2], 1)
    f = faces[pick]
    pos = np.einsum('nk,nkd->nd', bc, verts[f])
    nrm = np.einsum('nk,nkd->nd', bc, normals[f])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    near = f[np.arange(count), np.argmax(bc, 1)]
    return pos, nrm, near, rng.random(count)

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
    j, w, names = skin_weights(np.asarray(m.vertices), np.asarray(m.faces))
    body = ('body', np.asarray(m.vertices), np.asarray(m.faces), vn, j, w, np.zeros(len(m.vertices)))
    meshes = [body, ear_mesh('L', names), ear_mesh('R', names)]
    corr = None
    if os.environ.get('CAT_POSES'):
        corr = correctives(np.asarray(m.vertices), vn, j, w, names, os.environ['CAT_POSES'])
    nstr = int(os.environ.get('CAT_STRANDS', '60000'))
    spos, snrm, snear, sseed = strand_roots(np.asarray(m.vertices), np.asarray(m.faces), vn, nstr)
    strands = (spos, snrm, j[snear], w[snear], snear, sseed)
    export_bin(out + '.cat', meshes, names, corr, strands)
    # static preview with ears
    allm = [trimesh.Trimesh(mm[1], mm[2], process=False) for mm in meshes]
    trimesh.util.concatenate(allm).export(out + '.glb')


if __name__ == '__main__':
    main()
