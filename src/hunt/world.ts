import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Box } from './physics';

/** the flat's size: x and z either side of its middle (m), and how high its ceiling */
export const HALF_X = 4.5, HALF_Z = 3.5, CEIL = 2.5;

/** a light in the flat: where, its colour, how bright, how far it reaches; flicker: a TV's */
export interface Lamp { at: THREE.Vector3; color: number; power: number; reach: number; flicker?: boolean }

/** a mouse hole at the foot of a wall: where, and the way into the room from it */
export interface Hole { at: THREE.Vector3; out: THREE.Vector3 }

/**
 * The flat at night, as a cat sees it: a living room (a sofa under the window, a coffee table on a
 * rug, a floor lamp, a cat tree, a bookcase to climb, the TV), a kitchen (a counter and the fridge
 * on top of everything, a table and its chairs), a hall, and the bedroom where their person sleeps.
 * Everything in boxes, for the cat to stand on and bump into; drawn flat-shaded in a few colours.
 */
export class World {
  readonly group = new THREE.Group();
  readonly boxes: Box[] = [];
  readonly lamps: Lamp[] = [];
  readonly holes: Hole[] = [];
  /** where the person sleeps: the middle of the bed's top, and how far round it a gift counts */
  readonly bed = { at: new THREE.Vector3(3.6, 0.55, -2.4), r: 1.25 };
  /** their head on the pillow (it breathes), and the blanket over them */
  readonly sleeper: THREE.Object3D;
  /** the TV's screen (it flickers) */
  readonly screen: THREE.MeshBasicMaterial;
  /** where the moon comes in, and from which way */
  readonly moonDir = new THREE.Vector3(-0.25, -0.62, -0.75).normalize();
  /** the floor, in cells a mouse can run along (1: free) */
  readonly grid: { cell: number; cols: number; rows: number; free: Uint8Array };
  /** the flat's crumbs and bowls: where a mouse goes when it is out */
  readonly treats = [new THREE.Vector3(-2.6, 0, -2.0), new THREE.Vector3(-1.55, 0, -0.35), new THREE.Vector3(1.4, 0, 1.0)];
  /** where crickets like to be, and moths (round the lights) */
  readonly cricketSpots = [new THREE.Vector3(-2.2, 0, -1.0), new THREE.Vector3(1.6, 0, 2.0), new THREE.Vector3(-0.2, 0, -2.6), new THREE.Vector3(3.6, 0, -0.9), new THREE.Vector3(-3.0, 0, 1.6)];

  private readonly parts = new Map<string, THREE.BufferGeometry[]>();
  private readonly mats = new Map<string, THREE.Material>();

