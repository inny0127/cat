// node tools/smooth/reel.mjs out.mp4 "<query>" '[[sec, "js using lab"], ...]' [fps] [seconds] [w,h]
// Records the smooth cat in fixed steps, its own life running (smooth.html?still), with things done at
// given times (lab.avatar.startAct('zoomies'), lab.brain.mode = 'doze', ...), and encodes an H.264
// video with ffmpeg. BASE= another page to record (a static build of tools/smooth/artifact.mjs, so
// editing the source mid-recording cannot reload it). For petting, see tools/smooth/showcase.mjs.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
const [out, query, actionsJson, fpsArg = '24', secArg = '8', sizeArg = '480,480'] = process.argv.slice(2);
const fps = +fpsArg, seconds = +secArg;
const [w, h] = sizeArg.split(',').map(Number);
const actions = JSON.parse(actionsJson).sort((a, b) => a[0] - b[0]);
const dir = out + '.frames';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('CONSOLE', m.text().slice(0, 400)); });
await page.goto((process.env.BASE || 'http://localhost:5173/smooth.html') + '?still&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
const frames = Math.round(fps * seconds);
let next = 0;
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const t = i / fps;
  const due = [];
  while (next < actions.length && actions[next][0] <= t + 1e-6) due.push(actions[next++][1]);
  await page.evaluate(([due, dt, first, t]) => {
    const lab = window.lab, THREE = lab.THREE;
    for (const js of due) eval(js);
    if (window.__tick) window.__tick(t);
    if (!first) lab.step(dt);
    lab.render();
  }, [due, 1 / fps, i === 0, t]);
  await page.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png`, timeout: 600000 });
  if (i % 48 === 0) console.log('frame', i, '/', frames, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await b.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', out]);
console.log('wrote', out, ((Date.now() - t0) / 1000).toFixed(0) + 's');
