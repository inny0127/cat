"""The app's icons from the lab's pixel cat (tools/icons.mjs renders it): the cat in front of a
window at dusk on the room's peach wall, drawn in art pixels like the app, and blown up by whole
numbers. Usage: python3 tools/icons.py <dir with icon.rgb, maskable.rgb> <art pixels> <backdrop hex>
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'icons')


def hexc(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# from the app's ramps (src/cat3d/pixclass.ts): the wall's dusty peach, the window frame's cream,
# the dusk through the glass, the town's roofs and lit windows
WALL = hexc('#c99486')
FRAME, FRAME_HI, FRAME_LO = hexc('#efe3d0'), hexc('#fffaf0'), hexc('#d4c4b6')
SKY = [hexc(c) for c in ('#272844', '#353d63', '#634a68', '#94687a', '#c97552', '#e8a173')]
TOWN, LIT = hexc('#3b3150'), hexc('#ffd27a')
STAR, MOON = hexc('#ffebc2'), hexc('#fff2d0')


def backdrop(n, inset):
    """the wall, a window in it (two panes a side), the dusk and the town through it, its sill;
    inset: how far in from the icon's edges the window starts (art pixels)"""
    im = Image.new('RGB', (n, n), WALL)
    px = im.load()
    x0, x1, y0, sill = inset, n - 1 - inset, max(2, inset - 4), int(n * 0.72)
    # the frame
    for y in range(y0, sill):
        for x in range(x0, x1 + 1):
            px[x, y] = FRAME
    # the glass: the dusk in bands down to a glow over the roofs, each band's edge a row of checks
    gx0, gx1, gy0, gy1 = x0 + 2, x1 - 2, y0 + 2, sill - 1
    rows = gy1 - gy0
    for y in range(gy0, gy1):
        u = (y - gy0) / max(1, rows - 1) * (len(SKY) - 1)
        k = int(u)
        f = u - k
        for x in range(gx0, gx1 + 1):
            c = SKY[min(k + 1, len(SKY) - 1)] if (f > 0.66 or (f > 0.33 and (x + y) % 2 == 0)) else SKY[k]
            px[x, y] = c
    # the bars: one down the middle, one across
    mx = (gx0 + gx1) // 2
    my = gy0 + (gy1 - gy0) * 2 // 5
    for y in range(gy0, gy1):
        px[mx, y] = FRAME
        px[mx + 1, y] = FRAME_LO
    for x in range(gx0, gx1 + 1):
        px[x, my] = FRAME
    # stars and a crescent moon in the top panes
    for (sx, sy) in ((gx0 + 12, gy0 + 2), (gx0 + 2, gy0 + 9), (gx1 - 4, gy0 + 3), (gx1 - 9, gy0 + 7), (gx1 - 2, gy0 + 10)):
        if gx0 <= sx <= gx1 and sy < my:
            px[sx, sy] = STAR
    # (high in the corner of the right pane, clear of the cat's ears)
    cx, cy = gx1 - 3, gy0 + 3
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5 and (dx + 1) ** 2 + (dy + 1) ** 2 > 3:
                px[cx + dx, cy + dy] = MOON
    # the town across the way: roofs of different heights along the bottom of the glass, a few
    # windows lit
    import random
    rnd = random.Random(7)
    x = gx0
    while x <= gx1:
        w = rnd.randint(3, 6)
        h = rnd.randint(3, 7)
        for xx in range(x, min(gx1 + 1, x + w)):
            for yy in range(gy1 - h, gy1):
                px[xx, yy] = TOWN
        for _ in range(rnd.randint(0, 2)):
            lx, ly = rnd.randint(x, min(gx1, x + w - 1)), rnd.randint(gy1 - h + 1, gy1 - 1)
            px[lx, ly] = LIT
        x += w
    # the sill, its lit edge and its shadow
    for x in range(x0 - 2, x1 + 3):
        if 0 <= x < n:
            px[x, sill] = FRAME_HI
            px[x, sill + 1] = FRAME
            px[x, sill + 2] = FRAME
            px[x, sill + 3] = FRAME_LO
    return im


def cat_over(bg, cat_rgb, n, back):
    cat = Image.frombytes('RGB', (n, n), cat_rgb)
    out = bg.copy()
    cp, op = cat.load(), out.load()
    for y in range(n):
        for x in range(n):
            if cp[x, y] != back:
                op[x, y] = cp[x, y]
    return out, cat


def save(im, size, name, crop=0):
    """blown up by a whole number, then (crop) cut in to size"""
    k = (size + 2 * crop) // im.width
    big = im.resize((im.width * k, im.height * k), Image.NEAREST)
    if big.width != size:
        o = (big.width - size) // 2
        big = big.crop((o, o, o + size, o + size))
    big.save(os.path.join(OUT, name))
    print('wrote', name, big.size)


def main():
    d, n, back = sys.argv[1], int(sys.argv[2]), hexc(sys.argv[3])
    with open(os.path.join(d, 'icon.rgb'), 'rb') as fh:
        icon_rgb = fh.read()
    with open(os.path.join(d, 'maskable.rgb'), 'rb') as fh:
        mask_rgb = fh.read()
    icon, cat = cat_over(backdrop(n, 6), icon_rgb, n, back)
    # (the art itself, an art pixel to a pixel, for the loading screen to show blown up on the
    # wall's colour: the cat's chest, cut by the bottom edge, dissolving into it in checks)
    art = icon.copy()
    ap = art.load()
    bayer = ((0, 2), (3, 1))
    for y in range(n - 8, n):
        f = (y - (n - 8) + 1) / 8
        for x in range(n):
            if bayer[y % 2][x % 2] < f * 4:
                ap[x, y] = WALL
    art.save(os.path.join(OUT, 'art-64.png'))
    save(icon, 512, 'icon-512.png')
    save(icon, 192, 'icon-192.png')
    # (iOS rounds the corners itself: 180 is 64 x 3 less two art pixels each side)
    save(icon, 180, 'apple-touch-icon.png', crop=6)
    maskable, _ = cat_over(backdrop(n, 9), mask_rgb, n, back)
    save(maskable, 512, 'maskable-512.png')
    # the notification badge: the head's silhouette, ears and all, white on clear (Android draws it
    # in one colour), without the whiskers (only where the cat is more than a line thick)
    px = cat.load()
    top = min(y for y in range(n) for x in range(n) if px[x, y] != back)
    size, tall = 48, 30
    head = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    hp = head.load()
    pad = (size - tall) // 2
    for y in range(tall):
        for x in range(size):
            sx, sy = n // 2 - size // 2 + x, top + y
            if 0 <= sx < n and 0 <= sy < n and px[sx, sy] != back:
                thick = sum(1 for dx in (-1, 1) if 0 <= sx + dx < n and px[sx + dx, sy] != back)
                thick += sum(1 for dy in (-1, 1) if 0 <= sy + dy < n and px[sx, sy + dy] != back)
                if thick >= 3:
                    hp[x, y + pad] = (255, 255, 255, 255)
    head.resize((96, 96), Image.NEAREST).save(os.path.join(OUT, 'badge-96.png'))
    print('wrote badge-96.png')


if __name__ == '__main__':
    main()
