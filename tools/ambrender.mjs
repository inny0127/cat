// node tools/ambrender.mjs out.wav: the world outside the window rendered offline (a dawn of
// birds, then a summer night of crickets), to listen to
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await b.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:5173/lab.html');
const b64 = await page.evaluate(async () => {
  const S = await import('/src/audio/synth.ts');
  const sr = 44100, sec = 36;
  const ctx = new OfflineAudioContext(2, sr * sec, sr);
  const glass = ctx.createBiquadFilter(); glass.type = 'lowpass'; glass.frequency.value = 4200;
  const outside = ctx.createGain(); outside.gain.value = 0.6;
  outside.connect(glass).connect(ctx.destination);
  const buf = (d) => { const x = ctx.createBuffer(1, d.length, sr); x.copyToChannel(d, 0); return x; };
  const chips = [0, 1, 2, 3].map(() => buf(S.birdChip(sr))), songs = [0, 1, 2, 3].map(() => buf(S.birdSong(sr)));
  // dawn: 18 s of birds
  for (let t = 0.5; t < 17; t += 1.2 + Math.random() * 2.5) {
    const s = ctx.createBufferSource();
    s.buffer = Math.random() < 0.6 ? chips[Math.floor(Math.random() * 4)] : songs[Math.floor(Math.random() * 4)];
    s.playbackRate.value = 0.94 + Math.random() * 0.14;
    const g = ctx.createGain(); g.gain.value = 0.12 + Math.random() * 0.12;
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8;
    s.connect(g).connect(p).connect(outside);
    s.start(t);
  }
  // a summer night: crickets
  const c = ctx.createBufferSource(); c.buffer = buf(S.crickets(sr)); c.loop = true;
  const cg = ctx.createGain(); cg.gain.value = 0;
  cg.gain.setValueAtTime(0, 18); cg.gain.linearRampToValueAtTime(0.09, 20); cg.gain.setValueAtTime(0.09, 34); cg.gain.linearRampToValueAtTime(0, 36);
  c.connect(cg).connect(outside); c.start(18);
  const r = await ctx.startRendering();
  const n = r.length, L = r.getChannelData(0), R = r.getChannelData(1);
  let peak = 0, rms = 0;
  for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); rms += L[i] * L[i]; }
  console.log('peak', peak.toFixed(3), 'rms dBFS', (10 * Math.log10(rms / n)).toFixed(1));
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
  // (louder to listen to on its own: in the room it sits under everything else)
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * 2.5)) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * 2.5)) * 32767, true);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
page.on('console', (m) => console.log(m.text()));
writeFileSync(out, Buffer.from(b64, 'base64'));
await b.close();
console.log('wrote', out);
