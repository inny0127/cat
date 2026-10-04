// node stills.mjs outdir "h1,h2,..." [setupJs] [w,h,dpr] [warmupSeconds]   (STILL_QUERY=date=2026-04-05&rain=1 for more of the query)
// Loads the app once (?still), then for each hour: sets the clock, steps a little game time and
// screenshots. setupJs runs once after load (window.__pcat is app).
import { chromium } from 'playwright-core';
const [out, hoursArg = '10,18.2,22', setup = '', sizeArg = '390,844,1', warmArg = '1.5'] = process.argv.slice(2);
const [w, h, dpr] = sizeArg.split(',').map(Number);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr || 1 });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('state')) console.log('CONSOLE', m.text().slice(0, 400)); });
await page.goto((process.env.REEL_BASE ?? 'http://localhost:5173/') + 'index.html?still' + (process.env.STILL_QUERY ? '&' + process.env.STILL_QUERY : ''));
await page.waitForFunction(() => window.__pcat, null, { timeout: 180000 });
if (setup) await page.evaluate((js) => { const app = window.__pcat; window.__t0 ??= performance.now() / 1000; eval(js); }, setup);
for (const hr of hoursArg.split(',')) {
  await page.evaluate(([hr, warm]) => {
    const app = window.__pcat;
    window.__t0 ??= performance.now() / 1000;
    window.__gt ??= 0;
    app.hourOverride = hr;
    const n = Math.round(warm / 0.05);
    for (let i = 0; i < n; i++) { window.__gt += 0.05; if (window.__tick) window.__tick(window.__gt, app); app.tick(0.05, window.__t0 + window.__gt); }
    app.stage.render();
  }, [hr, +warmArg]);
  await page.screenshot({ path: `${out}/h${hr}.png` });
  console.log('shot', hr);
}
await b.close();
