// node tools/smooth/showcase.mjs out.mp4 page.html [fps] [w,h]
// The smooth cat's showcase as a video: petted on the head, the cheek and the chin (purring, eyes
// shut, kneading), its ball of wool flicked for it (stalk, pounce), the zoomies, a wash, its tail
// rubbed the wrong way (a hiss, and off it goes; back soon after), a yawn and a stretch, dozing.
// Real pointer strokes on the places of the body (found on screen by what the cat's senses say
// they are), the page stepped frame by frame. page.html: a static build (a page from
// tools/smooth/artifact.mjs wrapped in <html><body>), opened as a file.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
const [out, file, fpsArg = '20', sizeArg = '390,700'] = process.argv.slice(2);
const fps = +fpsArg, dt = 1 / fps;
const [W, H] = sizeArg.split(',').map(Number);
const dir = out + '.frames';
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('file://' + file + '?still');
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
await page.evaluate(() => { const L = window.lab; L.brain.mode = 'alert'; L.brain.sleepDepth = 0; L.step(1); });
const where = (zone) => page.evaluate((zone) => {
  const L = window.lab, T = L.THREE, S = L.app.senses, cat = L.cat;
  cat.group.updateMatrixWorld(true);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const bn of cat.bones) { const s = S.toScreen(bn.getWorldPosition(new T.Vector3()), new T.Vector3()); x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); }
  const pts = [];
  for (let y = Math.max(2, y0 - 30); y < Math.min(innerHeight, y1 + 30); y += 8)
    for (let x = Math.max(2, x0 - 30); x < Math.min(innerWidth, x1 + 30); x += 8)
      if (S.hit(x, y) && S.zoneAt(x * S.k, y * S.k) === zone) pts.push([x, y]);
  if (!pts.length) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let best = pts[0], bd = 1e9;
  for (const p of pts) { const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2; if (d < bd) { bd = d; best = p; } }
  const [gx, gy] = S.grainAt(best[0] * S.k, best[1] * S.k);
  return { x: best[0], y: best[1], dx: gx, dy: gy };
}, zone);
// the script: [start s, what, arg]
// (play is for a cat at its ease: the ball goes once the purring has settled; the rub waits until
// the cat is still, so that the tail stays under the finger; a cat gone in a huff is let back soon)
const T = [
  [1.0, 'pet', ['head', 2.6]], [3.8, 'pet', ['cheek', 2.4]], [6.4, 'pet', ['chin', 3.2]],
  [16.5, 'js', 'lab.brain.mode = "rest"; lab.app.yarn.kick(new lab.THREE.Vector3(-0.6, 0, 0.4), 0.55); lab.avatar.playNow()'],
  [27.0, 'rub', ['tail', 7]],
  [33.0, 'back'],
  [52.0, 'js', 'lab.avatar.startAct("yawn")'],
  [55.0, 'js', 'lab.avatar.startAct("stretch")'],
  [61.0, 'js', 'lab.brain.mode = "doze"; lab.brain.sleepDepth = 0.6'],
];
const END = 68;
let touch = null; // { kind, zone, until, w, t0, down }
const frames = Math.round(END * fps);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const t = i * dt;
  for (const ev of T) {
    if (ev.done || ev[0] > t + 1e-6) continue;
    ev.done = true;
    if (ev[1] === 'js') await page.evaluate((js) => { const lab = window.lab; eval(js); }, ev[2]);
    else if (ev[1] === 'back') {
      // (once it has gone off in a huff, it is let back in a few seconds; asked every frame till then)
      if (!await page.evaluate(() => { const L = window.lab; if (L.brain.mode !== 'away') return false; L.app.state.awayUntil = L.app.state.lastTick + 2500; return true; })) ev.done = false;
    }
    else if (ev[1] === 'rub' && !ev.waited && await page.evaluate(() => !!window.lab.avatar.doing || !window.lab.cat.motor.settled) && t < ev[0] + 3) {
      // (not yet: the cat is busy; asked again next frame)
      ev.done = false;
    } else {
      ev.waited = true;
      // (a rub on a disliked place: the tail if it is in view, else a paw, else the belly)
      const zones = ev[1] === 'rub' ? [ev[2][0], 'paw', 'belly'] : [ev[2][0]];
      let w = null, zone = null;
      for (const z of zones) { w = await where(z); if (w) { zone = z; break; } }
      touch = w ? { kind: ev[1], zone, until: t + ev[2][1], w, t0: t, down: false, last: t } : null;
      console.log(ev[1], zone ?? ('none of ' + zones.join('/')), 'at', t.toFixed(1));
    }
  }
  if (touch) {
    if (t >= touch.until) { if (touch.down) await page.mouse.up(); touch = null; }
    else {
      if (t - touch.last > (touch.kind === 'rub' ? 0.35 : 0.9)) { const w2 = await where(touch.zone); if (w2) touch.w = w2; touch.last = t; }
      if (touch.kind === 'rub' && await page.evaluate(() => window.lab.brain.mode === 'leaving' || window.lab.brain.mode === 'away')) { if (touch.down) await page.mouse.up(); touch = null; }
    }
    if (touch) {
      const w = touch.w, u = t - touch.t0;
      if (touch.kind === 'pet') {
        // strokes along the fur: 0.55 s each, lifted between
        const ph = u % 0.7, A = 70;
        if (ph < 0.55) {
          const k = ph / 0.55;
          const x = w.x + w.dx * A * (k - 0.35), y = w.y + w.dy * A * (k - 0.35);
          if (!touch.down) { await page.mouse.move(x, y); await page.mouse.down(); touch.down = true; } else await page.mouse.move(x, y);
        } else if (touch.down) { await page.mouse.up(); touch.down = false; }
      } else {
        // a rough rub, back and forth without lifting
        const s = Math.sin(u * Math.PI * 2 * 2.2) * 20;
        const x = w.x + w.dx * s, y = w.y + w.dy * s;
        if (!touch.down) { await page.mouse.move(x, y); await page.mouse.down(); touch.down = true; } else await page.mouse.move(x, y);
      }
    }
  }
  await page.evaluate((dt) => { window.lab.step(dt, dt / 2); window.lab.render(); }, dt);
  await page.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png` });
  if (i % 100 === 0) console.log('frame', i, '/', frames, Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(await page.evaluate(() => [window.lab.brain.mode, window.lab.avatar.doing, +window.lab.brain.purr.toFixed(2)])));
}
await b.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
console.log('wrote', out, Math.round((Date.now() - t0) / 1000) + 's');
