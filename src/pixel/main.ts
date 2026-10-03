import { PixelApp } from './app';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hint = document.getElementById('hint') as HTMLDivElement;

PixelApp.create(canvas, hint).catch((err) => {
  console.error(err);
  const d = document.createElement('div');
  d.id = 'fallback';
  d.textContent = '이 기기에서는 고양이를 그릴 수 없어요. (WebGL2 필요)';
  document.body.appendChild(d);
});
