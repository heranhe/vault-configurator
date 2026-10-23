// 05_Mounting Instructions.pdf 第 10–12 页：桌下固定顶盖。
// 20 款 STL 的横截面实测孔数见 docs/audit-05-mounting.md；不把 S3 图示的 7 孔套到全部尺寸。
import { depthMM, WIDTH_MM } from './dims';
import type { UnitSpec } from './types';

export const UNDER_TABLE_SCREW = '桌下固定螺钉（规格按桌板选择）';
type RoofSpec = Extract<UnitSpec, { type: 'roof' }>;

/** 安装方向的固定孔中心，坐标为顶盖左后角起的 [x, z]，单位 mm。 */
export function underTableHoles(spec: RoofSpec): [number, number][] {
  if (spec.roof !== 'underTable') return [];
  const d = depthMM(spec.depth);
  // L 是两组 S；XL 是一组 M + 一组 S，均有各自中间孔。
  const panels = spec.width === 'L' ? ['S', 'S'] as const : spec.width === 'XL' ? ['M', 'S'] as const : [spec.width];
  const holes: [number, number][] = [];
  let offset = 0;
  for (const panel of panels) {
    const w = WIDTH_MM[panel];
    const zs = Array.from({ length: spec.depth }, (_, i) => d / 2 + (i - (spec.depth - 1) / 2) * 42);
    for (const x of [offset + 15.8, offset + w - 15.8])
      for (const z of zs) holes.push([x, z]);
    const middle = Math.floor((spec.depth - 1) / 2);
    for (let i = 0; i < middle; i++) holes.push([offset + w / 2, d / 2 + (i - (middle - 1) / 2) * 84]);
    offset += w;
  }
  return holes;
}

/** 完整使用顶盖预设固定孔；螺钉尺寸由桌板决定，螺纹嵌件为可选替代方案，不重复默认计入。 */
export function mountingHardwareOf(spec: UnitSpec): Record<string, number> {
  if (spec.type !== 'roof' || spec.roof !== 'underTable') return {};
  return { [UNDER_TABLE_SCREW]: underTableHoles(spec).length };
}
