// 每个最小单元由哪些零件组成：代理几何（预览/爆炸用）+ 对应的打印文件（清单用）
import { BASE_BODY_MM, BASE_LIFT_MM, dimsOf } from './dims';
import type { OrientHint } from '../models/orient';
import type { ColorSlot, UnitSpec, Vec3 } from './types';

export type PartFile = {
  path: string; // 相对模型包内层目录的逻辑路径，由 catalog 解析成真实文件名
  qty: number;
  supports?: boolean; // 切片时需开支撑
  uncertain?: boolean; // 数量【待确认】
};

/** 一块代理几何：相对单元最小角的盒子 */
export type Block = { at: Vec3; size: Vec3; round?: boolean };

export type Part = {
  id: string;
  name: string;
  slot: ColorSlot;
  blocks: Block[];
  explode: Vec3; // 爆炸方向 × 距离（mm），t = 1 时的位移
  files: PartFile[];
  /**
   * 真实模型怎么摆：union = 用 files[0] 填满所有代理块的合并范围（默认）；
   * each = 每个代理块各放一份 files[0]（左右导轨、两个锁等）；none = 只用代理块
   */
  real?: 'union' | 'each' | 'none';
  /** 真实模型的朝向修正（对照官网图和爆炸图标定） */
  orient?: OrientHint;
  /** 固定颜色（不参与配色），如 TPU 轮胎 */
  fixedColor?: string;
};

const D_FAM = { S: '01. S Families', M: '02. M Families', L: '03. L Families', XL: '05. XL Families' };
const S_FAM = { S: '01. S Families', M: '02. M Families', L: '03. L Families', XL: '04. XL Families' };
const DU = '01. DRAWERS/07. Universal';
const SU = '02. SUSTAINERS/05. Universal';
const ROOF_FILE = { grid: 'Grid', table: 'Table', bowl: 'Bowl', underTable: 'Under Table Mount', heavyweight: 'Heawyweight' };
const INTERIOR_FILE = { flat: 'Flat', dividers: 'Dividers', sealed: 'Sealed' };

const T = 4; // 代理模型壁厚

/** 开口朝前的外壳（底、顶、左、右、后） */
function shell(w: number, h: number, d: number, openTop = false): Block[] {
  const b: Block[] = [
    { at: [0, 0, 0], size: [w, T, d] },
    { at: [0, 0, 0], size: [T, h, d] },
    { at: [w - T, 0, 0], size: [T, h, d] },
    { at: [0, 0, 0], size: [w, h, T] },
  ];
  if (!openTop) b.push({ at: [0, h - T, 0], size: [w, T, d] });
  return b;
}

/** 开口朝上的托盘 */
function tray(x: number, y: number, z: number, w: number, h: number, d: number): Block[] {
  const t = 2.5;
  return [
    { at: [x, y, z], size: [w, t, d] },
    { at: [x, y, z], size: [t, h, d] },
    { at: [x + w - t, y, z], size: [t, h, d] },
    { at: [x, y, z], size: [w, h, t] },
    { at: [x, y, z + d - t], size: [w, h, t] },
  ];
}

