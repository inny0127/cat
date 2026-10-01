"""Turns the reference painting into the layered, rig-ready assets used by the app.

Pipeline (all coordinates in the 600x600 reference painting's pixel space):
  1. Real-ESRGAN x4 upscale of the painting (tools/upscale.py).
  2. Alpha matte of the cat against the cream paper (difference keying + flood fill).
  3. LaMa inpainting at 1x for everything a moving part can uncover, re-upscaled
     with the same ESRGAN pass so filled fur has the same brush texture.
  4. Narrow bands that a lifted head uncovers are filled by mirroring nearby fur.
  5. Layers (body, tail, head, earR, earL) are exported at OUT_SCALE as WebP plus
     a weight map and rig.json consumed by src/render.

Usage:
  python3 tools/build_layers.py <painting.jpg> <RealESRGAN_x4plus.pth> <workdir> <outdir>
Needs: numpy, scipy, opencv, pillow, torch, simple-lama-inpainting.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_SIZE = 600
UP = 4          # working scale
OUT_SCALE = 3   # exported texture scale (px per painting px)
PREVIEW_DIR = None  # PNG copies of each layer for inspection (set to the work dir)

# ---------------------------------------------------------------- rig geometry
EAR_L = [(32, 255), (45, 255), (60, 258), (75, 262), (88, 266), (99, 273), (105, 283), (105, 293),
         (101, 301), (93, 308), (84, 315), (76, 315), (67, 307), (57, 299), (48, 289), (41, 277), (36, 266)]
EAR_R = [(168, 188), (178, 194), (187, 205), (194, 216), (199, 226), (201, 237), (199, 247), (191, 253),
         (178, 255), (165, 253), (157, 247), (155, 236), (156, 222), (158, 209), (162, 198)]
HEAD = [(15, 235), (40, 205), (80, 170), (130, 150), (205, 150),
        (207, 172), (210, 200), (213, 230), (219, 260), (228, 288), (236, 310),
        (230, 326), (220, 338), (215, 346), (209, 358), (201, 366), (190, 370), (172, 374), (150, 374),
        (134, 371), (122, 363), (112, 353), (98, 348), (86, 345), (76, 344), (60, 344), (15, 344)]
# what of the head is still there once the left ear is gone
HEAD_UNDER_EAR_L = [(86, 262), (100, 269), (107, 284), (105, 300), (96, 310), (85, 318), (77, 316),
                    (75, 302), (78, 287), (82, 273)]
TAIL = [(382, 318), (374, 306), (352, 303), (330, 307), (311, 314), (296, 325), (284, 339), (274, 354),
        (268, 371), (265, 390), (267, 404), (296, 408), (326, 402),
        (325, 392), (324, 380), (329, 367), (338, 358), (354, 348), (370, 335)]

RIG = {
    "sourceSize": SRC_SIZE,
    "outScale": OUT_SCALE,
    "paper": None,  # filled in from the matte
    "anchors": {
        "headPivot": [224, 272],     # back of the skull / neck: head rotates about this
        "earLPivot": [97, 296],      # ear bases
        "earRPivot": [180, 251],
        "earLTip": [33, 255],
        "earRTip": [168, 189],
        "tailPivot": [300, 404],     # where the curled tail tip bends off the body
        "tailTip": [378, 316],
        "eyeA": {"c": [137.5, 333.0], "a": [126.5, 336.5], "b": [148.5, 329.0]},   # near eye, closed lid line ends
        "eyeB": {"c": [184.0, 309.0], "a": [181.0, 318.5], "b": [188.5, 299.5]},   # far eye
        "nose": [190, 354],
        "chin": [168, 372],
        "pawL": [88, 368],           # round front paw
        "breathCenter": [400, 330],  # rib cage
        "body": [370, 300],
    },
}


def poly_mask(poly, scale, size, feather=0.0, grow=0):
    img = Image.new('L', (size, size), 0)
    ImageDraw.Draw(img).polygon([(x * scale, y * scale) for x, y in poly], fill=255)
    m = np.asarray(img).astype(np.float32) / 255.0
    if grow:
        m = cv2.dilate(m, np.ones((2 * grow + 1, 2 * grow + 1), np.uint8))
    if feather > 0:
        m = cv2.GaussianBlur(m, (0, 0), feather)
    return m


def nblur(img, m, s):
    m = m.astype(np.float32)
    num = cv2.GaussianBlur(img * m[..., None], (0, 0), s)
    den = cv2.GaussianBlur(m, (0, 0), s)[..., None]
    return num / np.maximum(den, 1e-6)


def esrgan(weights, src_path, dst_path):
    if not os.path.exists(dst_path):
        subprocess.check_call([sys.executable, os.path.join(HERE, 'upscale.py'), weights, src_path, dst_path])
    return np.asarray(Image.open(dst_path).convert('RGB')).astype(np.float32)


# ---------------------------------------------------------------- matting
def matte(src1x, up4):
    H = W = SRC_SIZE
    # model the paper of the image we actually matte (ESRGAN cleans it a little whiter)
    src1x = cv2.resize(up4, (W, H), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor((src1x / 255).astype(np.float32), cv2.COLOR_RGB2LAB)
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    paper_rect = np.zeros((H, W), bool)
    paper_rect[112:488, 16:584] = True
    cand = (lab[..., 0] < 90) | (chroma > 9)
    bg = paper_rect & ~(cv2.dilate(cand.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0)
    B1 = nblur(src1x, bg, 30)
    B4 = cv2.resize(B1, (W * UP, H * UP), interpolation=cv2.INTER_CUBIC)

    D = cv2.GaussianBlur(np.abs(up4 - B4).max(axis=2), (0, 0), 1.2)
    rect = np.zeros(D.shape, bool)
    rect[112 * UP:488 * UP, 16 * UP:584 * UP] = True
    hard = ndi.binary_fill_holes(ndi.binary_closing((D > 14) & rect, structure=np.ones((9, 9))))
    lab_, n = ndi.label(hard)
    hard = lab_ == 1 + int(np.argmax(ndi.sum(hard, lab_, range(1, n + 1))))
    hard = ndi.binary_fill_holes(hard)

    lab4 = cv2.cvtColor(up4 / 255, cv2.COLOR_RGB2LAB)
    L4, C4 = lab4[..., 0], np.hypot(lab4[..., 1], lab4[..., 2])
    yy, xx = np.mgrid[0:H * UP, 0:W * UP]

    def flood_remove(mask, paperish):
        lab_, _ = ndi.label(paperish | ~mask)
        return mask & ~(lab_ == lab_[5, 5])

    # faint painted floor shadow on the right is not cat; white paws on the left are
    right = xx >= 1150
    h2 = flood_remove(hard, (L4 > 86) & (C4 < 14))
    h2 = ndi.binary_fill_holes(ndi.binary_opening(h2, iterations=2))
    hard = np.where(right, h2, hard)
    h3 = flood_remove(hard, (L4 > 68) & (C4 < 22) & right & (yy >= 1400))
    hard = ndi.binary_fill_holes(ndi.binary_opening(h3, iterations=1))
    lab_, n = ndi.label(hard)
    hard = lab_ == 1 + int(np.argmax(ndi.sum(hard, lab_, range(1, n + 1))))

    inside = ndi.binary_erosion(hard, iterations=10)
    outer = ndi.binary_dilation(hard, iterations=6)
    F = nblur(up4, inside, 8)
    FB, CB = F - B4, up4 - B4
    nrm = (FB ** 2).sum(2)
    a_key = np.clip((CB * FB).sum(2) / np.maximum(nrm, 1e-3), 0, 1)
    feather = cv2.GaussianBlur(hard.astype(np.float32), (0, 0), 2.0)
    w_key = np.clip((np.sqrt(nrm) - 25) / 40, 0, 1)
    alpha = np.where(inside, 1.0, w_key * a_key + (1 - w_key) * feather)
    alpha = np.where(outer, alpha, 0.0)
    alpha = np.clip(np.minimum(alpha, cv2.GaussianBlur(outer.astype(np.float32), (0, 0), 2.0) + inside), 0, 1)
    # the app background: the paper just around the cat (edge colours were unmixed against it)
    ring = ndi.binary_dilation(hard, iterations=40) & ~ndi.binary_dilation(hard, iterations=8)
    paper = B4[ring].mean(axis=0)
    a3 = alpha[..., None]
    fg = np.where(a3 > 0.08, B4 + CB / np.maximum(a3, 1e-3), F)
    mix = np.clip((alpha - 0.08) / 0.3, 0, 1)[..., None]
    fg = np.clip(fg, 0, 255) * mix + F * (1 - mix)

    deep = ndi.binary_erosion(hard, iterations=24)
    s = np.clip((L4 - 74) / 10, 0, 1) * np.clip((18 - C4) / 6, 0, 1)
    s = np.where((L4 > 78) & (C4 < 16) & ~deep & right, s, 0)
    alpha = alpha * (1 - s)
    alpha = np.where(deep, 1.0, np.minimum(alpha, cv2.GaussianBlur(alpha, (0, 0), 0.8) + 0.02))
    return alpha.astype(np.float32), fg.astype(np.float32), B4.astype(np.float32), paper


def key_alpha(img, B4, base_alpha):
    """Alpha for inpainted pixels: how far they are from paper, measured like the matte."""
    D = np.abs(img - B4).max(axis=2)
    a = np.clip((D - 10) / 40, 0, 1)
    return np.maximum(a, 0) * (base_alpha > -1)


# ---------------------------------------------------------------- fills
def lama_fill(src1x, hole1x, out_path):
    from simple_lama_inpainting import SimpleLama
    if not os.path.exists(out_path):
        lama = SimpleLama()
        out = lama(Image.fromarray(src1x.astype(np.uint8)), Image.fromarray((hole1x * 255).astype(np.uint8)))
        Image.fromarray(np.asarray(out)[:SRC_SIZE, :SRC_SIZE]).save(out_path)
    return np.asarray(Image.open(out_path).convert('RGB')).astype(np.float32)


def mirror_fill(img, known, region):
    """Fill `region` by reflecting `known` pixels across their nearest boundary point."""
    dist, (iy, ix) = ndi.distance_transform_edt(~known, return_indices=True)
    yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    my = np.clip(2 * iy - yy, 0, img.shape[0] - 1)
    mx = np.clip(2 * ix - xx, 0, img.shape[1] - 1)
    ok = known[my, mx]
    ref = np.where(ok[..., None], img[my, mx], img[iy, ix])
    out = img.copy()
    out[region] = ref[region]
    return out, dist


# ---------------------------------------------------------------- export
def crop_layer(rgb, alpha, scale_in, name, outdir, pad=6):
    """Crop to the alpha bbox, downsample (premultiplied) to OUT_SCALE and save WebP."""
    ys, xs = np.where(alpha > 0.004)
    y0, y1 = ys.min(), ys.max() + 1
    x0, x1 = xs.min(), xs.max() + 1
    # snap the crop to whole painting pixels so the layer origin is exact in rig space
    x0 = max(0, (x0 // scale_in - pad) * scale_in)
    y0 = max(0, (y0 // scale_in - pad) * scale_in)
    x1 = min(rgb.shape[1], (-(-x1 // scale_in) + pad) * scale_in)
    y1 = min(rgb.shape[0], (-(-y1 // scale_in) + pad) * scale_in)
    a = alpha[y0:y1, x0:x1]
    pm = rgb[y0:y1, x0:x1] * a[..., None]
    w_out = (x1 - x0) // scale_in * OUT_SCALE
    h_out = (y1 - y0) // scale_in * OUT_SCALE
    pm_s = cv2.resize(pm, (w_out, h_out), interpolation=cv2.INTER_AREA)
    a_s = cv2.resize(a, (w_out, h_out), interpolation=cv2.INTER_AREA)
    col = np.where(a_s[..., None] > 1e-4, pm_s / np.maximum(a_s[..., None], 1e-4), 0)
    # bleed colour into fully transparent texels so bilinear filtering has no dark fringe
    known = a_s > 0.02
    if (~known).any():
        _, (iy, ix) = ndi.distance_transform_edt(~known, return_indices=True)
        col = np.where(known[..., None], col, col[iy, ix])
    rgba = np.dstack([np.clip(col, 0, 255), np.clip(a_s * 255, 0, 255)]).astype(np.uint8)
    path = os.path.join(outdir, f'{name}.webp')
    Image.fromarray(rgba, 'RGBA').save(path, quality=92, method=6, alpha_quality=100)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(PREVIEW_DIR or outdir, f'{name}.png'))
    return {"file": f'{name}.webp', "x": x0 / scale_in, "y": y0 / scale_in,
            "w": (x1 - x0) / scale_in, "h": (y1 - y0) / scale_in}


def main():
    src_path, weights, work, outdir = sys.argv[1:5]
    os.makedirs(work, exist_ok=True)
    os.makedirs(outdir, exist_ok=True)
    global PREVIEW_DIR
    PREVIEW_DIR = work
    src1x = np.asarray(Image.open(src_path).convert('RGB')).astype(np.float32)
    Image.fromarray(src1x.astype(np.uint8)).save(os.path.join(work, 'src.png'))
    up4 = esrgan(weights, os.path.join(work, 'src.png'), os.path.join(work, 'up4.png'))
    N = SRC_SIZE * UP

    alpha, fg, B4, paper = matte(src1x, up4)
    RIG["paper"] = [int(round(v)) for v in paper]
    print('matte done, paper', RIG["paper"])

    # masks at working scale
    m_head = poly_mask(HEAD, UP, N, feather=0.8 * UP / 2)
    m_head_hard = poly_mask(HEAD, UP, N) > 0.5
    m_earR = poly_mask(EAR_R, UP, N, feather=0.6 * UP / 2)
    m_earR_hard = poly_mask(EAR_R, UP, N) > 0.5
    # the left ear sits on the silhouette: its outline strokes run a few px past the polygon,
    # so on the background side only, the ear layer reaches further out
    m_earL_core = poly_mask(EAR_L, UP, N) > 0.5
    near_bg = ndi.distance_transform_edt(alpha > 0.3) < 4 * UP
    m_earL_hard = m_earL_core | (poly_mask(EAR_L, UP, N, grow=8 * UP) > 0.5) & near_bg
    m_earL = cv2.GaussianBlur(m_earL_hard.astype(np.float32), (0, 0), 0.6 * UP / 2)
    m_under_earL = poly_mask(HEAD_UNDER_EAR_L, UP, N, feather=1.0 * UP)
    m_tail = poly_mask(TAIL, UP, N, feather=0.6 * UP / 2)
    m_tail_hard = poly_mask(TAIL, UP, N) > 0.5

    # LaMa fills at 1x, upscaled with the same ESRGAN so the texture matches
    def m1(poly, grow=2):
        return poly_mask(poly, 1, SRC_SIZE, grow=grow) > 0.5
    fill_body1 = lama_fill(src1x, m1(HEAD) | m1(TAIL), os.path.join(work, 'fill_body_1x.png'))
    fill_head1 = lama_fill(src1x, m1(EAR_L) | m1(EAR_R), os.path.join(work, 'fill_head_1x.png'))
    fill_body4 = esrgan(weights, os.path.join(work, 'fill_body_1x.png'), os.path.join(work, 'fill_body_4x.png'))
    fill_head4 = esrgan(weights, os.path.join(work, 'fill_head_1x.png'), os.path.join(work, 'fill_head_4x.png'))

    cat_solid = alpha > 0.5

    def underlay(rgb, a, fill, fill_alpha, region, r=3 * UP):
        """Hidden content under a moving part. Right at the part's edge the original pixels are
        kept (k=1) so the rest pose composites back to the painting exactly; deeper in, the fill."""
        d = ndi.distance_transform_edt(region)
        k = (1 - np.clip(d / r, 0, 1) ** 2 * (3 - 2 * np.clip(d / r, 0, 1)))[..., None]
        out_rgb = np.where(region[..., None], k * rgb + (1 - k) * fill, rgb)
        out_a = np.where(region, np.maximum(k[..., 0] * a, fill_alpha), a)
        return out_rgb, out_a

    # ---- body layer: fur under the head (mirror near the seam, LaMa further in) and under the tail
    known = cat_solid & ~m_head_hard & ~m_tail_hard
    under_head = m_head_hard & cat_solid
    mirrored, dist = mirror_fill(fg, known, under_head)
    band = 26 * UP
    t = np.clip(dist / band, 0, 1)[..., None]
    head_fill = mirrored * (1 - t ** 2) + fill_body4 * t ** 2
    # only where the head was opaque (shrink from the outer silhouette, not the internal seam)
    head_cover = m_head_hard & ndi.binary_erosion(cat_solid, iterations=2 * UP)
    x = np.clip(dist / band, 0, 1)
    under_alpha = (1 - x ** 2 * (3 - 2 * x)) * head_cover
    under_alpha = np.maximum(under_alpha, cv2.GaussianBlur(under_alpha.astype(np.float32), (0, 0), 1.0 * UP) * head_cover)
    body_rgb, body_alpha = underlay(fg, alpha, head_fill, under_alpha, m_head_hard)
    body_rgb, body_alpha = underlay(body_rgb, body_alpha, fill_body4, 1.0 * (alpha > 0.5), m_tail_hard)

    # ---- head layer: fur under the right ear; under the left ear only the skull, not a ghost ear
    head_rgb, head_alpha = underlay(fg, alpha, fill_head4, np.ones_like(alpha), m_earR_hard)
    head_rgb, head_alpha = underlay(head_rgb, head_alpha, fill_head4, m_under_earL, m_earL_core)
    # the ear's outline strokes beyond the polygon belong to the ear layer only
    head_alpha = np.where(m_earL_hard & ~m_earL_core, 0.0, head_alpha)
    # ...and so does the outline kept just inside the polygon edge where it meets the background
    head_alpha = np.where(m_earL_core & near_bg & (m_under_earL < 0.5), 0.0, head_alpha)
    head_alpha = np.clip(head_alpha * m_head, 0, 1)

    layers = {}
    layers['body'] = crop_layer(body_rgb, np.clip(body_alpha, 0, 1), UP, 'body', outdir)
    layers['tail'] = crop_layer(fg, np.clip(alpha * m_tail, 0, 1), UP, 'tail', outdir)
    layers['head'] = crop_layer(head_rgb, head_alpha, UP, 'head', outdir)
    layers['earR'] = crop_layer(fg, np.clip(alpha * m_earR, 0, 1), UP, 'earR', outdir)
    layers['earL'] = crop_layer(fg, np.clip(alpha * m_earL, 0, 1), UP, 'earL', outdir)
    RIG['layers'] = layers
    RIG['order'] = ['body', 'tail', 'head', 'earR', 'earL']
    RIG['polys'] = {'head': HEAD, 'earL': EAR_L, 'earR': EAR_R, 'tail': TAIL}

    # ---- full-cat silhouette (for hit testing / shadow), 1 texel per painting px
    sil = cv2.resize(alpha, (SRC_SIZE, SRC_SIZE), interpolation=cv2.INTER_AREA)
    Image.fromarray((np.clip(sil, 0, 1) * 255).astype(np.uint8)).save(os.path.join(outdir, 'silhouette.png'))

    # ---- rest composite for checking against the painting
    with open(os.path.join(outdir, 'rig.json'), 'w') as f:
        json.dump(RIG, f, indent=1)
    print(json.dumps(layers, indent=1))


if __name__ == '__main__':
    main()
