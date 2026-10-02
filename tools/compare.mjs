// node tools/compare.mjs ref.png out.png "<lab query>" "<setup js>" [scale]
// Renders the lab cat at the reference's aspect ratio and writes reference | render side by side.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [ref, out, query = '', setup = '', scale = '1.5'] = process.argv.slice(2);
const size = execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${ref}'); print(im.size[0], im.size[1])`]).toString().trim().split(' ').map(Number);
const k = +scale;
const W = Math.round(size[0] * k), H = Math.round(size[1] * k);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('console', m.text().slice(0, 300)); });
await page.goto('http://localhost:5173/lab.html?still&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
if (setup) await page.evaluate(setup);
await page.evaluate(() => { window.lab.render(); });
const shot = '/tmp/cmp_render.png';
const t0 = Date.now();
await page.screenshot({ path: shot, timeout: 600000 });
console.log('frame+shot', (Date.now() - t0) / 1000, 's');
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
h=max(a.size[1], 420)
a=a.resize((round(a.size[0]*h/a.size[1]), h), Image.LANCZOS); b=b.resize((round(b.size[0]*h/b.size[1]), h), Image.LANCZOS)
s=Image.new('RGB',(a.size[0]+b.size[0]+8,h),'white'); s.paste(a,(0,0)); s.paste(b,(a.size[0]+8,0)); s.save(sys.argv[3])
`, ref, shot, out]);
console.log('wrote', out);