function drawerParts(spec: Extract<UnitSpec, { type: 'drawer' }>): Part[] {
  const { w, h, d } = dimsOf(spec);
  const { width: W, depth: D, height: H } = spec;
  const code = `${W}${D}`;
  const dir = `01. DRAWERS/${D_FAM[W]}/${code}`;
  const split = W === 'XL' && D >= 6;
  const runner = W === 'XL' ? `XL${D}` : `x${D}`;
  const boxH = h - 2 * T - 6;
  const boxZ = T + 3;
  const boxD = d - boxZ - 12;
  const pull = d * 0.85;
  const band = h - 57 / 2; // 最上面 1F 高度带的中线：锁孔和标签都在这里

  const parts: Part[] = [
    {
      id: 'module', name: `${code} ${H}F 模组`, slot: '结构', blocks: shell(w, h, d), explode: [0, 0, 0],
      files: [{ path: `${dir}/Modules/${code} Module ${H}F.stl`, qty: 1 }],
    },
    {
      id: 'box', name: `${code} ${H}F 盒体`, slot: '盒体', real: split ? 'none' : 'union', blocks: tray(T + 4, T + 2, boxZ, w - 2 * T - 8, boxH, boxD),
      explode: [0, 0, pull],
      files: split
        ? [{ path: `${dir}/Boxes/${code} Box 1F Part 1.stl`, qty: 1 }, { path: `${dir}/Boxes/${code} Box 1F Part 2.stl`, qty: 1 }]
        : [
            { path: `${dir}/Boxes/${code} Box ${H}F.stl`, qty: 1 },
            ...(W === 'XL' ? [{ path: `${dir}/Boxes/${code} Back Panel.stl`, qty: 1, uncertain: true }] : []),
          ],
    },
    {
      id: 'facade', name: `${W} ${H}F 面板`, slot: '面板', blocks: [{ at: [2, 2, d - 12], size: [w - 4, h - 4, 10], round: true }],
      explode: [0, 0, pull + 70],
      files: [
        W === 'XL'
          ? { path: `01. DRAWERS/${D_FAM.XL}/XL Facade 1F.stl`, qty: 1, supports: true }
          : { path: `01. DRAWERS/${D_FAM[W]}/Facades/${W}${H}F (Turn On Supports).stl`, qty: 1, supports: true },
        { path: `${DU}/Facade Cap.stl`, qty: 1, uncertain: true },
      ],
    },
    {
      id: 'key', name: '钥匙锁 + 钥匙帽', slot: '功能件', blocks: [{ at: [w / 2 - 22, band - 18, d - 14], size: [45, 36.5, 33.4], round: true }],
      explode: [0, 0, pull + 150],
      files: [{ path: `${DU}/Key (Turn On Supports).stl`, qty: 1, supports: true }, { path: `${DU}/Key Cap.stl`, qty: 1 }],
    },
    {
      id: 'springs', name: '弹簧', slot: '功能件', real: 'none', // 藏在面板背后，预览不显示真实模型
      blocks: [{ at: [w / 2 - 50, band - 10, d - 22], size: [18, 20, 8] }, { at: [w / 2 + 32, band - 10, d - 22], size: [18, 20, 8] }],
      explode: [0, 40, pull + 30],
      files: [{ path: `${DU}/Springs.stl`, qty: 1, uncertain: true }],
    },
    {
      id: 'label', name: '标签', slot: '标签', blocks: [{ at: [14, band - 10, d - 1], size: [47.9, 20.6, 2] }],
      explode: [0, 30, pull + 110],
      files: [{ path: `${DU}/Label.stl`, qty: 1 }],
    },
    {
      id: 'runners', real: 'each', name: '导轨导槽 / 滑块 / 限位块', slot: '功能件',
      blocks: [{ at: [T, T + 1, 12], size: [9.4, 55.7 - 4, d - 30] }, { at: [w - T - 9.4, T + 1, 12], size: [9.4, 55.7 - 4, d - 30] }],
      explode: [0, 0, pull * 0.5],
      files: [
        { path: `${DU}/Runners/${runner} Runner Guides.stl`, qty: 2, uncertain: true },
        { path: `${DU}/Runners/${runner} Runner Slides.stl`, qty: 2, uncertain: true },
        { path: `${DU}/Runners/Runner Stopper.stl`, qty: 1, uncertain: true },
      ],
    },
    {
      id: 'latch', name: '卡扣', slot: '功能件', blocks: [{ at: [w / 2 - 48.3, 0.5, d - 86], size: [96.6, 4.5, 74.6] }], // 嵌在模组底部
      explode: [0, -60, 0],
      files: [{ path: `${DU}/Latch.stl`, qty: 1, uncertain: true }],
    },
  ];
  if (spec.interior === 'baseplate') {
    parts.push({
      id: 'baseplate', name: `${code} Gridfinity 底板`, slot: '内衬', real: split ? 'none' : 'union',
      blocks: [{ at: [T + 8, T + 5, boxZ + 4], size: [w - 2 * T - 16, 4, boxD - 8] }],
      explode: [0, h * 0.8 + 40, pull],
      files: split
        ? [{ path: `${dir}/Gridfinity Baseplate/${code} Baseplate Part 1.stl`, qty: 1 }, { path: `${dir}/Gridfinity Baseplate/${code} Baseplate Part 2.stl`, qty: 1 }]
        : [{ path: `${dir}/Gridfinity Baseplate/${code} Baseplate.stl`, qty: 1 }],
    });
  }
  return parts;
}

