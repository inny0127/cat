// node tools/appreel.mjs out.gif "<pixel.html query>" "<actions json>" [fps] [seconds] [width,height]
// Runs the pixel cat app (pixel.html?still) in fixed steps of game time, so a slow software
// rasteriser still shows real-time behaviour, and writes an animated GIF plus a contact sheet.
// Actions: [[seconds, "js using app (window.__pcat)"], ...]; an action may set window.__tick =
// (t, app) => {...} to run every frame. The cat's saved state can be seeded with ?seed={json}.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const [out, query = '', actionsJson = '[]', fpsArg = '10', secArg = '10', sizeArg = '390,844'] = process.argv.slice(2);
const fps = +fpsArg, seconds = +secArg;
const [w, h] = sizeArg.split(',').map(Number);
const actions = JSON.parse(actionsJson).sort((a, b) => a[0] - b[0]);
const dir = '/tmp/appreel';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('state')) console.log('CONSOLE', m.text().slice(0, 300)); });
const seed = new URLSearchParams(query).get('seed');
if (seed) {
  await page.addInitScript((s) => {
    try {
      const raw = localStorage.getItem('cat-window.v1');
      const st = raw ? JSON.parse(raw) : null;
      if (st) localStorage.setItem('cat-window.v1', JSON.stringify(Object.assign(st, JSON.parse(s))));
    } catch { /* first run: nothing saved yet */ }
  }, seed);
}
await page.goto('http://localhost:5173/pixel.html?still&' + query);
await page.waitForFunction(() => window.__pcat, null, { timeout: 180000 });

const frames = Math.round(fps * seconds);
let next = 0;
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  const due = [];
  while (next < actions.length && actions[next][0] <= t + 1e-6) due.push(actions[next++][1]);
  await page.evaluate(([due, dt, t]) => {
    const app = window.__pcat;
    window.__t0 ??= performance.now() / 1000;
    for (const js of due) eval(js);
    // game time in small steps
    const n = 4;
    for (let k = 0; k < n; k++) {
      const tt = t + (k + 1) * dt / n;
      if (window.__tick) window.__tick(tt, app);
      app.tick(dt / n, window.__t0 + tt);
    }
    app.stage.render();
  }, [due, 1 / fps, t]);
  await page.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png` });
  if (i % 20 === 0) console.log('frame', i, '/', frames);
}
await b.close();
execFileSync('python3', ['-c', `
import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[2] + '/f*.png'))
ims = [Image.open(f).convert('RGB') for f in files]
pal = [im.convert('P', palette=Image.Palette.ADAPTIVE, colors=255, dither=Image.Dither.NONE) for im in ims]
pal[0].save(sys.argv[1], save_all=True, append_images=pal[1:], duration=int(1000 / float(sys.argv[3])), loop=0, optimize=False)
cols = 6; step = max(1, len(ims) // 12); pick = ims[::step][:12]
sw, sh = pick[0].size[0] // 2, pick[0].size[1] // 2
rows = (len(pick) + cols - 1) // cols
sheet = Image.new('RGB', (cols * sw, rows * sh), 'white')
for k, im in enumerate(pick): sheet.paste(im.resize((sw, sh), Image.NEAREST), ((k % cols) * sw, (k // cols) * sh))
sheet.save(sys.argv[1].rsplit('.', 1)[0] + '_sheet.png')
print('frames', len(ims))
`, out, dir, String(fps)]);
console.log('wrote', out);
