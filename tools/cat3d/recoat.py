"""Make the pixel coat of a built cat asset again (the flat colours the pixel-art renderer shades,
tools/cat3d/fripouille.py: pixel_coat) from the asset's own painted texture, without rebuilding the
rest of it. The credit is brought up to date with it.

  python3 tools/cat3d/recoat.py [public/cat3d/fri.bin]
"""
import io, json, os, struct, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fripouille import CREDIT, pixel_coat  # noqa: E402

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'public', 'cat3d', 'fri.bin')
raw = open(path, 'rb').read()
hl = struct.unpack('<I', raw[:4])[0]
head = json.loads(raw[4:4 + hl])
data = raw[4 + hl:]
t, p = head['texture'], head['pixtex']
# (the pixel coat is the last of the asset's arrays: the new one goes in its place)
assert p['data'] + p['bytes'] + (-p['bytes']) % 4 == len(data), 'the pixel coat is not the last array'
tex8 = np.asarray(Image.open(io.BytesIO(data[t['data']:t['data'] + t['bytes']])).convert('RGB'))
buf = io.BytesIO()
Image.fromarray(pixel_coat(tex8)).save(buf, 'PNG', optimize=True)
png = buf.getvalue()
data = data[:p['data']] + png + b'\0' * ((-len(png)) % 4)
head['pixtex'] = dict(data=p['data'], bytes=len(png), mime='image/png')
head['credit'] = CREDIT
hb = json.dumps(head).encode()
hb += b' ' * ((-len(hb)) % 4)
with open(path, 'wb') as fh:
    fh.write(struct.pack('<I', len(hb)) + hb + data)
print('pixel coat', len(png), 'bytes ->', path)
