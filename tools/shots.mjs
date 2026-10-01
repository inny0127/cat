// Headless screenshots of the running app for visual checks.
// Usage: node tools/shots.mjs <url> <outdir> [scenario.json]
// A scenario is a list of {name, viewport:{width,height,dpr}, wait, eval} steps.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'shots';
const scenarioFile = process.argv[4];
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(out, { recursive: true });

const steps = scenarioFile
  ? JSON.parse(fs.readFileSync(scenarioFile, 'utf8'))
  : [{ name: 'phone', viewport: { width: 390, height: 844, dpr: 3 }, wait: 1500 }];

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
let page = null, ctxKey = '';
let vp = { width: 390, height: 844, dpr: 3 };
for (const s of steps) {
  vp = s.viewport || vp;
  const key = JSON.stringify(vp);
  if (!page || key !== ctxKey || s.reload) {
    if (page) await page.context().close();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr || 1, hasTouch: !!vp.touch, isMobile: !!vp.touch });
    page = await ctx.newPage();
    page.on('console', (m) => console.log('[page]', m.type(), m.text()));
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(url + (s.query || ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__cat, null, { timeout: 20000 }).catch(() => console.log('app not ready'));
    ctxKey = key;
  }
  if (s.eval) await page.evaluate(s.eval);
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.evalAfter) await page.evaluate(s.evalAfter);
  if (s.name) {
    const file = path.join(out, s.name + '.png');
    await page.screenshot({ path: file, clip: s.clip });
    console.log('saved', file);
  }
}
await browser.close();
