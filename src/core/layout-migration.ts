import { BASE_LIFT_MM } from './dims';
import { columnOf } from './rules';
import type { Placement } from './types';

/** 旧版把轮心高度 80mm 当成底座离地高度；只平移原先承托在底座上的单元。 */
export function migrateBaseHeight(placements: Placement[]): Placement[] {
  const delta = 80 - BASE_LIFT_MM;
  const old = placements.map((p) => p.spec.type === 'base' ? { ...p, pos: [p.pos[0], p.pos[1] + delta, p.pos[2]] as Placement['pos'] } : p);
  const move = new Set<string>();
  for (const p of old) if (p.spec.type === 'base') {
    for (const id of columnOf(p.id, old).ids) if (id !== p.id) move.add(id);
  }
  return placements.map((p) => move.has(p.id) ? { ...p, pos: [p.pos[0], p.pos[1] - delta, p.pos[2]] } : p);
}
