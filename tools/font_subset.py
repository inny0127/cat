"""The app's pixel font: Galmuri11 (Lee Minseo, SIL Open Font License 1.1) cut down to the
letters the app writes, and renamed as the licence asks of a changed version ("Galmuri" is a
Reserved Font Name).

Usage: python3 tools/font_subset.py   (needs fonttools and brotli: pip install fonttools brotli)
Reads node_modules/galmuri/dist/Galmuri11.ttf (the galmuri dev dependency) and every source the
app's words are in, writes src/fonts/window-pixel.woff2, the letters it holds
(src/fonts/window-pixel.txt, which a test checks the sources against) and the licence
(public/fonts/OFL.txt). Run it again whenever a test says a letter is missing.
"""
import glob
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'node_modules', 'galmuri', 'dist')
FAMILY = 'Window Pixel'
PS_NAME = 'WindowPixel-Regular'


def letters():
    """every letter the app may write: printable ASCII, and anything else in its sources"""
    files = glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True)
    files += [os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'public', 'manifest.webmanifest')]
    out = {chr(c) for c in range(0x20, 0x7f)}
    for f in files:
        with open(f, encoding='utf-8') as fh:
            out |= {c for c in fh.read() if ord(c) > 0x7f and not c.isspace()}
    return out


def main():
    # (the original's date kept: the same letters give the same file)
    font = TTFont(os.path.join(SRC, 'Galmuri11.ttf'), recalcTimestamp=False)
    have = set(chr(c) for c in font.getBestCmap())
    want = letters()
    missing = sorted(want - have)
    keep = sorted(want & have)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.flavor = 'woff2'
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(keep))
    sub.subset(font)
    # (a changed version may not go by the Reserved Font Name: renamed, its copyright and licence
    # kept as they are)
    name = font['name']
    for rec in list(name.names):
        if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22) and 'Galmuri' in rec.toUnicode():
            name.removeNames(nameID=rec.nameID)
    name.setName(FAMILY, 1, 3, 1, 0x409)
    name.setName('Regular', 2, 3, 1, 0x409)
    name.setName(f'{FAMILY}; subset of Galmuri11 for Cat Window', 3, 3, 1, 0x409)
    name.setName(FAMILY, 4, 3, 1, 0x409)
    name.setName(PS_NAME, 6, 3, 1, 0x409)
    out_dir = os.path.join(ROOT, 'src', 'fonts')
    os.makedirs(out_dir, exist_ok=True)
    font.flavor = 'woff2'
    font.save(os.path.join(out_dir, 'window-pixel.woff2'))
    with open(os.path.join(out_dir, 'window-pixel.txt'), 'w', encoding='utf-8') as fh:
        fh.write(''.join(c for c in keep if ord(c) > 0x7f) + '\n')
    lic_dir = os.path.join(ROOT, 'public', 'fonts')
    os.makedirs(lic_dir, exist_ok=True)
    with open(os.path.join(SRC, 'LICENSE.txt'), encoding='utf-8') as fh:
        lic = fh.read()
    with open(os.path.join(lic_dir, 'OFL.txt'), 'w', encoding='utf-8') as fh:
        fh.write('The app\'s font "Window Pixel" is a subset of Galmuri11 by Lee Minseo, renamed as the\n'
                 'licence below asks of a modified version. It is under the same licence.\n\n' + lic)
    size = os.path.getsize(os.path.join(out_dir, 'window-pixel.woff2'))
    print(f'{len(keep)} letters, {size} bytes' + (f'; not in Galmuri11: {"".join(missing)}' if missing else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
