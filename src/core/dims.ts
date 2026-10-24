import type { Depth, Height, UnitSpec, Width } from './types';

// 实测自模型包 STL 包围盒：S 164.8 / M 253.9，L = S+S，XL = S+M
export const WIDTH_MM: Record<Width, number> = { S: 164.8, M: 253.9, L: 329.6, XL: 418.7 };
export const depthMM = (d: Depth) => 42 * d + 20.1; // x3 = 146.1，x7 = 314.1
export const heightMM = (h: Height) => 9 + 48 * h; // 1F 57 / 2F 105 / 4F 201
export const ROOF_MM = 14;
/** 模组顶部的嵌套凸台：叠放时嵌进上一层，所以叠放节距是 48 mm/F，2 个 1F 正好等于 1 个 2F */
export const NEST_MM = 9;
/** 底座底面离地 60mm；Ø160 后轮轴孔在底面上方 20mm，轮心高 80mm。 */
export const BASE_BODY_MM = 52.2;
export const BASE_LIFT_MM = 60;

export const WIDTHS: Width[] = ['S', 'M', 'L', 'XL'];
export const DEPTHS: Depth[] = [3, 4, 5, 6, 7];
export const HEIGHTS: Height[] = [1, 2, 4];

/** XL 只有 1F */
export const heightsFor = (w: Width): Height[] => (w === 'XL' ? [1] : HEIGHTS);

export function dimsOf(spec: UnitSpec) {
  const w = WIDTH_MM[spec.width];
  const d = depthMM(spec.depth);
  const h = spec.type === 'roof' ? ROOF_MM : spec.type === 'base' ? BASE_LIFT_MM + BASE_BODY_MM : heightMM(spec.height);
  return { w, h, d };
}

const ROOF_NAMES = { grid: '栅格顶盖', table: '桌面顶盖', bowl: '碗形顶盖', underTable: '桌下安装顶盖', heavyweight: '加重型顶盖' };
const SUS_NAMES = { flat: '平板', dividers: '分隔', sealed: '密封' };

export function specName(spec: UnitSpec) {
  const code = `${spec.width}${spec.depth}`;
  if (spec.type === 'roof') return `${code} · ${ROOF_NAMES[spec.roof]}`;
  if (spec.type === 'base') return `${code} · ${spec.mode === 'wheels' ? '推车底座' : '支脚底座'}`;
  if (spec.type === 'drawer') return `${code} · ${spec.height}F 抽屉`;
  const interior = spec.width === 'L' || spec.width === 'XL' ? SUS_NAMES[spec.interior] : '';
  return `${code} · ${spec.height}F ${interior}收纳箱`;
}

export const ROOF_TYPES = Object.keys(ROOF_NAMES) as (keyof typeof ROOF_NAMES)[];
export const roofName = (r: keyof typeof ROOF_NAMES) => ROOF_NAMES[r];
export const susInteriorName = (i: keyof typeof SUS_NAMES) => SUS_NAMES[i];
