// 本工具实际会用到的模型文件：所有合法规格 × 所有内部选项的零件文件并集。
// 导入核对按这份清单数「缺少」，模型包里本工具用不到的文件（各批次包里的多余 / 旧文件）不算缺少。
import { catalogPaths, normPath } from './catalog';
import { DEPTHS, heightsFor, ROOF_TYPES, WIDTHS } from './dims';
import { partsOf } from './parts';
import type { UnitSpec } from './types';

function allSpecs(): UnitSpec[] {
  const out: UnitSpec[] = [];
  for (const width of WIDTHS) for (const depth of DEPTHS) {
    for (const height of heightsFor(width)) {
      for (const interior of ['empty', 'baseplate'] as const) for (const gearedRails of [true, false]) out.push({ type: 'drawer', width, depth, height, interior, gearedRails });
      for (const interior of ['flat', 'dividers', 'sealed'] as const) out.push({ type: 'sustainer', width, depth, height, interior });
    }
    for (const roof of ROOF_TYPES) if (roof !== 'heavyweight' || width === 'L' || width === 'XL') out.push({ type: 'roof', width, depth, roof });
    for (const mode of ['feet', 'wheels'] as const) out.push({ type: 'base', width, depth, mode });
  }
  return out;
}

let cached: string[] | undefined;
/** 目录里本工具会用到的文件（规范化路径，按目录顺序） */
export function requiredPaths() {
  if (cached) return cached;
  const used = new Set<string>();
  for (const spec of allSpecs()) for (const part of partsOf(spec)) for (const f of part.files) used.add(normPath(f.path));
  return (cached = catalogPaths.filter((p) => used.has(p)));
}
