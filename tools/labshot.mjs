// node tools/labshot.mjs out.png "query" [evalJS] [w] [h]
import { chromium } from 'playwright-core';
const [out, query = '', js = '', w = '900', h = '640'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 400)); });
await page.goto('http://localhost:5173/lab.html?still&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
if (js) await page.evaluate(js);
await page.evaluate(() => window.lab.render());
await page.waitForTimeout(300);
await page.screenshot({ path: out, timeout: 600000 });
await b.close();
