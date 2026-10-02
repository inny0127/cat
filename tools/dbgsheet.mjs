// node tools/dbgsheet.mjs out.png "<query>" "modes,..."  -> one small render per fur debug mode
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [out, query, modes = '0,3,4,5,6,7'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/lab.html?still&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
const files = [];
for (const m of modes.split(',')) {
  await page.evaluate((m) => { window.lab.shared.uDebug.value = +m; window.lab.render(); }, m);
  const f = `/tmp/dbg_${m}.png`;
  await page.screenshot({ path: f, timeout: 600000 });
  files.push(f);
}
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[2:]; ims=[Image.open(f) for f in fs]; w,h=ims[0].size; cols=3; rows=(len(ims)+2)//3
s=Image.new('RGB',(w*cols,h*rows),'white'); d=ImageDraw.Draw(s)
for i,(im,f) in enumerate(zip(ims,fs)):
    s.paste(im,((i%cols)*w,(i//cols)*h)); d.text(((i%cols)*w+5,(i//cols)*h+5),f.split('_')[-1],fill=(255,0,0))
s.save(sys.argv[1])
`, out, ...files]);
console.log('wrote', out);
