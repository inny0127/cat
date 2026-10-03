// node tools/pixelreel.mjs out.gif "<lab query>" "<actions json>" [fps] [seconds] [width,height]
// Runs the lab cat through a timed list of actions ([[seconds, "js using lab/THREE"], ...]) in fixed
// steps, grabs every frame and writes an animated GIF (pixel art keeps GIFs small and exact). An action
// can set window.__tick = (t) => {...} to run every frame.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const [out, query, actionsJson, fpsArg = '12', secArg = '8', sizeArg = '640,400'] = process.argv.slice(2);
const fps = +fpsArg, seconds = +secArg;
const [w, h] = sizeArg.split(',').map(Number);
const actions = JSON.parse(actionsJson).sort((a, b) => a[0] - b[0]);
const dir = '/tmp/pixelreel';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)); });
await page.goto('http://localhost:5173/lab.html?still&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });

const frames = Math.round(fps * seconds);
let next = 0;
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  const due = [];
  while (next < actions.length && actions[next][0] <= t + 1e-6) due.push(actions[next++][1]);
  await page.evaluate(([due, dt, first]) => {
    const lab = window.lab, THREE = lab.THREE;
    for (const js of due) eval(js);
    // an action may leave a per-frame hook behind (a moving finger the cat watches, say)
    if (window.__tick) window.__tick(window.__t = (window.__t ?? 0) + (first ? 0 : dt));
    if (!first) lab.step(dt);
    lab.render();
  }, [due, 1 / fps, i === 0]);
  await page.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png`, timeout: 600000 });
  if (i % 12 === 0) console.log('frame', i, '/', frames);
}
await b.close();
execFileSync('python3', ['-c', `
import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[2] + '/f*.png'))
ims = [Image.open(f).convert('RGB') for f in files]
pal = [im.convert('P', palette=Image.Palette.ADAPTIVE, colors=64) for im in ims]
pal[0].save(sys.argv[1], save_all=True, append_images=pal[1:], duration=int(1000 / float(sys.argv[3])), loop=0, optimize=False)
cols = 6; step = max(1, len(ims) // 18); pick = ims[::step][:18]
sw, sh = pick[0].size[0] // 2, pick[0].size[1] // 2
rows = (len(pick) + cols - 1) // cols
sheet = Image.new('RGB', (cols * sw, rows * sh), 'white')
for k, im in enumerate(pick): sheet.paste(im.resize((sw, sh), Image.NEAREST), ((k % cols) * sw, (k // cols) * sh))
sheet.save(sys.argv[1].rsplit('.', 1)[0] + '_sheet.png')
print('frames', len(ims))
`, out, dir, String(fps)]);
console.log('wrote', out);
