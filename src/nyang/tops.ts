/** a flat top the cat can be on: the floor's own furniture's tops, and how high */
export interface Top {
  id: string;
  x0: number; x1: number; z0: number; z1: number;
  h: number;
}

/** where the back wall is, and the window in it */
export const WALL_Z = -0.6;
export const WIN = { l: 0.15, r: 0.85, b: 0.62, t: 1.42 };

/** the living room's tops: the dresser and the shelf over it, the sofa's seat and back, the coffee
 *  table, the window sill, the stool and the dining table */
export const TOPS: readonly Top[] = [
  { id: 'dresser', x0: -1.6, x1: -0.98, z0: -0.6, z1: -0.25, h: 0.55 },
  { id: 'shelf', x0: -1.55, x1: -1.02, z0: -0.6, z1: -0.43, h: 1.0 },
  { id: 'sofa', x0: -0.8, x1: -0.06, z0: -0.44, z1: -0.12, h: 0.34 },
  { id: 'sofaBack', x0: -0.86, x1: 0.0, z0: -0.6, z1: -0.47, h: 0.62 },
  { id: 'coffee', x0: -0.64, x1: -0.16, z0: 0.12, z1: 0.4, h: 0.3 },
  { id: 'sill', x0: WIN.l - 0.04, x1: WIN.r + 0.04, z0: -0.6, z1: -0.42, h: WIN.b },
  { id: 'stool', x0: 1.12, x1: 1.38, z0: 0.12, z1: 0.38, h: 0.42 },
  { id: 'table', x0: 0.98, x1: 1.62, z0: -0.56, z1: 0.0, h: 0.66 },
];
