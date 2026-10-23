import type { BomRow } from '../core/bom';
import { partsOf } from '../core/parts';
import type { Placement } from '../core/types';
import { partInstances } from '../scene/part-instances';

/** 场景选中的是单个实物，打印清单按父零件的文件与颜色合并。 */
export function bomFocus(placements: Placement[], rows: BomRow[], unitId: string | null, focus: string | null) {
  const unit = placements.find((p) => p.id === unitId);
  if (!unit || !focus) return null;
  const part = partsOf(unit.spec).find((p) => p.id === focus.split('::')[0]);
  if (!part) return null;
  const instances = partInstances(part);
  const instance = instances.find((p) => p.id === focus);
  if (!instance && focus !== part.id) return null;
  return {
    name: instance?.name ?? part.name,
    rows: rows.filter((r) => r.targets.some((t) => t.unitId === unit.id && t.partId === part.id)),
  };
}
