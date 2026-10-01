import { Renderer } from './render/renderer';
import { Silhouette, imageData, loadImage, loadRig, type LayerName, type RigData } from './rig/rig';
import { FurField } from './rig/furField';
import { Animator } from './rig/animator';

const ASSETS = './assets/';

export class App {
  private last = 0;
  private frozen = false;
  readonly anim = new Animator();
  readonly field: FurField;

  static async create(canvas: HTMLCanvasElement, hint: HTMLDivElement) {
    const rig = await loadRig(ASSETS);
    const names = rig.order;
    const [imgs, silImg] = await Promise.all([
      Promise.all(names.map((n) => loadImage(ASSETS + rig.layers[n].file))),
      loadImage(ASSETS + 'silhouette.png'),
    ]);
    const images = Object.fromEntries(names.map((n, i) => [n, imgs[i]])) as Record<LayerName, HTMLImageElement>;
    const sil = new Silhouette(imageData(silImg));
    return new App(canvas, hint, rig, images, sil);
  }

  readonly renderer: Renderer;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly hint: HTMLDivElement,
    readonly rig: RigData,
    images: Record<LayerName, HTMLImageElement>,
    readonly sil: Silhouette,
  ) {
    this.renderer = new Renderer(canvas, rig, images, sil);
    this.field = new FurField(rig.polys.head);
    window.addEventListener('resize', () => this.renderer.resize());
    (window as unknown as { __cat: unknown }).__cat = this;
    requestAnimationFrame((t) => this.frame(t));
  }

  freeze(on = true) {
    this.frozen = on;
  }

  private frame(now: number) {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    if (!this.frozen) {
      this.anim.update(dt);
      this.field.step(dt);
    }
    this.renderer.render(
      this.anim.pose, this.anim.eyeA, this.anim.eyeB, this.field.take(),
      { night: 0, time: now / 1000 },
      (x, y) => this.field.sample(x, y),
    );
    requestAnimationFrame((t) => this.frame(t));
  }
}
