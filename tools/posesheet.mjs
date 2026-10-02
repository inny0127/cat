// node tools/posesheet.mjs out.png "pose1,pose2,..." [query] [views]  -> contact sheet of poses (side + 3/4)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [out, poses, query = 'shells=6', views = 'side,q34'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 420, height: 300 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/lab.html?still&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const V = { side: [1.5708, 0.08, 1.0, 0.13, -0.03], q34: [0.75, 0.25, 0.95, 0.12, -0.02], front: [0, 0.1, 0.8, 0.14, 0.05], back: [2.6, 0.3, 0.95, 0.12, -0.05], top: [0.6, 1.2, 1.0, 0.05, -0.03] };
const files = [];
for (const p of poses.split(',')) {
  for (const v of views.split(',')) {
    const f = `/tmp/ps_${p}_${v}.png`;
    await page.evaluate(([p, v]) => { const L = window.lab; if (p.includes(':')) { const [a, t] = p.split(':'); L.cat.motor.setPosture(a); L.step(+t); } else { L.cat.snap(p); L.step(0.5); } L.view(...v); L.render(); }, [p, V[v]]);
    await page.screenshot({ path: f, timeout: 600000 });
    files.push(f);
  }
}
await b.close();
const cols = views.split(',').length;
execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
files=sys.argv[2:]; cols=${cols}
ims=[Image.open(f) for f in files]
w,h=ims[0].size; rows=(len(ims)+cols-1)//cols
sheet=Image.new('RGB',(w*cols,h*rows),'white')
d=ImageDraw.Draw(sheet)
for i,(im,f) in enumerate(zip(ims,files)):
    x,y=(i%cols)*w,(i//cols)*h
    sheet.paste(im,(x,y)); d.text((x+6,y+6),f.split('ps_')[1][:-4],fill=(0,0,0))
sheet.save(sys.argv[1])
`, out, ...files]);
console.log('wrote', out);
