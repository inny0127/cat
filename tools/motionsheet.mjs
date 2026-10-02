// node tools/motionsheet.mjs out.png "<setup js>" frames interval [query] [view az,el,d,ty,tz] [cols]
// Steps the lab cat in fixed time and grabs frames into a contact sheet, camera following the cat.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [out, setup, frames = '12', interval = '0.0833', query = 'shells=6', view = '1.5708,0.08,1.0,0.13,-0.03', cols = '4', pre = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 360, height: 260 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'log') console.log(m.text()); });
await page.goto('http://localhost:5173/lab.html?still&follow&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
await page.evaluate(([setup, view, pre]) => { const L = window.lab; const THREE = L.THREE; eval(setup); L.view(...view.split(',').map(Number)); L.step(+pre); }, [setup, view, pre]);
const files = [];
for (let i = 0; i < +frames; i++) {
  const f = `/tmp/ms_${String(i).padStart(3, '0')}.png`;
  await page.evaluate(([dt, i]) => { const L = window.lab; if (i > 0) L.step(dt); L.render(); }, [+interval, i]);
  await page.screenshot({ path: f, timeout: 600000 });
  files.push(f);
}
const info = await page.evaluate(() => { const m = window.lab.cat.motor; return { pos: m.pos.toArray().map((x) => +x.toFixed(3)), yaw: +m.yaw.toFixed(2), speed: +m.speed.toFixed(2), posture: m.posture }; });
console.log(JSON.stringify(info));
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
files=sys.argv[3:]; cols=int(sys.argv[2]); dt=float(sys.argv[4]) if False else None
ims=[Image.open(f) for f in files]
w,h=ims[0].size; rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(w*cols,h*rows),'white')
d=ImageDraw.Draw(sheet)
for i,im in enumerate(ims):
    x,y=(i%cols)*w,(i//cols)*h
    sheet.paste(im,(x,y)); d.text((x+6,y+6),str(i),fill=(0,0,0))
sheet.save(sys.argv[1])
`, out, cols, ...files]);
console.log('wrote', out);
