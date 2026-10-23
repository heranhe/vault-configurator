// 示例方案：一键载入，演示叠放规则（L = S+S、XL = S+M、2×1F = 2F）
import { BASE_BODY_MM, BASE_LIFT_MM, NEST_MM, WIDTH_MM } from '../core/dims';
import type { Placement, UnitSpec, Width } from '../core/types';

const F = 48; // 叠放节距
const S = WIDTH_MM.S;
const BASE_TOP = BASE_LIFT_MM + BASE_BODY_MM - NEST_MM;
const drawer = (width: Width, depth: 4 | 5, height: 1 | 2 | 4): UnitSpec => ({ type: 'drawer', width, depth, height, interior: 'empty' });

let n = 0;
const at = (spec: UnitSpec, x: number, y: number): Placement => ({ id: `ex${++n}`, spec, pos: [x, y, -100] });

export type Example = { id: string; name: string; desc: string; build: () => Placement[] };

export const EXAMPLES: Example[] = [
  {
    id: 'portable',
    name: '官网同款便携箱',
    desc: 'L5 收纳箱打底，两个 1F + 一个 2F 并排，顶上宽抽屉和加重型顶盖',
    build: () => [
      at({ type: 'sustainer', width: 'L', depth: 5, height: 2, interior: 'dividers' }, 0, 0),
      at(drawer('S', 5, 1), 0, 2 * F),
      at(drawer('S', 5, 1), 0, 3 * F),
      at(drawer('S', 5, 2), S, 2 * F),
      at(drawer('L', 5, 1), 0, 4 * F),
      at({ type: 'roof', width: 'L', depth: 5, roof: 'heavyweight' }, 0, 5 * F),
    ],
  },
  {
    id: 'cart',
    name: '移动工具推车',
    desc: '说明书里的推车：带轮底座，底座上和顶盖下都用 2F，中间 S/L 混搭',
    build: () => {
      const y0 = BASE_TOP;
      return [
        at({ type: 'base', width: 'L', depth: 5, mode: 'wheels' }, 0, 0),
        at(drawer('L', 5, 2), 0, y0),
        at(drawer('S', 5, 1), 0, y0 + 2 * F),
        at(drawer('S', 5, 1), 0, y0 + 3 * F),
        at(drawer('S', 5, 2), S, y0 + 2 * F),
        at({ type: 'sustainer', width: 'L', depth: 5, height: 1, interior: 'sealed' }, 0, y0 + 4 * F),
        at(drawer('L', 5, 2), 0, y0 + 5 * F),
        at({ type: 'roof', width: 'L', depth: 5, roof: 'heavyweight' }, 0, y0 + 7 * F),
      ];
    },
  },
  {
    id: 'desk-tower',
    name: '桌面小抽屉塔',
    desc: 'S4 一列：2F + 三个 1F，栅格顶盖可以继续放 Gridfinity 小盒',
    build: () => [
      at(drawer('S', 4, 2), 0, 0),
      at(drawer('S', 4, 1), 0, 2 * F),
      at(drawer('S', 4, 1), 0, 3 * F),
      at(drawer('S', 4, 1), 0, 4 * F),
      at({ type: 'roof', width: 'S', depth: 4, roof: 'grid' }, 0, 5 * F),
    ],
  },
  {
    id: 'workbench',
    name: '工作台组合',
    desc: 'M5 4F 和两层 S5 2F 并排，上面一个 XL 抽屉把两列连成一体',
    build: () => [
      at(drawer('M', 5, 4), 0, 0),
      at(drawer('S', 5, 2), WIDTH_MM.M, 0),
      at(drawer('S', 5, 2), WIDTH_MM.M, 2 * F),
      at(drawer('XL', 5, 1), 0, 4 * F),
      at({ type: 'roof', width: 'XL', depth: 5, roof: 'table' }, 0, 5 * F),
    ],
  },
];
