import * as THREE from 'three';

/**
 * The model's coat in flat material colours (the pixel cat's coat texture, tools/cat3d) keeps a
 * few dozen small islands that a pixel cat shows as specks: white holes in the dark stripes, pale
 * cream dabs inside the ginger (the painting's light tufts), and two black dots in the white of the
 * chest. Drawn smooth they read as stickers on the head and neck and a fleck on the chest. Here
 * every island of white or cream wholly inside the ginger or its stripes, and smaller than
 * `maxArea` texels, is filled with the colour round it, as is any small black island in the white.
 * The pale bands where the ginger meets the white of the chest and muzzle touch white, so they
 * stay, as do the ginger patches in the white (the markings on the legs). The pixel cat's texture
 * is not touched: this works on the smooth cat's own copy.
 */

/** the material keys (pixclass.ts KEYS), display sRGB */
const KEYS: [number, number, number][] = [[255, 255, 255], [255, 200, 120], [230, 120, 40], [130, 50, 10], [255, 140, 170], [20, 10, 10]];
const WHITE = 0, CREAM = 1, GINGER = 2, STRIPE = 3, DARK = 5;

export function cleanCoat(src: THREE.Texture, maxArea = 2000): THREE.Texture {
  const img = src.image as ImageBitmap | HTMLImageElement;
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, W, H);
  const px = data.data;
  // each texel's key (the texture holds nothing else; anything else counts as none)
  const cls = new Int8Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    for (let k = 0; k < KEYS.length; k++) {
      if (KEYS[k][0] === r && KEYS[k][1] === gg && KEYS[k][2] === b) { cls[i] = k; break; }
    }
  }
  // the islands of white and cream: flood each, note its size, whether it reaches the edge, and
  // what lies round it
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let filled = 0;
  for (let s = 0; s < W * H; s++) {
    const c = cls[s];
    if (seen[s] || (c !== WHITE && c !== CREAM && c !== DARK)) continue;
    let head = 0, tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    let edge = false, foreign = false;
    let nGinger = 0, nStripe = 0, nWhite = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W, y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (let n = 0; n < 4; n++) {
        const j = n === 0 ? (x > 0 ? i - 1 : -1) : n === 1 ? (x < W - 1 ? i + 1 : -1) : n === 2 ? (y > 0 ? i - W : -1) : (y < H - 1 ? i + W : -1);
        if (j < 0) continue;
        const cj = cls[j];
        if (cj === c) {
          if (!seen[j]) { seen[j] = 1; queue[tail++] = j; }
        } else if (cj === GINGER) nGinger++;
        else if (cj === STRIPE) nStripe++;
        else if ((cj === WHITE || cj === CREAM) && c === DARK) nWhite++;
        else foreign = true;
      }
    }
    // (the island's texels are queue[0 .. tail))
    if (edge || foreign || tail >= maxArea) continue;
    // (a black island: only one wholly in the white, and small; the eyes' and nose's dark skin
    // touches other colours)
    if (c === DARK && (nGinger > 0 || nStripe > 0 || nWhite === 0 || tail >= 400)) continue;
    const fill = KEYS[c === DARK ? WHITE : nStripe > nGinger ? STRIPE : GINGER];
    for (let q = 0; q < tail; q++) {
      const i = queue[q];
      px[i * 4] = fill[0];
      px[i * 4 + 1] = fill[1];
      px[i * 4 + 2] = fill[2];
    }
    filled++;
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = src.colorSpace;
  tex.flipY = src.flipY;
  tex.anisotropy = src.anisotropy;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.needsUpdate = true;
  (tex.userData as { islandsFilled?: number }).islandsFilled = filled;
  return tex;
}
