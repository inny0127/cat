import { HuntApp } from './app';

const canvas = document.getElementById('stage') as HTMLCanvasElement;

// the pixel font's pixel a whole number of the screen's, so its letters stay crisp
const fontPixel = () => {
  const dpr = devicePixelRatio || 1;
  const k = Math.min(innerWidth, innerHeight) >= 600 ? 2 : 1;
  document.documentElement.style.setProperty('--fpx', `${(k * Math.max(1, Math.round(dpr))) / dpr}px`);
};
fontPixel();
addEventListener('resize', fontPixel);

try {
  new HuntApp(canvas);
} catch (err) {
  console.error(err);
  const d = document.createElement('div');
  d.id = 'fallback';
  d.textContent = '이 기기에서는 게임을 그릴 수 없어요. (WebGL2 필요)';
  document.getElementById('loading')?.remove();
  document.body.appendChild(d);
}
