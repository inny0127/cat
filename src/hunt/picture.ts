/** what a night's picture shows */
export interface NightShot { shot: HTMLCanvasElement; name: string; when: string; score: number; stars: number; record: boolean; caught: Record<string, number> }

/**
 * A picture of a night to show off with: its last view, square, in big pixels, darkening to the
 * foot, where its name, its stars, its points and its catches are written in the game's own
 * pixel letters.
 */
export function nightPicture(L: NightShot) {
  const S = 1080, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const sw = L.shot.width, sh = L.shot.height, side = Math.min(sw, sh);
  g.drawImage(L.shot, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, S, S);
  const fade = g.createLinearGradient(0, S * 0.45, 0, S);
  fade.addColorStop(0, 'rgba(10, 8, 24, 0)');
  fade.addColorStop(1, 'rgba(10, 8, 24, 0.92)');
  g.fillStyle = fade;
  g.fillRect(0, 0, S, S);
  const font = getComputedStyle(document.documentElement).getPropertyValue('--pixel-font') || 'sans-serif';
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') => {
    g.font = `${size}px ${font}`;
    g.textAlign = align;
    g.fillStyle = 'rgba(20, 10, 40, 0.9)';
    g.fillText(s, x, y + size * 0.08);
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  text('밤사냥', 48, 96, 64, '#ffd27a');
  text(`${L.name} · ${L.when}`, S / 2, S - 380, 44, '#c8d4ff', 'center');
  g.font = `84px ${font}`;
  const stars = [0, 1, 2].map((k) => k < L.stars);
  stars.forEach((on, k) => text('★', S / 2 + (k - 1) * 96, S - 270, 84, on ? '#ffd27a' : '#3e3a66', 'center'));
  text(`${L.score.toLocaleString('ko-KR')}점${L.record ? ' · 최고 기록!' : ''}`, S / 2, S - 160, 72, '#f2ecff', 'center');
  const k = L.caught;
  text(`나방 ${k.moth} · 귀뚜라미 ${k.cricket} · 생쥐 ${k.mouse}${k.spider ? ` · 거미 ${k.spider}` : ''}`, S / 2, S - 80, 38, '#a9b0d8', 'center');
  return c;
}
