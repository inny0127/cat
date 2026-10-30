import { CATALOG, type Item } from '../game/shop';

/** what the cat can be dressed in: its coat, and something round its neck and on its head */
export interface Coat { id: string; coat: 'ginger' | 'cream' | 'silver' | 'smoke'; name: string; price: number }

export const COATS: Coat[] = [
  { id: 'coat-ginger', coat: 'ginger', name: '치즈 태비', price: 0 },
  { id: 'coat-cream', coat: 'cream', name: '크림', price: 300 },
  { id: 'coat-silver', coat: 'silver', name: '은빛 태비', price: 500 },
  { id: 'coat-smoke', coat: 'smoke', name: '스모크', price: 800 },
];

/** the accessories (the window cat's shop's own) */
export const WEAR: Item[] = CATALOG.filter((it) => it.slot === 'neck' || it.slot === 'head');

/** what is kept of the wardrobe: what is owned, and worn */
export interface Wardrobe { owned: string[]; coat: string; neck: string | null; head: string | null }

/** what a thing in the wardrobe costs (unknown: never to be had) */
export function priceOf(id: string) {
  return COATS.find((c) => c.id === id)?.price ?? WEAR.find((w) => w.id === id)?.price ?? Infinity;
}

/**
 * A thing chosen in the wardrobe: put on if owned (or taken off, an accessory already on), else
 * bought if the coins run to it and put on. What came of it: 'wear', 'off', 'bought' or 'poor'.
 */
export function choose(w: Wardrobe & { coins: number }, id: string): 'wear' | 'off' | 'bought' | 'poor' {
  const coat = COATS.find((c) => c.id === id), item = WEAR.find((it) => it.id === id);
  if (!coat && !item) return 'poor';
  let got: 'wear' | 'bought' = 'wear';
  if (!w.owned.includes(id) && priceOf(id) > 0) {
    const p = priceOf(id);
    if (w.coins < p) return 'poor';
    w.coins -= p;
    w.owned.push(id);
    got = 'bought';
  }
  if (coat) { w.coat = id; return got; }
  const slot = item!.slot as 'neck' | 'head';
  if (got === 'wear' && w[slot] === id) { w[slot] = null; return 'off'; }
  w[slot] = id;
  return got;
}
