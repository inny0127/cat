import type { Material } from '../cat3d/pixclass';

/** where a thing goes: the room's wall, rug, bed and curtains; on the cat, round its neck and on its
 *  head */
export type Slot = 'wall' | 'rug' | 'bed' | 'curtain' | 'neck' | 'head';

/** what an accessory is, as it is made (cat3d/wear.ts) */
export type Look = 'collar' | 'bandana' | 'bow' | 'beanie' | 'flower' | 'crown';

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  /** in 냥 (0: had from the start) */
  price: number;
  /** the affection level it opens at */
  lv: number;
  /** the room's colours it changes: a material's ramp, shadow to light */
  ramps?: Partial<Record<Material, string[]>>;
  /** an accessory: what it is, and in what */
  look?: Look;
  color?: Material;
  /** may be taken off again (an accessory) */
  optional?: boolean;
}

export const SLOT_NAMES: Record<Slot, string> = { wall: '벽지', rug: '러그', bed: '침대', curtain: '커튼', neck: '목걸이', head: '머리 장식' };

export const CATALOG: Item[] = [
  // the walls: the room's dusty peach plaster, and others
  { id: 'wall-peach', slot: 'wall', name: '복숭아 벽지', price: 0, lv: 1 },
  { id: 'wall-mint', slot: 'wall', name: '민트 벽지', price: 180, lv: 2, ramps: { wall: ['#28354a', '#3e5a63', '#5e8a80', '#8fb8a0', '#c3dfc0'] } },
  { id: 'wall-butter', slot: 'wall', name: '버터 벽지', price: 220, lv: 3, ramps: { wall: ['#3e3248', '#6a5258', '#a07f63', '#d6b47c', '#f5dca2'] } },
  { id: 'wall-lavender', slot: 'wall', name: '라벤더 벽지', price: 260, lv: 4, ramps: { wall: ['#302b4d', '#4f4570', '#7d6c9c', '#ab9bc4', '#d8cae4'] } },
  { id: 'wall-sky', slot: 'wall', name: '하늘 벽지', price: 300, lv: 6, ramps: { wall: ['#272f4d', '#3a5072', '#58789c', '#86a8c6', '#bcd5e6'] } },
  { id: 'wall-rose', slot: 'wall', name: '장미 벽지', price: 360, lv: 8, ramps: { wall: ['#3a2a46', '#64405a', '#9a5f72', '#cd8a92', '#efb9b6'] } },
  // the rug
  { id: 'rug-indigo', slot: 'rug', name: '쪽빛 러그', price: 0, lv: 1 },
  { id: 'rug-rose', slot: 'rug', name: '분홍 러그', price: 160, lv: 2, ramps: { rug: ['#3a2236', '#5e3048', '#8c4a62', '#ba7186', '#dda2ad'] } },
  { id: 'rug-forest', slot: 'rug', name: '숲 러그', price: 200, lv: 3, ramps: { rug: ['#1f2a33', '#2b4340', '#3f6452', '#628c6c', '#93b892'] } },
  { id: 'rug-honey', slot: 'rug', name: '꿀 러그', price: 240, lv: 5, ramps: { rug: ['#3b2a2e', '#664436', '#9a6a43', '#c79858', '#e8c47e'] } },
  { id: 'rug-plum', slot: 'rug', name: '자두 러그', price: 280, lv: 7, ramps: { rug: ['#2c1f3a', '#47305a', '#6b4a82', '#9370a8', '#bfa0cc'] } },
  // the cat's bed
  { id: 'bed-teal', slot: 'bed', name: '청록 방석', price: 0, lv: 1 },
  { id: 'bed-pink', slot: 'bed', name: '딸기 방석', price: 150, lv: 2, ramps: { bed: ['#3a2236', '#61324a', '#93506a', '#c27a8e', '#e6abb5'] } },
  { id: 'bed-mustard', slot: 'bed', name: '겨자 방석', price: 190, lv: 3, ramps: { bed: ['#3a2c2c', '#664a33', '#9c7438', '#cca24a', '#ebcd7a'] } },
  { id: 'bed-lilac', slot: 'bed', name: '라일락 방석', price: 230, lv: 5, ramps: { bed: ['#2c2742', '#463e66', '#6c6292', '#988cbb', '#c7bddc'] } },
  { id: 'bed-navy', slot: 'bed', name: '밤하늘 방석', price: 270, lv: 7, ramps: { bed: ['#1a1e33', '#242d4e', '#334373', '#4f669c', '#7f95c2'] } },
  // the curtains
  { id: 'curtain-mauve', slot: 'curtain', name: '모브 커튼', price: 0, lv: 1 },
  { id: 'curtain-sage', slot: 'curtain', name: '세이지 커튼', price: 170, lv: 2, ramps: { curtain: ['#232d33', '#344a44', '#4f6d5c', '#76957d', '#a8c0a3'] } },
  { id: 'curtain-cream', slot: 'curtain', name: '크림 커튼', price: 210, lv: 4, ramps: { curtain: ['#40384a', '#6c606a', '#a1928a', '#cfbfa8', '#eee2c8'] } },
  { id: 'curtain-coral', slot: 'curtain', name: '산호 커튼', price: 250, lv: 6, ramps: { curtain: ['#3a2230', '#663040', '#a04a4e', '#d0735f', '#efa585'] } },
  { id: 'curtain-navy', slot: 'curtain', name: '남색 커튼', price: 290, lv: 8, ramps: { curtain: ['#1b1f35', '#26304f', '#384b72', '#5a729a', '#8ea3c2'] } },
  // round its neck
  { id: 'collar-red', slot: 'neck', name: '빨간 방울 목걸이', price: 120, lv: 2, look: 'collar', color: 'bookRed', optional: true },
  { id: 'collar-blue', slot: 'neck', name: '파란 방울 목걸이', price: 120, lv: 2, look: 'collar', color: 'bookBlue', optional: true },
  { id: 'collar-pink', slot: 'neck', name: '분홍 방울 목걸이', price: 150, lv: 3, look: 'collar', color: 'pink', optional: true },
  { id: 'bandana-red', slot: 'neck', name: '빨간 반다나', price: 200, lv: 5, look: 'bandana', color: 'bookRed', optional: true },
  { id: 'bandana-mint', slot: 'neck', name: '초록 반다나', price: 200, lv: 6, look: 'bandana', color: 'leaf', optional: true },
  // on its head
  { id: 'bow-pink', slot: 'head', name: '분홍 리본', price: 180, lv: 3, look: 'bow', color: 'pink', optional: true },
  { id: 'flower-yellow', slot: 'head', name: '노란 꽃', price: 220, lv: 4, look: 'flower', color: 'bookMustard', optional: true },
  { id: 'beanie-blue', slot: 'head', name: '털실 모자', price: 280, lv: 6, look: 'beanie', color: 'bookBlue', optional: true },
  { id: 'crown-gold', slot: 'head', name: '황금 왕관', price: 600, lv: 10, look: 'crown', color: 'bookMustard', optional: true },
];

export const DEFAULT_WORN: Record<Slot, string | null> = { wall: 'wall-peach', rug: 'rug-indigo', bed: 'bed-teal', curtain: 'curtain-mauve', neck: null, head: null };

export const item = (id: string | null | undefined) => (id ? CATALOG.find((i) => i.id === id) : undefined);

/** the room's colours as the things on show have them: material ramps to put in */
export function themeRamps(worn: Record<Slot, string | null>) {
  const out: Partial<Record<Material, string[]>> = {};
  for (const id of Object.values(worn)) Object.assign(out, item(id)?.ramps ?? {});
  return out;
}
