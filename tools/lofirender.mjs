// node tools/lofirender.mjs out.wav [seconds] [night 0..1]: the radio's music rendered offline
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [out, secArg = '40', nightArg = '0'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/lab.html');
const b64 = await page.evaluate(async ([sec, night]) => {
  const { Lofi } = await import('/src/audio/lofi.ts');
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(sr * sec), sr);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3;
  const master = ctx.createGain(); master.gain.value = 0.9;
  master.connect(comp).connect(ctx.destination);
  const l = new Lofi(ctx, master);
  l.setNight(night);
  l.offline(sec);
  const buf = await ctx.startRendering();
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}, [+secArg, +nightArg]);
writeFileSync(out, Buffer.from(b64, 'base64'));
await b.close();
console.log('wrote', out);
