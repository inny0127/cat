import { pointInPoly, dist } from '../util/math';
import type { Pt, RigData } from '../rig/rig';

export type Zone =
  | 'face' | 'chin' | 'cheek' | 'head' | 'ear' | 'neck'
  | 'back' | 'flank' | 'rump' | 'tail' | 'paw' | 'belly' | 'none';

/** How much an average cat enjoys being touched there (-1 hates .. 1 loves). */
export const ZONE_LIKE: Record<Zone, number> = {
  chin: 0.9,
  cheek: 0.85,
  head: 0.6,
  neck: 0.6,
  back: 0.35,
  rump: 0.1,
  flank: 0.15,
  ear: -0.15,
  face: -0.35,
  paw: -0.55,
  tail: -0.7,
  belly: -0.85,
  none: 0,
};

/** Fur you may rub any way round (cheeks and chin get rubbed against things on purpose). */
export const GRAIN_TOLERANT: Partial<Record<Zone, true>> = { chin: true, cheek: true };

/** How much more a cat likes being scratched there (the fingertips working at one spot) than
 *  stroked: the top of its head, the roots of its ears, its cheeks and chin, the base of its tail. */
export const SCRATCH_LIKE: Partial<Record<Zone, number>> = { head: 0.15, ear: 0.3, cheek: 0.1, chin: 0.12, neck: 0.1, rump: 0.15 };

// the tucked-in chest/belly between the front legs and the tail's hook
const BELLY: Pt[] = [[226, 352], [262, 338], [274, 356], [266, 392], [240, 398], [222, 382]];
// the wrapped tail running along the bottom of the curl
const TAIL_BAND: Pt[] = [[268, 400], [330, 404], [420, 404], [520, 392], [572, 380], [570, 440], [520, 470], [420, 478], [330, 468], [272, 440]];
const PAW_FORELEG: Pt[] = [[56, 352], [118, 350], [168, 372], [214, 376], [216, 398], [150, 396], [100, 394], [58, 386]];

export function zoneAt(rig: RigData, x: number, y: number): Zone {
  const A = rig.anchors;
  if (pointInPoly(x, y, rig.polys.earL) || pointInPoly(x, y, rig.polys.earR)) return 'ear';
  if (pointInPoly(x, y, rig.polys.head)) {
    if (dist(x, y, A.eyeA.c[0], A.eyeA.c[1]) < 13 || dist(x, y, A.eyeB.c[0], A.eyeB.c[1]) < 11) return 'face';
    if (dist(x, y, A.nose[0], A.nose[1]) < 10) return 'face';
    if (y > 352 || (x > 196 && y > 334)) return 'chin';
    if (y > 312 && x < 205) return 'cheek';
    return 'head';
  }
  if (pointInPoly(x, y, PAW_FORELEG)) return 'paw';
  if (pointInPoly(x, y, rig.polys.tail) || pointInPoly(x, y, TAIL_BAND)) return 'tail';
  if (pointInPoly(x, y, BELLY)) return 'belly';
  if (x < 262 && y < 330) return 'neck';
  if (x > 490) return 'rump';
  // the top of the curl is the spine
  if (y < 250 || (x > 400 && y < 290)) return 'back';
  return 'flank';
}