function sustainerParts(spec: Extract<UnitSpec, { type: 'sustainer' }>): Part[] {
  const { w, h, d } = dimsOf(spec);
  const { width: W, depth: D, height: H } = spec;
  const code = `${W}${D}`;
  const dir = `02. SUSTAINERS/${S_FAM[W]}/${code}`;
  const wide = W === 'L' || W === 'XL';
  const lid = 10;
  const bodyH = h - lid;
  const locks = wide ? 2 : 1;
  const hf = H === 1 ? '1F' : '2-4F';

  const moduleFile = wide ? `${code} ${H}F ${INTERIOR_FILE[spec.interior]} Module.stl` : `${code} ${H}F Module.stl`;
  const roofFile = D >= 6 ? `${code} Roof Whole.stl` : `${code} Roof.stl`;
  const facadeFile = W === 'XL' ? `02. SUSTAINERS/${S_FAM.XL}/XL1F Facade.stl` : `02. SUSTAINERS/${S_FAM[W]}/Facades/${W}${H}F Facade.stl`;
  const hinge = wide
    ? [H === 1 ? `${SU}/Hinges/L-XL 1F Hinge.stl` : `${SU}/Hinges/L 2-4F Hinge.stl`, `${SU}/Hinges/L-XL Hinge Top.stl`]
    : [`${SU}/Hinges/S-M ${hf} Hinge.stl`, `${SU}/Hinges/${W} Hinge Top.stl`];

  const lockBlocks: Block[] = (wide ? [w * 0.25, w * 0.75] : [w / 2]).map((cx) => ({ at: [cx - 16, bodyH - 34, d], size: [32, 28, 10], round: true }));

  const parts: Part[] = [
    {
      id: 'module', name: `${code} ${H}F 收纳箱模组`, slot: '结构', blocks: shell(w, bodyH, d, true), explode: [0, 0, 0],
      orient: { post: [0, 0, 180] }, // 导出时开口朝下，翻过来
      files: [{ path: `${dir}/Modules/${moduleFile}`, qty: 1 }],
    },
    {
      id: 'roof', name: `${code} 箱盖`, slot: '结构', blocks: [{ at: [0, bodyH, 0], size: [w, lid, d], round: true }],
      explode: [0, 110, -30],
      files: [{ path: `${dir}/Roofs/${roofFile}`, qty: 1 }],
    },
    {
      id: 'facade', name: `${W} ${H}F 面板`, slot: '面板', blocks: [{ at: [2, 2, d - 2], size: [w - 4, bodyH - 4, 6], round: true }],
      explode: [0, 0, 80],
      files: [{ path: facadeFile, qty: 1 }],
    },
    {
      id: 'locks', real: 'each', name: `锁 ×${locks}`, slot: '功能件', blocks: lockBlocks, explode: [0, 0, 150],
      files: [
        // 外露的是锁外件，放第一个用于 3D 显示
        { path: `${SU}/Locks/LOCK OUTER PART ${hf}.stl`, qty: locks, uncertain: true },
        { path: `${SU}/Locks/LOCK HOLDER.stl`, qty: locks, uncertain: true },
        { path: `${SU}/Locks/LOCK INNER PART.stl`, qty: locks, uncertain: true },
        { path: `${SU}/Locks/1 SET OF PINS FOR 1 LOCK.stl`, qty: locks, uncertain: true },
      ],
    },
    {
      id: 'hinges', real: 'each', name: '铰链 + 连杆', slot: '功能件',
      blocks: [w * 0.25, w * 0.75].map((cx) => ({ at: [cx - 18, bodyH - 30, -8], size: [36, 40, 8] }) as Block),
      explode: [0, 60, -80],
      files: [
        { path: hinge[0], qty: 2, uncertain: true },
        { path: hinge[1], qty: 2, uncertain: true },
        { path: `${SU}/Rods/${wide ? 'L-XL' : 'S-M'} Rods.stl`, qty: 1, uncertain: true },
      ],
    },
    {
      id: 'label', name: '收纳箱标签', slot: '标签', blocks: [{ at: [w / 2 - 22, 10, d + 4], size: [44, 12, 2] }],
      explode: [0, -20, 130],
      files: [{ path: `${SU}/Label for Sustainers.stl`, qty: 1 }],
    },
  ];
  if (spec.interior === 'dividers' && wide) {
    const xs = [w / 3, (2 * w) / 3];
    parts.push({
      id: 'dividers', real: 'none', name: '分隔片', slot: '内衬',
      blocks: [...xs.map((x) => ({ at: [x, T, T], size: [2.5, bodyH - T - 6, d - 2 * T] }) as Block), { at: [T, T, d / 2], size: [w - 2 * T, bodyH - T - 6, 2.5] }],
      explode: [0, h + 80, 0],
      files:
        W === 'L'
          ? [{ path: `${SU}/Dividers/L Depth Dividers/L${D}-${H}F Depth Divider.stl`, qty: 2, uncertain: true }, { path: `${SU}/Dividers/L Width Dividers/L-${H}F Width Divider.stl`, qty: 1, uncertain: true }]
          : [{ path: `${SU}/Dividers/XL Depth Dividers/XL${D} Depth Divider.stl`, qty: 2, uncertain: true }, { path: `${SU}/Dividers/XL Width Divider.stl`, qty: 1, uncertain: true }],
    });
  }
  if (spec.interior === 'sealed' && wide) {
    parts.push({
      id: 'seals', real: 'none', name: '密封分隔片', slot: '内衬',
      blocks: [{ at: [w / 2, T, T], size: [2.5, bodyH - T - 6, d - 2 * T] }],
      explode: [0, h + 80, 0],
      files:
        W === 'L'
          ? [{ path: `${SU}/Dividers/L Seal Dividers/L-${H}F Seal Divider.stl`, qty: 3, uncertain: true }]
          : [{ path: `${SU}/Dividers/XL Seal Divider (Center).stl`, qty: 1, uncertain: true }, { path: `${SU}/Dividers/XL Seal Divider (Sides).stl`, qty: 2, uncertain: true }],
    });
  }
  return parts;
}

