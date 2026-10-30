/** what the coins buy besides clothes: the cat made better at it, a step at a time */
export interface Upgrade { id: 'paw' | 'legs' | 'focus' | 'nose'; name: string; what: (lv: number) => string; costs: number[] }

export const UPGRADES: Upgrade[] = [
  { id: 'paw', name: '냥냥펀치', what: (lv) => `한 대에 ${Math.round(100 + 15 * lv)}% 세게`, costs: [100, 250, 500, 900] },
  { id: 'legs', name: '뒷다리', what: (lv) => `${Math.round(100 + 8 * lv)}% 빠르게`, costs: [120, 300, 600, 1000] },
  { id: 'focus', name: '집중력', what: (lv) => `콤보가 ${(3.2 + 0.4 * lv).toFixed(1)}초 이어져요`, costs: [150, 350, 700, 1100] },
  { id: 'nose', name: '캣닢 코', what: (lv) => `캣닢 타임 ${8 + 2 * lv}초`, costs: [100, 250, 500, 800] },
];

/** how far an upgrade has been taken (0: not at all) */
export const upLevel = (up: Record<string, number> | undefined, id: Upgrade['id']) => Math.max(0, Math.min(4, up?.[id] ?? 0));

/** the next step of an upgrade bought, if the coins run to it: 'bought', 'poor', or 'max' */
export function buyUp(s: { coins: number; up: Record<string, number> }, id: Upgrade['id']): 'bought' | 'poor' | 'max' {
  const U = UPGRADES.find((u) => u.id === id);
  if (!U) return 'poor';
  const lv = upLevel(s.up, id);
  if (lv >= U.costs.length) return 'max';
  if (s.coins < U.costs[lv]) return 'poor';
  s.coins -= U.costs[lv];
  s.up[id] = lv + 1;
  return 'bought';
}
