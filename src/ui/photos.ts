/**
 * The photographs: the first time the cat does each of the things worth a word (firsts.ts), a
 * picture of it at that moment, kept with the word and the day, oldest first. They are hung on
 * the fairy lights over the window (room.ts), and a tap on one opens them here, big.
 */
export interface Photo {
  /** what it was doing (a key of FIRSTS) */
  k: string;
  /** the word on it */
  text: string;
  /** when (ms) */
  at: number;
  /** the picture (a png, as a data url) */
  url: string;
}

const KEY = 'cat-window.photos';
/** how many are kept (the oldest let go first) */
export const KEEP_PHOTOS = 36;

export function loadPhotos(): Photo[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.url === 'string' && typeof p.k === 'string') : [];
  } catch {
    return [];
  }
}

/** kept; if there is no room for them all, the oldest go until there is */
export function savePhotos(list: Photo[]) {
  while (list.length > KEEP_PHOTOS) list.shift();
  for (;;) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length <= 1) return;
      list.shift();
    }
  }
}

/** a picture's pixels (rgba, rows from the top) as a png */
export function toPng(px: { w: number; h: number; data: Uint8Array }) {
  const c = document.createElement('canvas');
  c.width = px.w;
  c.height = px.h;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(px.w, px.h);
  img.data.set(px.data);
  // (opaque: what the paint pass leaves in alpha is not for showing)
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  g.putImageData(img, 0, 0);
  try {
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** '10월 29일' (and the year, if it was another year) */
export function dayOf(at: number, now = Date.now()) {
  const d = new Date(at), n = new Date(now);
  return `${d.getFullYear() !== n.getFullYear() ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * The album: one photograph at a time, big, as a print with its word written under it and the
 * day; a tap on the print for the next (a swipe either way, the next or the one before), a tap
 * anywhere else and it is put away.
 */
export class Album {
  private list: Photo[] = [];
  private i = 0;
  private x0 = 0;
  private y0 = 0;
  private img: HTMLImageElement;
  private text: HTMLDivElement;
  private day: HTMLDivElement;
  private count: HTMLDivElement;
  private card: HTMLDivElement;
  /** put away (for whoever wants to know) */
  onClose: (() => void) | null = null;

  constructor(private readonly el: HTMLElement) {
    el.innerHTML = '<div class="card"><img alt="" /><div class="words"></div><div class="day"></div></div><div class="count"></div>';
    this.card = el.querySelector('.card') as HTMLDivElement;
    this.img = el.querySelector('img') as HTMLImageElement;
    this.text = el.querySelector('.words') as HTMLDivElement;
    this.day = el.querySelector('.day') as HTMLDivElement;
    this.count = el.querySelector('.count') as HTMLDivElement;
    el.addEventListener('pointerdown', (e) => {
      this.x0 = e.clientX;
      this.y0 = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      if (!this.open) return;
      const dx = e.clientX - this.x0, dy = e.clientY - this.y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) this.go(dx < 0 ? 1 : -1);
      else if (Math.hypot(dx, dy) < 12 && this.card.contains(e.target as Node) && this.list.length > 1) this.go(1);
      else if (Math.hypot(dx, dy) < 12) this.close();
    });
  }

  get open() {
    return this.el.classList.contains('on');
  }

  show(list: Photo[], i: number) {
    if (!list.length) return;
    this.list = list;
    this.i = Math.max(0, Math.min(list.length - 1, i));
    this.put();
    this.el.classList.add('on');
  }

  close() {
    this.el.classList.remove('on');
    this.onClose?.();
  }

  private go(d: number) {
    const n = this.list.length;
    this.i = (this.i + d + n) % n;
    this.put();
  }

  private put() {
    const p = this.list[this.i];
    this.img.src = p.url;
    this.text.textContent = p.text;
    this.day.textContent = dayOf(p.at);
    this.count.textContent = this.list.length > 1 ? `${this.i + 1} / ${this.list.length}` : '';
  }
}
