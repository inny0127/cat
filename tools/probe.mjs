import { chromium } from 'playwright-core';
const [query, js] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 200, height: 150 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/lab.html?still&shells=2&' + query);
await page.waitForFunction(() => window.ready, null, { timeout: 180000 });
console.log(JSON.stringify(await page.evaluate(js), null, 0));
await b.close();
