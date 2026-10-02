// node tools/batchcmp.mjs out.jpg "ref1|query1|setup1" "ref2|query2|setup2" ...
// One browser, many reference/render pairs stacked into one image (each pair: reference left, render right).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
const [out, ...jobs] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pairs = [];
let i = 0;
for (const job of jobs) {
  const [ref, query, setup = ''] = job.split('|');
  const [w, h] = execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${ref}'); print(im.size[0], im.size[1])`]).toString().trim().split(' ').map(Number);
  const page = await b.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://localhost:5173/lab.html?still&' + query);
  await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
  if (setup) await page.evaluate(setup);
  await page.evaluate(() => window.lab.render());
  const shot = `/tmp/batch_${i++}.png`;
  await page.screenshot({ path: shot, timeout: 600000 });
  await page.close();
  pairs.push(ref, shot);
  console.log('rendered', shot);
}
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
args=sys.argv[2:]; rows=[]
W=1100
for k in range(0,len(args),2):
    a=Image.open(args[k]).convert('RGB'); b=Image.open(args[k+1]).convert('RGB')
    h=round(W/2*a.size[1]/a.size[0])
    a=a.resize((W//2-3,h)); b=b.resize((W//2-3,h))
    r=Image.new('RGB',(W,h),'white'); r.paste(a,(0,0)); r.paste(b,(W//2+3,0)); rows.append(r)
H=sum(r.size[1] for r in rows)+6*(len(rows)-1)
s=Image.new('RGB',(W,H),'white'); y=0
for r in rows: s.paste(r,(0,y)); y+=r.size[1]+6
s.save(sys.argv[1], quality=88)
`, out, ...pairs]);
console.log('wrote', out);