function roofParts(spec: Extract<UnitSpec, { type: 'roof' }>): Part[] {
  const { w, h, d } = dimsOf(spec);
  const code = `${spec.width}${spec.depth}`;
  const parts: Part[] = [
    {
      id: 'roof', name: `${code} 顶盖`, slot: '结构', blocks: [{ at: [0, 0, 0], size: [w, h, d], round: true }], explode: [0, 0, 0],
      files: [{ path: `01. DRAWERS/${D_FAM[spec.width]}/${code}/Roofs/${code} ${ROOF_FILE[spec.roof]} Roof.stl`, qty: 1 }],
    },
  ];
  if (spec.roof === 'heavyweight') {
    parts.push({
      id: 'handle', name: '加重型顶盖提手 + 嵌件', slot: '功能件', blocks: [{ at: [w / 2 - 60, h, d / 2 - 15], size: [120, 30, 30], round: true }],
      explode: [0, 80, 0],
      files: [{ path: `${DU}/Heawyweight Roof Handle.stl`, qty: 1 }, { path: `${DU}/Heawyweight Roof Insert.stl`, qty: 1, uncertain: true }],
    });
  }
  return parts;
}

const MOD = '03. MODIFICATIONS';
/** M16 螺纹杆长度（说明书第 19 页） */
const ROD_MM = { S: 248, M: 338, L: 414, XL: 504 };

