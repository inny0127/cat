import type { Save } from './game';

/** a paw's colours: the fur up the leg, its tabby rings (none: a plain coat), the sock */
export interface PawColours { fur: number; stripe: number | null; sock: number }

/**
 * Coats for your own forelegs (in first person, the paws are all of you there is to see): a
 * ginger tabby to begin with, the rest earned with stars, all the nights' together. A calico is
 * a different colour each side.
 */
export interface Coat { id: string; name: string; stars: number; left: PawColours; right?: PawColours; bean: number }

export const COATS: Coat[] = [
  { id: 'ginger', name: '치즈 태비', stars: 0, left: { fur: 0xe0913f, stripe: 0xb8662a, sock: 0xfaf3ea }, bean: 0xf2a0aa },
  { id: 'black', name: '까망이', stars: 3, left: { fur: 0x2c2832, stripe: null, sock: 0x2c2832 }, bean: 0x6a4a52 },
  { id: 'grey', name: '고등어', stars: 6, left: { fur: 0x8a8f98, stripe: 0x4c505a, sock: 0xf2f0ec }, bean: 0xe8a0a8 },
  { id: 'tuxedo', name: '턱시도', stars: 9, left: { fur: 0x26232b, stripe: null, sock: 0xf8f6f2 }, bean: 0xf2a0aa },
  { id: 'calico', name: '삼색이', stars: 12, left: { fur: 0xe0913f, stripe: null, sock: 0xfaf3ea }, right: { fur: 0x2e2a30, stripe: null, sock: 0xfaf3ea }, bean: 0xf2a0aa },
  { id: 'siamese', name: '샴', stars: 15, left: { fur: 0xe9dcc6, stripe: null, sock: 0x5a4038 }, bean: 0x4a3436 },
  { id: 'white', name: '하양이', stars: 18, left: { fur: 0xf6f2ea, stripe: null, sock: 0xf6f2ea }, bean: 0xf4a8b4 },
];

/** every star won, all the nights' together */
export const allStars = (s: Save) => Object.values(s.stars).reduce((a, b) => a + b, 0);
export const coatOpen = (s: Save, c: Coat) => allStars(s) >= c.stars;
/** the coat worn (the first, if what is kept is gone or not yet earned) */
export const coatOf = (s: Save) => {
  const c = COATS.find((k) => k.id === s.coat);
  return c && coatOpen(s, c) ? c : COATS[0];
};
