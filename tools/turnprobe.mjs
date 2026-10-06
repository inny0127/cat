// node tools/turnprobe.mjs (REEL_BASE=http://localhost:4173/ for a built preview): sharp turns at a
// run. From a standing start the cat sets off one way at a walk, a trot or a run, and is then sent
// all at once to a point back past its shoulder (a sweep of angles, both ways). For each, how far a
// paw on the floor (not in the air) goes across under the body past the middle of its shoulders or
// hips, the soak's test; the worst first, and how many go past 5 cm.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(() => { let r = 11; Math.random = () => ((r = (r * 16807) % 2147483647) / 2147483647); });
await page.goto((process.env.REEL_BASE ?? 'http://localhost:5173/') + 'index.html?still&hour=14&rain=0');
await page.waitForFunction(() => window.__pcat, null, { timeout: 180000 });
const out = await page.evaluate(() => {
  const a = window.__pcat, c = a.cat, m = c.motor, kin = c.kin, body = c.body, V = m.pos.constructor;
  const res = [];
  for (const speed of [0.6, 0.9, 1.2]) {
    for (let k = 0; k < 10; k++) {
      const back = 1.6 + k * 0.15, side = k % 2 ? 1 : -1;
      c.place(-0.3, 0.2, 0);
      c.snap('stand');
      for (let i = 0; i < 30; i++) c.update(1 / 60);
      m.walkTo(new V(-0.3, 0, 1.4), speed, null, null, true);
      let worst = 0, at = '';
      for (let f = 0; f < 150; f++) {
        if (f === 36) {
          const ang = m.yaw + side * back;
          m.walkTo(new V(m.pos.x + 0.9 * Math.sin(ang), 0, m.pos.z + 0.9 * Math.cos(ang)), speed, null, null, true);
        }
        c.update(1 / 60);
        for (const leg of ['LF', 'RF', 'LH', 'RH']) {
          if (!c.planted[leg] || c.stepper.feet[leg].stepping) continue;
          const L = body.legs[leg];
          const g = kin.wp[L.b[3]].clone().sub(kin.wp[L.girdle]).applyQuaternion(kin.wq[L.girdle].clone().invert());
          if (-g.x * L.side > worst) { worst = -g.x * L.side; at = `${leg} at ${(f / 60).toFixed(2)} s`; }
        }
      }
      res.push({ speed, back: +back.toFixed(2), side, across: +(worst * 100).toFixed(1), at });
    }
  }
  return res;
});
out.sort((x, y) => y.across - x.across);
for (const r of out.slice(0, 6)) console.log(JSON.stringify(r));
console.log(`past 5 cm: ${out.filter((r) => r.across > 5).length} of ${out.length}`);
await b.close();
