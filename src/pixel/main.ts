import { Capacitor } from '@capacitor/core';
import { PixelApp } from './app';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hint = document.getElementById('hint') as HTMLDivElement;

// the pixel font's pixel a whole number of the screen's (on a screen of 2.75 to the pixel, three),
// so its letters stay crisp; and on a tablet twice the size, as the room's pixels are
const fontPixel = () => {
  const dpr = devicePixelRatio || 1;
  const k = Math.min(innerWidth, innerHeight) >= 600 ? 2 : 1;
  document.documentElement.style.setProperty('--fpx', `${(k * Math.max(1, Math.round(dpr))) / dpr}px`);
};
fontPixel();
addEventListener('resize', fontPixel);

PixelApp.create(canvas, hint).catch((err) => {
  console.error(err);
  const d = document.createElement('div');
  d.id = 'fallback';
  d.textContent = '이 기기에서는 고양이를 그릴 수 없어요. (WebGL2 필요)';
  document.getElementById('loading')?.remove();
  document.body.appendChild(d);
});

// the installable web version (iOS and Android alike): the room there offline too, and the
// notifications shown through the service worker (Android's Chrome shows them no other way) and
// brought to the front when tapped
if ('serviceWorker' in navigator && import.meta.env.PROD && !Capacitor.isNativePlatform() && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
