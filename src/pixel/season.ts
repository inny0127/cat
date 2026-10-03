/**
 * The year outside the window, by the date: the tree's leaves (their colour lit and in shade, the
 * season's other colour among them, how full the tree is) and whether what falls from the sky is
 * snow. Spring brings blossom (early April, as cherry trees do in Seoul), summer deep green,
 * autumn gold and then red, then bare boughs; in the winter months rain comes as snow and some lies.
 */
export interface Season {
  leafA: [number, number, number];
  leafB: [number, number, number];
  leafC: [number, number, number];
  /** how full the tree is (0 bare .. 1) */
  full: number;
  /** how much of the other colour */
  other: number;
  /** what falls is snow */
  snowing: boolean;
  /** how wintry it is: snow lies (0 .. 1), more after snow has fallen */
  winter: number;
}

type Key = [day: number, a: [number, number, number], c: [number, number, number], full: number, other: number];
// days of the year (from the 1st of January)
const KEYS: Key[] = [
  [0, [120, 112, 100], [140, 120, 100], 0.04, 0],
  [69, [130, 128, 100], [150, 170, 110], 0.05, 0],
  [82, [160, 192, 118], [246, 200, 214], 0.3, 0.2],
  [96, [168, 196, 124], [248, 198, 214], 0.75, 0.85],
  [106, [160, 196, 120], [244, 204, 218], 0.8, 0.6],
  [122, [130, 176, 100], [244, 204, 218], 0.9, 0.05],
  [166, [114, 156, 88], [114, 156, 88], 1, 0],
  [243, [112, 150, 84], [150, 160, 80], 1, 0.05],
  [268, [158, 164, 84], [216, 156, 62], 1, 0.3],
  [293, [226, 152, 66], [200, 74, 60], 0.92, 0.35],
  [319, [172, 106, 64], [142, 72, 52], 0.45, 0.3],
  [339, [120, 100, 84], [120, 100, 84], 0.06, 0],
  [366, [120, 112, 100], [140, 120, 100], 0.04, 0],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function seasonAt(d: Date, rain = 0): Season {
  const start = Date.UTC(d.getFullYear(), 0, 1);
  const day = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 864e5 + d.getHours() / 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= day) i++;
  const [d0, a0, c0, f0, o0] = KEYS[i], [d1, a1, c1, f1, o1] = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (day - d0) / (d1 - d0)));
  const a = a0.map((v, k) => lerp(v, a1[k], t) / 255) as [number, number, number];
  const c = c0.map((v, k) => lerp(v, c1[k], t) / 255) as [number, number, number];
  const m = d.getMonth();
  // deep winter: December to February, a little into March
  const wintry = m === 11 || m === 0 || m === 1 ? 1 : m === 2 && d.getDate() < 10 ? 0.5 : 0;
  return {
    leafA: a,
    leafB: [a[0] * 0.66, a[1] * 0.7, a[2] * 0.78],
    leafC: c,
    full: lerp(f0, f1, t),
    other: lerp(o0, o1, t),
    snowing: wintry > 0.4,
    winter: wintry * (0.3 + 0.7 * rain),
  };
}