  constructor() {
    const H = CEIL;
    // --- the shell: floors, walls, ceiling ---
    this.slab('floorWood', -HALF_X, HALF_X, -0.02, 0, -1.2, HALF_Z);
    this.slab('floorWood', -1.2, 1.5, -0.02, 0, -HALF_Z, -1.2);
    this.slab('tile', -HALF_X, -1.2, -0.02, 0, -HALF_Z, -1.2);
    this.slab('carpet', 1.5, HALF_X, -0.019, 0.001, -HALF_Z, 0);
    this.slab('ceiling', -HALF_X, HALF_X, H, H + 0.05, -HALF_Z, HALF_Z, false);
    // outer walls (the north one with a window in it)
    this.solid('wall', -HALF_X - 0.1, -HALF_X, 0, H, -HALF_Z, HALF_Z);
    this.solid('wall', HALF_X, HALF_X + 0.1, 0, H, -HALF_Z, HALF_Z);
    this.solid('wall', -HALF_X, HALF_X, 0, H, -HALF_Z - 0.1, -HALF_Z);
    this.solid('wall', -HALF_X, 0.7, 0, H, HALF_Z, HALF_Z + 0.1);
    this.solid('wall', 2.3, HALF_X, 0, H, HALF_Z, HALF_Z + 0.1);
    this.solid('wall', 0.7, 2.3, 0, 1.0, HALF_Z, HALF_Z + 0.1);
    this.solid('wall', 0.7, 2.3, 2.1, H, HALF_Z, HALF_Z + 0.1);
    // (the window: its frame, its bars, the night outside)
    this.deco('frame', 0.66, 2.34, 0.97, 1.03, HALF_Z - 0.06, HALF_Z + 0.02);
    this.deco('frame', 0.66, 2.34, 2.07, 2.13, HALF_Z - 0.04, HALF_Z + 0.02);
    this.deco('frame', 0.66, 0.72, 1.0, 2.1, HALF_Z - 0.04, HALF_Z + 0.02);
    this.deco('frame', 2.28, 2.34, 1.0, 2.1, HALF_Z - 0.04, HALF_Z + 0.02);
    this.deco('frame', 1.48, 1.52, 1.0, 2.1, HALF_Z - 0.03, HALF_Z + 0.02);
    this.night(0.7, 2.3, 1.0, 2.1, HALF_Z + 0.04);
    // baseboards
    for (const [x0, x1, z0, z1] of [[-HALF_X, HALF_X, HALF_Z - 0.02, HALF_Z], [-HALF_X, HALF_X, -HALF_Z, -HALF_Z + 0.02], [-HALF_X, -HALF_X + 0.02, -HALF_Z, HALF_Z], [HALF_X - 0.02, HALF_X, -HALF_Z, HALF_Z]] as const) this.deco('trim', x0, x1, 0, 0.07, z0, z1);
    // the bedroom's walls: along z = 0 with a door in it, and along x = 1.5
    this.solid('wall', 1.45, 2.0, 0, H, -0.05, 0.05);
    this.solid('wall', 2.8, HALF_X, 0, H, -0.05, 0.05);
    this.solid('wall', 2.0, 2.8, 2.05, H, -0.05, 0.05);
    this.solid('wall', 1.45, 1.55, 0, H, -HALF_Z, 0);
    this.deco('frame', 1.96, 2.0, 0, 2.05, -0.07, 0.07);
    this.deco('frame', 2.8, 2.84, 0, 2.05, -0.07, 0.07);
    this.deco('frame', 1.96, 2.84, 2.02, 2.06, -0.07, 0.07);
    // the front door, in the hall
    this.deco('door', -0.3, 0.6, 0, 2.05, -HALF_Z, -HALF_Z + 0.04);
    this.deco('brass', 0.45, 0.52, 0.95, 1.0, -HALF_Z + 0.04, -HALF_Z + 0.07);

    // --- the living room ---
    // the sofa under the window: its base and seat, its back, its arms, three cushions
    this.solid('sofa', 0.4, 2.6, 0, 0.42, 2.75, HALF_Z);
    this.solid('sofaDark', 0.4, 2.6, 0.42, 0.88, 3.22, HALF_Z);
    this.solid('sofaDark', 0.4, 0.62, 0.42, 0.64, 2.75, 3.22);
    this.solid('sofaDark', 2.38, 2.6, 0.42, 0.64, 2.75, 3.22);
    for (const [x0, x1] of [[0.66, 1.2], [1.24, 1.78], [1.82, 2.34]]) this.deco('cushion', x0, x1, 0.42, 0.45, 2.78, 3.2);
    this.deco('pillow', 0.7, 1.05, 0.45, 0.72, 3.05, 3.2);
    // the rug, the coffee table (a cat can go under it)
    this.deco('rug', 0.3, 2.7, 0, 0.008, 1.2, 2.75);
    this.table('wood', 0.9, 2.1, 1.7, 2.3, 0.4, 0.04, 0.05);
    this.deco('book', 1.1, 1.4, 0.4, 0.43, 1.85, 2.05);
    this.deco('mug', 1.75, 1.83, 0.4, 0.48, 2.0, 2.08);
    // the floor lamp in the corner
    this.cyl('dark', 3.2, 3.1, 0.16, 0, 0.03);
    this.solid('dark', 3.18, 3.22, 0, 1.5, 3.08, 3.12);
    this.cyl('shade', 3.2, 3.1, 0.22, 1.42, 1.72, 0.16, true);
    this.lamps.push({ at: new THREE.Vector3(3.2, 1.5, 3.1), color: 0xffc27a, power: 5, reach: 6 });
    // the cat tree: a base, a post, three platforms going up
    this.solid('sisal', 3.65, 4.3, 0, 0.08, 2.55, 3.25);
    this.solid('sisal', 3.92, 4.02, 0.08, 1.45, 2.88, 2.98);
    this.solid('felt', 3.55, 4.1, 0.45, 0.5, 2.5, 3.05);
    this.solid('felt', 3.85, 4.42, 0.95, 1.0, 2.9, 3.45);
    this.solid('felt', 3.6, 4.2, 1.45, 1.5, 2.6, 3.2);
    // the bookcase against the east wall: shelves to climb, books on them
    {
      const x0 = 4.12, x1 = HALF_X, z0 = 0.5, z1 = 2.0;
      this.solid('wood', x0, x1, 0, 2.0, z0, z0 + 0.03);
      this.solid('wood', x0, x1, 0, 2.0, z1 - 0.03, z1);
      this.deco('woodDark', x1 - 0.02, x1, 0, 2.0, z0, z1);
      let seed = 3;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (const y of [0, 0.46, 0.92, 1.38, 1.84]) {
        this.solid('wood', x0, x1, y, y + 0.03, z0, z1);
        if (y > 1.8) continue;
        // (books along the back half, gaps here and there to sit in)
        for (let z = z0 + 0.05; z < z1 - 0.06;) {
          const w = 0.03 + rnd() * 0.04, hh = 0.2 + rnd() * 0.14;
          if (rnd() < 0.22) { z += 0.12; continue; }
          this.deco(['bookRed', 'bookBlue', 'bookGreen', 'bookCream'][Math.floor(rnd() * 4)], x0 + 0.17, x1 - 0.03, y + 0.03, y + 0.03 + hh, z, z + w);
          z += w + 0.004;
        }
      }
    }
    // the TV on its stand, against the bedroom wall
    this.solid('woodDark', 2.9, 4.2, 0, 0.5, 0.05, 0.5);
    this.solid('dark', 3.0, 4.1, 0.5, 1.15, 0.12, 0.2);
    this.screen = new THREE.MeshBasicMaterial({ color: 0x4f7fc0 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.56), this.screen);
    scr.position.set(3.55, 0.83, 0.205);
    this.group.add(scr);
    this.lamps.push({ at: new THREE.Vector3(3.55, 0.85, 0.7), color: 0x6f9fff, power: 1.6, reach: 4, flicker: true });
    // a big plant in a pot by the window
    this.cyl('pot', -0.7, 3.1, 0.2, 0, 0.42, 0.17);
    this.boxes.push([-0.88, 0, 2.92, -0.52, 0.42, 3.28]);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      this.ball('leaf', -0.7 + Math.cos(a) * 0.18, 0.6 + 0.08 * (i % 3) + 0.02 * i, 3.1 + Math.sin(a) * 0.15, 0.17);
    }
    // a mouse hole by the bookcase, and one by the plant
    this.hole(4.49, 0.33, -1, 0);
    this.hole(-1.6, HALF_Z - 0.01, 0, -1);

