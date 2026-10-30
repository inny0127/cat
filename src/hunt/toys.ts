import * as THREE from 'three';

/** the treasures a cat keeps: what each is called, and its colour */
export const TOYS = [
  { id: 'cap', name: '병뚜껑', color: 0xd9534f },
  { id: 'tie', name: '머리끈', color: 0xf08ab0 },
  { id: 'fluff', name: '털뭉치', color: 0xe8dcc8 },
  { id: 'bell', name: '방울', color: 0xffd27a },
  { id: 'feather', name: '깃털', color: 0x7fb0e8 },
  { id: 'band', name: '고무줄', color: 0x9cff8a },
  { id: 'pencap', name: '볼펜 뚜껑', color: 0x3f5f9a },
  { id: 'sock', name: '짝 잃은 양말', color: 0xc65b6c },
] as const;
export type ToyId = (typeof TOYS)[number]['id'];

/** where one may be, out of the way: under the tables and the chairs, up on the fridge, the
 *  wardrobe, the bookcase and the cat tree, by the shoes, behind the plant, on the TV stand */
export const HIDES = [
  new THREE.Vector3(1.3, 0, 2.15), new THREE.Vector3(-2.7, 0, -2.2), new THREE.Vector3(-3.55, 0, -2.0),
  new THREE.Vector3(-4.15, 1.85, -0.25), new THREE.Vector3(1.9, 2.0, -0.6), new THREE.Vector3(4.3, 2.0, 1.3),
  new THREE.Vector3(3.9, 1.5, 2.9), new THREE.Vector3(-0.55, 0.42, -3.3), new THREE.Vector3(-0.45, 0, 3.32),
  new THREE.Vector3(4.05, 0.5, 0.35), new THREE.Vector3(4.2, 0.95, 1.8), new THREE.Vector3(2.3, 0, -2.0),
];

/**
 * A treasure hidden somewhere for the night: small, in its colour, with a twinkle over it now and
 * then to catch the eye from across the room; found by going right up to it.
 */
export class Toy {
  readonly mesh = new THREE.Group();
  found = false;
  private readonly glint: THREE.Sprite;

  constructor(readonly id: ToyId, readonly at: THREE.Vector3) {
    const color = TOYS.find((t) => t.id === id)!.color;
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.3 });
    const add = (g: THREE.BufferGeometry, y: number, rx = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.y = y;
      o.rotation.x = rx;
      this.mesh.add(o);
    };
    if (id === 'cap') add(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10), 0.005);
    else if (id === 'tie' || id === 'band') add(new THREE.TorusGeometry(0.02, 0.004, 4, 10), 0.004, Math.PI / 2);
    else if (id === 'fluff') add(new THREE.IcosahedronGeometry(0.022, 0), 0.02);
    else if (id === 'bell') add(new THREE.SphereGeometry(0.016, 7, 5), 0.016);
    else if (id === 'feather') { add(new THREE.BoxGeometry(0.012, 0.003, 0.06), 0.003); }
    else if (id === 'pencap') add(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6), 0.005, Math.PI / 2);
    else add(new THREE.BoxGeometry(0.05, 0.012, 0.03), 0.006);
    this.mesh.position.copy(at);
    this.mesh.rotation.y = Math.random() * Math.PI * 2;
    this.mesh.scale.setScalar(1.6);
    this.glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: Toy.star(), color: 0xfff6d8, transparent: true, depthWrite: false, fog: false }));
    this.glint.scale.setScalar(0.04);
    this.glint.position.set(0, 0.05, 0);
    this.mesh.add(this.glint);
  }

  /** a little four-pointed twinkle (none where there is nothing to draw it on) */
  private static tex: THREE.Texture | null = null;
  private static star() {
    if (Toy.tex || typeof document === 'undefined') return Toy.tex;
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(3, 0, 2, 8);
    g.fillRect(0, 3, 8, 2);
    Toy.tex = new THREE.CanvasTexture(c);
    Toy.tex.magFilter = THREE.NearestFilter;
    return Toy.tex;
  }

  /** the twinkle: a moment's flash every couple of seconds */
  update(t: number) {
    const k = Math.max(0, Math.sin(t * 2.6) - 0.8) * 5;
    this.glint.visible = !this.found && k > 0.02;
    this.glint.material.opacity = k;
    this.glint.material.rotation = t;
  }
}