function baseParts(spec: Extract<UnitSpec, { type: 'base' }>): Part[] {
  const { w, d } = dimsOf(spec);
  const { width: W, depth: D } = spec;
  const code = `${W}${D}`;
  const lift = BASE_LIFT_MM;
  const parts: Part[] = [
    {
      id: 'base', name: `${code} 底座`, slot: '结构', blocks: [{ at: [0, lift, -5], size: [w, BASE_BODY_MM, d + 10] }], explode: [0, 90, 0],
      files: [{ path: `${MOD}/Base/${W}/${code} ${D >= 6 ? 'Base Whole' : 'Base'}.stl`, qty: 1 }],
    },
    {
      // 前支脚（推车模式）或前后各一（支脚模式）
      id: 'feet', name: `${W} 支脚`, slot: '功能件', real: 'each',
      blocks: (spec.mode === 'wheels' ? [d - 75] : [15, d - 75]).map((z) => ({ at: [10, 0, z], size: [w - 20, lift + 12, 60.5] }) as Block),
      explode: [0, -50, 0],
      files: [{ path: `${MOD}/Feet/${W} Feet.stl`, qty: spec.mode === 'wheels' ? 1 : 2 }],
    },
  ];
  if (spec.mode === 'wheels')
    parts.push({
      id: 'wheels', name: '轮子 ×2（TPU 轮胎）', slot: '功能件', real: 'each', fixedColor: '10101',
      blocks: [-42, w + 1.4].map((x) => ({ at: [x, 0, 0], size: [40.6, 160, 160] }) as Block),
      explode: [0, 0, -90],
      files: [
        { path: `${MOD}/Wheels/Tyre (TPU).stl`, qty: 2 },
        { path: `${MOD}/Wheels/Disk.stl`, qty: 4, uncertain: true },
        { path: `${MOD}/Wheels/Cover.stl`, qty: 2, uncertain: true },
        { path: `${MOD}/Wheels/Bushing.stl`, qty: 2, uncertain: true },
      ],
    });
  return parts;
}

export function partsOf(spec: UnitSpec): Part[] {
  if (spec.type === 'base') return baseParts(spec);
  if (spec.type === 'drawer') return drawerParts(spec);
  if (spec.type === 'sustainer') return sustainerParts(spec);
  return roofParts(spec);
}

/** 五金件（说明书第 3、17、18 页） */
export function hardwareOf(spec: UnitSpec): Record<string, number> {
  if (spec.type === 'drawer') return { 'M4×14mm 螺栓': spec.height === 1 ? 4 : 6 };
  if (spec.type === 'sustainer') return { 'M4×14mm 螺栓': 16, 'M4×10mm 螺栓': 8, 'M4×20mm 螺栓': 7 };
  if (spec.type === 'base') {
    const feet = spec.mode === 'wheels' ? 1 : 2;
    const hw: Record<string, number> = { 'M6×90mm 螺栓': 2 * feet };
    if (spec.mode === 'wheels')
      Object.assign(hw, {
        [`M16 螺纹杆 ${ROD_MM[spec.width]}mm`]: 1,
        'M4×25mm 螺栓': 12,
        '6205ZZ 轴承': 2,
        'SCSAW 限位垫片': 2,
      });
    return hw;
  }
  return {};
}