    // --- the kitchen ---
    this.solid('cabinet', -HALF_X, -3.88, 0, 0.88, -HALF_Z, -0.62);
    this.solid('counter', -HALF_X, -3.84, 0.88, 0.92, -HALF_Z, -0.62);
    for (let z = -3.4; z < -0.7; z += 0.5) this.deco('brass', -3.885, -3.875, 0.7, 0.72, z, z + 0.12);
    this.deco('pot', -4.4, -4.1, 0.92, 1.05, -3.1, -2.8);
    this.deco('bookCream', -4.35, -4.1, 0.92, 1.18, -1.5, -1.3);
    // the fridge, on top of everything
    this.solid('fridge', -HALF_X, -3.82, 0, 1.85, -0.6, 0.15);
    this.deco('trim', -3.825, -3.815, 0.95, 1.1, -0.5, -0.48);
    // the table and its two chairs (all of them to go under)
    this.table('wood', -3.3, -1.9, -2.6, -1.4, 0.75, 0.04, 0.05);
    this.deco('bowl', -2.75, -2.45, 0.75, 0.8, -2.15, -1.85);
    this.chair(-3.55, -2.0, -1);
    this.chair(-1.65, -2.0, 1);
    // the bin, the cat's own bowls
    this.cyl('dark', -1.55, -3.2, 0.16, 0, 0.5, 0.14);
    this.boxes.push([-1.71, 0, -3.36, -1.39, 0.5, -3.04]);
    this.cyl('bowl', -1.68, -0.32, 0.07, 0, 0.04);
    this.cyl('bowl', -1.45, -0.32, 0.07, 0, 0.04);
    this.hole(-1.2, -HALF_Z + 0.01, 0, 1);
    this.hole(-HALF_X + 0.01, 1.2, 1, 0);
    // a dim light left on under the cabinets
    this.lamps.push({ at: new THREE.Vector3(-4.0, 0.95, -2.0), color: 0xffe2b0, power: 0.9, reach: 3 });

