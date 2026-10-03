// node tools/smooth/views.mjs out.png [size] ["<pixel lab query>"] ["<smooth query>"]
// The same four views of the sitting cat, drawn by the pixel lab (lab.html, top row) and the smooth
// cat (smooth.html, bottom row), side by side: the colours and the drawing should match, less the pixels.
// Needs the dev server (tools/withvite.sh).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [out, sizeArg = '360', pxq = 'pixel=96&shells=1&strands=0', smq = ''] = process.argv.slice(2);
const S = +sizeArg;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// views: [az, el, d, ty, look target (cat frame) or null]
const VIEWS = [
  [0.0, 0.12, 0.55, -0.03, null],
  [0.75, 0.1, 0.55, -0.03, null],
  [1.45, 0.12, 0.55, -0.03, [0.35, 0.15, 0.9]],
  [-0.35, 0.18, 0.55, -0.03, [0.55, 0.0, 0.5]],
];
const files = [];
for (const [pageName, q] of [['lab.html', `${pxq}&pose=sit&aim=head`], ['smooth.html', `pose=sit&${smq}`]]) {
  const page = await b.newPage({ viewport: { width: S, height: S } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log(m.text().slice(0, 300)); });
  await page.goto(`http://localhost:5173/${pageName}?still&${q}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
  for (let i = 0; i < VIEWS.length; i++) {
    const v = VIEWS[i];
    await page.evaluate((v) => {
      const L = window.lab, T = L.THREE;
      L.cat.snap('sit');
      L.view(v[0], v[1], v[2], v[3], 0, 0);
      if (v[4]) L.cat.motor.lookAt(new T.Vector3(...v[4]), 1); else L.cat.motor.lookAt(L.cam.position.clone(), 1);
      L.step(1.5);
      L.view(v[0], v[1], v[2], v[3], 0, 0);
      L.render();
    }, v);
    const f = `${out}.${pageName}.${i}.png`;
    await page.screenshot({ path: f, timeout: 600000 });
    files.push(f);
  }
  await page.close();
}
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
files=sys.argv[2:]; ims=[Image.open(f).convert('RGB') for f in files]
w,h=ims[0].size; sheet=Image.new('RGB',(w*4+6,h*2+6),'white')
for i,im in enumerate(ims): sheet.paste(im,((i%4)*(w+2),(i//4)*(h+6)))
sheet.save(sys.argv[1])
`, out, ...files]);
console.log('wrote', out);
