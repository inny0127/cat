// node tools/icons.mjs: the app's icons, drawn by the app's own pixel art. The lab (dev server:
// REEL_BASE, default http://localhost:5173/) draws the cat 64 art pixels square, read straight from
// the art pass (no bloom, no vignette) against a flat backdrop; tools/icons.py puts it in front of a
// window at dusk and writes every size to public/icons, each art pixel a whole number of the
// icon's (the apple touch icon is cropped two art pixels in at each edge).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const N = 64;
const BACK = '2f3b52';
// the cat sat up, a little turned, looking into the lens with its eyes wide: close for the icon,
// further off for the maskable one (whose corners a launcher may cut away to a circle)
const SHOTS = {
  icon: `pose=sit&az=0.3&el=0.12&d=0.4&aim=head&ty=-0.005&mood=curious&look&paper=${BACK}`,
  maskable: `pose=sit&az=0.3&el=0.12&d=0.56&aim=head&ty=-0.035&mood=curious&look&paper=${BACK}`,
};
const dir = join(tmpdir(), 'cat-icons');
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, query] of Object.entries(SHOTS)) {
  const page = await b.newPage({ viewport: { width: N * 8, height: N * 8 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto((process.env.REEL_BASE ?? 'http://localhost:5173/') + `lab.html?still&pixel=${N}&` + query);
  await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
  const rgb = await page.evaluate((n) => {
    const lab = window.lab;
    lab.stage.floor.visible = false;
    lab.step(0.5);
    lab.draw();
    const P = lab.stage.pixel, w = P.art.width, h = P.art.height;
    const px = new Uint8Array(w * h * 4);
    lab.renderer.readRenderTargetPixels(P.art, 0, 0, w, h, px);
    const mx = Math.round((w - n) / 2), my = Math.round((h - n) / 2), out = [];
    for (let y = n - 1; y >= 0; y--) for (let x = 0; x < n; x++) { const i = ((my + y) * w + mx + x) * 4; out.push(px[i], px[i + 1], px[i + 2]); }
    return out;
  }, N);
  writeFileSync(join(dir, `${name}.rgb`), Buffer.from(rgb));
  await page.close();
}
await b.close();
execFileSync('python3', [new URL('./icons.py', import.meta.url).pathname, dir, String(N), BACK], { stdio: 'inherit' });