    // --- the hall ---
    this.solid('woodDark', -1.0, -0.35, 0, 0.42, -HALF_Z, -3.15);
    this.deco('shoe', -0.95, -0.7, 0.42, 0.5, -3.45, -3.25);
    this.deco('shoe', -0.62, -0.4, 0.42, 0.49, -3.42, -3.22);
    // (a night light in the socket)
    this.lamps.push({ at: new THREE.Vector3(1.2, 0.3, -3.4), color: 0xa8d0ff, power: 0.5, reach: 2.5 });
    this.ball('glow', 1.2, 0.3, -3.47, 0.03, true);

    // --- the bedroom ---
    this.solid('bedFrame', 2.7, HALF_X, 0, 0.32, -HALF_Z, -1.35);
    this.solid('sheet', 2.75, HALF_X - 0.05, 0.32, 0.55, -HALF_Z + 0.05, -1.4);
    this.solid('bedFrame', 2.7, HALF_X, 0.55, 1.15, -HALF_Z, -3.38);
    this.deco('pillow', 3.2, 4.0, 0.55, 0.66, -3.35, -2.95);
    // (them, asleep under the blanket)
    const sleeper = new THREE.Group();
    const blanket = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.mat('blanket'));
    blanket.scale.set(0.55, 0.2, 0.75);
    blanket.position.set(0, 0, 0.75);
    blanket.castShadow = blanket.receiveShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), this.mat('skin'));
    head.position.set(0, 0.08, -0.1);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mat('hair'));
    hair.position.copy(head.position);
    hair.rotation.x = -0.5;
    sleeper.add(blanket, head, hair);
    sleeper.position.set(3.6, 0.58, -3.0);
    this.group.add(sleeper);
    this.sleeper = sleeper;
    this.boxes.push([3.1, 0.55, -2.95, 4.1, 0.72, -1.55]);
    this.deco('blanket', 2.8, HALF_X - 0.1, 0.55, 0.6, -2.4, -1.45);
    // the bedside table and its lamp
    this.solid('wood', 2.05, 2.6, 0, 0.55, -HALF_Z, -3.0);
    this.cyl('dark', 2.32, -3.25, 0.06, 0.55, 0.58);
    this.solid('dark', 2.31, 2.33, 0.55, 0.75, -3.26, -3.24);
    this.cyl('shade', 2.32, -3.25, 0.1, 0.72, 0.86, 0.07, true);
    this.lamps.push({ at: new THREE.Vector3(2.32, 0.8, -3.25), color: 0xffb070, power: 1.2, reach: 3 });
    // the wardrobe
    this.solid('wood', 1.6, 2.2, 0, 2.0, -1.7, -0.15);
    this.deco('brass', 2.2, 2.21, 1.0, 1.15, -0.95, -0.9);
    this.hole(HALF_X - 0.01, -0.8, -1, 0);

    // the flat merged into one mesh a look (fewer draws on a phone)
    for (const [key, geos] of this.parts) {
      const g = mergeGeometries(geos);
      for (const x of geos) x.dispose();
      if (!g) continue;
      const m = new THREE.Mesh(g, this.mat(key));
      m.castShadow = !['floorWood', 'tile', 'carpet', 'ceiling', 'rug', 'glow', 'shade'].includes(key);
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.grid = this.floorGrid();
  }

  // ----- what it is made of -----

  private static readonly COLORS: Record<string, number> = {
    floorWood: 0x9a6a46, tile: 0xcfc6b4, carpet: 0x857a86, ceiling: 0xb9b0a6, wall: 0xcdbca8, trim: 0xe8dfd2, frame: 0xe6ddcf,
    door: 0x7a5236, brass: 0xd8b25a, sofa: 0x4c7d8a, sofaDark: 0x3e6a77, cushion: 0x5a8e9b, pillow: 0xe9d8b8, rug: 0xa84a4f,
    wood: 0x8a5d3b, woodDark: 0x5e3f2a, dark: 0x2c2a30, shade: 0xffe2b0, sisal: 0xc9a46c, felt: 0x8f6fb0, bookRed: 0xb4473f,
    bookBlue: 0x3f5f9a, bookGreen: 0x4f8a5a, bookCream: 0xe3d3ae, book: 0x3f5f9a, mug: 0xe8e2d6, pot: 0xc0643c, leaf: 0x3f8a4a,
    cabinet: 0xe9e4da, counter: 0x9aa0a8, fridge: 0xdfe6ea, bowl: 0xd9534f, shoe: 0x3b3b48, bedFrame: 0x6b4a35, sheet: 0xe8e4dc,
    blanket: 0xc65b6c, skin: 0xe8b996, hair: 0x3a2a24, glow: 0xbfe0ff,
  };
  private mat(key: string) {
    let m = this.mats.get(key);
    if (!m) {
      const glow = key === 'shade' || key === 'glow';
      m = glow ? new THREE.MeshBasicMaterial({ color: World.COLORS[key] }) : new THREE.MeshLambertMaterial({ color: World.COLORS[key] ?? 0xff00ff, flatShading: true });
      this.mats.set(key, m);
    }
    return m;
  }
  private add(key: string, g: THREE.BufferGeometry) {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') ng.deleteAttribute(k);
    const list = this.parts.get(key) ?? [];
    list.push(ng);
    this.parts.set(key, list);
  }
  /** a box drawn, not stood on or bumped into */
  private deco(key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(key, g);
  }
  /** a box drawn and solid */
  private solid(key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
    this.deco(key, x0, x1, y0, y1, z0, z1);
    this.boxes.push([x0, y0, z0, x1, y1, z1]);
  }
  /** a floor or a ceiling (solid only below the floor) */
  private slab(key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, _solid = true) {
    this.deco(key, x0, x1, y0, y1, z0, z1);
  }
  /** a round thing standing at x, z: radius r, from y0 to y1 (a narrower top: r1) */
  private cyl(key: string, x: number, z: number, r: number, y0: number, y1: number, r1 = r, open = false) {
    const g = new THREE.CylinderGeometry(r1, r, y1 - y0, 12, 1, open);
    g.translate(x, (y0 + y1) / 2, z);
    this.add(key, g);
  }
  private ball(key: string, x: number, y: number, z: number, r: number, _glow = false) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    this.add(key, g);
  }
  /** a table: its top (thickness t, at height h), four legs (w across); a cat walks under it */
  private table(key: string, x0: number, x1: number, z0: number, z1: number, h: number, t: number, w: number) {
    this.solid(key, x0, x1, h - t, h, z0, z1);
    for (const [lx, lz] of [[x0 + 0.04, z0 + 0.04], [x1 - 0.04 - w, z0 + 0.04], [x0 + 0.04, z1 - 0.04 - w], [x1 - 0.04 - w, z1 - 0.04 - w]]) this.solid(key, lx, lx + w, 0, h - t, lz, lz + w);
  }
  /** a chair at x, z, its back to one side (-1: west, 1: east) */
  private chair(x: number, z: number, back: number) {
    this.solid('wood', x - 0.2, x + 0.2, 0.43, 0.47, z - 0.2, z + 0.2);
    for (const [lx, lz] of [[x - 0.18, z - 0.18], [x + 0.14, z - 0.18], [x - 0.18, z + 0.14], [x + 0.14, z + 0.14]]) this.solid('wood', lx, lx + 0.04, 0, 0.43, lz, lz + 0.04);
    const bx = x + back * 0.18;
    this.solid('wood', bx - 0.02, bx + 0.02, 0.47, 0.95, z - 0.2, z + 0.2);
  }
  /** the night through the window: a deep blue, a moon, the lit windows across the way */
  private night(x0: number, x1: number, y0: number, y1: number, z: number) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 44;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 44);
    sky.addColorStop(0, '#0d1230');
    sky.addColorStop(1, '#263a6a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 64, 44);
    g.fillStyle = '#fff6d8';
    g.beginPath();
    g.arc(46, 11, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0d1230';
    g.beginPath();
    g.arc(48, 9, 4.5, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 18; i++) { g.fillStyle = '#c8d4ff'; g.fillRect((i * 37) % 64, (i * 23) % 20, 1, 1); }
    for (let b = 0; b < 8; b++) {
      const bx = b * 8 + ((b * 5) % 3), bh = 10 + ((b * 7) % 9);
      g.fillStyle = '#141a33';
      g.fillRect(bx, 44 - bh, 7, bh);
      for (let wy = 44 - bh + 2; wy < 42; wy += 3) for (let wx = bx + 1; wx < bx + 6; wx += 2) if (((wx * 13 + wy * 7 + b) % 5) === 0) { g.fillStyle = '#ffd27a'; g.fillRect(wx, wy, 1, 1); }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    m.rotation.y = Math.PI;
    this.group.add(m);
  }
  /** a mouse hole in the foot of a wall (an arch of dark), the way out of it into the room */
  private hole(x: number, z: number, ox: number, oz: number) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0a0808 }));
    m.position.set(x, 0.001, z);
    m.rotation.y = Math.atan2(ox, oz);
    this.group.add(m);
    this.holes.push({ at: new THREE.Vector3(x + ox * 0.06, 0, z + oz * 0.06), out: new THREE.Vector3(ox, 0, oz) });
  }

  // ----- the floor for small things -----

  /** the floor in cells: free where something small (a mouse, a cricket) can be, clear of anything
   *  standing on the floor */
  private floorGrid() {
    const cell = 0.1, cols = Math.round((2 * HALF_X) / cell), rows = Math.round((2 * HALF_Z) / cell);
    const free = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = -HALF_X + (i + 0.5) * cell, z = -HALF_Z + (j + 0.5) * cell;
      let ok = true;
      for (const B of this.boxes) {
        if (B[1] > 0.06) continue;
        if (x + 0.04 > B[0] && x - 0.04 < B[3] && z + 0.04 > B[2] && z - 0.04 < B[5]) { ok = false; break; }
      }
      free[j * cols + i] = ok ? 1 : 0;
    }
    return { cell, cols, rows, free };
  }

  /** a free cell's middle near a point (null: none near) */
  cellAt(x: number, z: number) {
    const { cell, cols, rows, free } = this.grid;
    const i = Math.floor((x + HALF_X) / cell), j = Math.floor((z + HALF_Z) / cell);
    for (let r = 0; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= cols || b >= rows || !free[b * cols + a]) continue;
      return b * cols + a;
    }
    return -1;
  }

  /** a way across the floor for something small, by the free cells (none: no way) */
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const { cell, cols, free } = this.grid;
    const s = this.cellAt(from.x, from.z), g = this.cellAt(to.x, to.z);
    if (s < 0 || g < 0) return [];
    const n = free.length, cost = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const gx = g % cols, gz = Math.floor(g / cols);
    const open = [s];
    cost[s] = 0;
    while (open.length) {
      let bi = 0, bf = Infinity;
      for (let k = 0; k < open.length; k++) {
        const c = open[k], f = cost[c] + Math.hypot((c % cols) - gx, Math.floor(c / cols) - gz);
        if (f < bf) { bf = f; bi = k; }
      }
      const c = open.splice(bi, 1)[0];
      if (c === g) break;
      if (done[c]) continue;
      done[c] = 1;
      const ci = c % cols, cj = Math.floor(c / cols);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= cols || j >= this.grid.rows) continue;
        const k = j * cols + i;
        if (!free[k] || done[k]) continue;
        // (no cutting a corner past something)
        if (di && dj && (!free[cj * cols + i] || !free[j * cols + ci])) continue;
        const nc = cost[c] + (di && dj ? Math.SQRT2 : 1);
        if (nc < cost[k]) { cost[k] = nc; prev[k] = c; open.push(k); }
      }
    }
    if (g !== s && prev[g] < 0) return [];
    const out: THREE.Vector3[] = [];
    for (let c = g; c >= 0 && c !== s; c = prev[c]) out.unshift(new THREE.Vector3(-HALF_X + ((c % cols) + 0.5) * cell, 0, -HALF_Z + (Math.floor(c / cols) + 0.5) * cell));
    out.push(to.clone().setY(0));
    // (every other cell is enough: they are close)
    return out.filter((_, k) => k % 2 === 1 || k === out.length - 1);
  }
}
