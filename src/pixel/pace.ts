/**
 * Whether the phone keeps up with the picture. Told of each frame drawn while there is something
 * moving to draw (the cat about, a finger on the glass), and how long after the last it came: a
 * phone that has been well under 25 frames a second for a good few seconds of that is one the
 * art is too fine for. A screen held to 30 frames a second (an iPhone saving its battery) is not
 * slow; nor is a moment's stutter, or a page coming back from the background.
 */
export class SlowWatch {
  private slow = 0;
  private seen = 0;
  /** said once: the art should be drawn coarser */
  tripped = false;
  /** (wait: seconds of drawing to see before judging, the page's first moments being busy) */
  constructor(private readonly wait = 3) {}
  /** a frame drawn gap ms after the last; true the once it trips */
  frame(gapMs: number) {
    if (this.tripped || gapMs <= 0) return false;
    // (a gap of a second or more is the page put away a moment, not a slow frame)
    if (gapMs > 1000) return false;
    const s = gapMs / 1000;
    this.seen += s;
    if (this.seen < this.wait) return false;
    this.slow = gapMs > 40 ? this.slow + s : Math.max(0, this.slow - 0.5 * s);
    if (this.slow < 4) return false;
    this.tripped = true;
    return true;
  }
}
