/**
 * The only text in the app: a faint line near the bottom that appears when something is worth
 * knowing (how to feed, why the cat left) and fades away by itself.
 */
export class Hint {
  private timer = 0;
  private current = '';
  constructor(private el: HTMLDivElement) {}

  show(text: string, ms = 5200) {
    if (this.current === text && this.el.classList.contains('on')) return;
    clearTimeout(this.timer);
    this.current = text;
    const put = () => {
      this.el.textContent = text;
      this.el.classList.add('on');
      this.timer = window.setTimeout(() => this.hide(), ms);
    };
    if (this.el.classList.contains('on')) {
      this.el.classList.remove('on');
      this.timer = window.setTimeout(put, 900);
    } else put();
  }

  hide() {
    clearTimeout(this.timer);
    this.el.classList.remove('on');
    this.current = '';
  }

  /** what it says (or is about to; '' when nothing) */
  get text() {
    return this.current;
  }

  get visible() {
    return this.el.classList.contains('on');
  }
}
