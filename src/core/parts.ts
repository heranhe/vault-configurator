// 每个最小单元由哪些零件组成：代理几何（预览/爆炸用）+ 对应的打印文件（清单用）
import { BASE_BODY_MM, BASE_LIFT_MM, dimsOf, heightMM } from './dims';
import type { OrientHint } from '../models/orient';
import type { ColorSlot, UnitSpec, Vec3 } from './types';

export type PartFile = {
  path: string; // 相对模型包内层目录的逻辑路径，由 catalog 解析成真实文件名
  qty: number;
  supports?: boolean; // 切片时需开支撑
  uncertain?: boolean; // 数量【待确认】
};

/**
 * 一块代理几何：相对单元最小角的盒子。flip = 这一块的真实模型改用的翻转（度），如右侧导轨；
 * cyl = 画成沿 Z 轴（前后方向）的圆柱，直径取 size[0]，用于螺栓
 */
export type Block = { at: Vec3; size: Vec3; round?: boolean; flip?: Vec3; cyl?: boolean };

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
  /** each 时：files[0] 里已经并排放着 blocks.length 件（如左右导轨一个文件），拆开后一件对一块 */
  split?: boolean;
  /** 真实模型的朝向修正（对照官网图和爆炸图标定） */
  orient?: OrientHint;
  /** 固定颜色（不参与配色），如 TPU 轮胎 */
  fixedColor?: string;
  /** 外购五金件（螺栓等）：只画示意，不进打印清单（数量见 hardwareOf） */
  hardware?: boolean;
};

const D_FAM = { S: '01. S Families', M: '02. M Families', L: '03. L Families', XL: '05. XL Families' };
const S_FAM = { S: '01. S Families', M: '02. M Families', L: '03. L Families', XL: '04. XL Families' };
const DU = '01. DRAWERS/07. Universal';
const SU = '02. SUSTAINERS/05. Universal';
const ROOF_FILE = { grid: 'Grid', table: 'Table', bowl: 'Bowl', underTable: 'Under Table Mount', heavyweight: 'Heawyweight' };
const INTERIOR_FILE = { flat: 'Flat', dividers: 'Dividers', sealed: 'Sealed' };

const T = 4; // 代理模型壁厚

/** 螺栓（模型包里没有，按 M4 内六角画）：头部在 headZ 往前，杆身往后 len。前后方向安装 */
function bolt(x: number, y: number, headZ: number, len: number, head = 2.6): Block[] {
  return [
    { at: [x - 3.5, y - 3.5, headZ], size: [7, 7, head], cyl: true },
    { at: [x - 2, y - 2, headZ - len], size: [4, 4, len], cyl: true },
  ];
}

// 抽屉面板正面的 M4 沉孔（实测，已换成装配方向：x 距左沿，y 距面板下沿）。
// 每个孔都是 Ø4 通孔 + Ø9.8 × 4.1 沉台；第一个孔在标签槽里、被标签盖住，其余孔压面板盖（Facade Cap Ø9.8）
const DRAWER_HOLES_X = { S: [31, 133.8], M: [34.5, 75.5, 178.5, 219.5], L: [34.6, 113.4, 216.4, 295.1], XL: [39.8, 158.1, 260.8, 379.1] };
const DRAWER_HOLES_UP_X = { S: [31, 133.8], M: [34.5, 219.5], L: [34.6, 295.1], XL: [] as number[] };

/** 抽屉面板上的螺栓孔（相对面板左下角） */
export function drawerHoles(spec: Extract<UnitSpec, { type: 'drawer' }>): [number, number][] {
  const faceH = heightMM(spec.height) - 10;
  return [
    ...DRAWER_HOLES_X[spec.width].map((x) => [x, 23.5] as [number, number]),
    ...(spec.height > 1 ? DRAWER_HOLES_UP_X[spec.width].map((x) => [x, faceH - 23.5] as [number, number]) : []),
  ];
}

/** 收纳箱面板上固定到模组的 M4 通孔（实测，相对面板左下角）：两侧各一列，4F 中间多一排，L/XL 底边正中多一颗 */
function sustainerHoles(W: UnitSpec['width'], H: 1 | 2 | 4, w: number, faceH: number): [number, number][] {
  const ys = [20.8, faceH - 5.7, ...(H === 4 ? [94.8] : [])];
  const out = ys.flatMap((y) => [[5.1, y], [w - 5.1, y]] as [number, number][]);
  if (W === 'L' || W === 'XL') out.push([w / 2, 5]);
  return out;
}

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
  // 实测：模组后壁约 2.3 厚，盒体（S5 深 227.8）从后壁一直到模组前沿；面板 10 厚，整块挡在模组前面
  const boxZ = 2.3;
  const boxD = d - boxZ;
  const pull = d * 0.85;
  const faceY = 5.2; // 面板下沿 = 模组前沿口的下沿（实测 5.2～h-4.8，面板高 h-10）
  // 面板按装配方向摆好后（打印文件绕深度轴转 180°），锁孔和标签槽都在最下面 1F 高度带：
  // 锁孔中心在宽度正中、面板下沿上方 23.6；标签槽中心距面板左沿 28、同样高 23.6，槽深 2.1
  const band = faceY + 23.6;
  const guideT = W === 'XL' ? 14.6 : 9.4; // 导轨导槽厚度（实测）
  const guideL = d - 2.6;
  const holes = drawerHoles(spec);

  const parts: Part[] = [
    {
      id: 'module', name: `${code} ${H}F 模组`, slot: '结构', blocks: shell(w, h, d), explode: [0, 0, 0],
      files: [{ path: `${dir}/Modules/${code} Module ${H}F.stl`, qty: 1 }],
    },
    {
      id: 'box', name: `${code} ${H}F 盒体`, slot: '盒体', real: split ? 'none' : 'union', blocks: tray(T + 4, T + 2, boxZ, w - 2 * T - 8, boxH, boxD),
      explode: [0, 0, pull],
      orient: { post: [0, 0, 180] }, // 同收纳箱盒体：导出时开口朝下，翻过来
      files: split
        ? [{ path: `${dir}/Boxes/${code} Box 1F Part 1.stl`, qty: 1 }, { path: `${dir}/Boxes/${code} Box 1F Part 2.stl`, qty: 1 }]
        : [
            { path: `${dir}/Boxes/${code} Box ${H}F.stl`, qty: 1 },
            ...(W === 'XL' ? [{ path: `${dir}/Boxes/${code} Back Panel.stl`, qty: 1, uncertain: true }] : []),
          ],
    },
    {
      id: 'facade', name: `${W} ${H}F 面板`, slot: '面板', blocks: [{ at: [0, faceY, d], size: [w, h - 10, 10], round: true }],
      explode: [0, 0, pull + 70],
      // 打印文件里标签槽在右、锁孔带在上；装配时绕深度轴转 180°，标签到左下（对照官网图）
      orient: { post: [0, 0, 180] },
      files: [
        W === 'XL'
          ? { path: `01. DRAWERS/${D_FAM.XL}/XL Facade 1F.stl`, qty: 1, supports: true }
          : { path: `01. DRAWERS/${D_FAM[W]}/Facades/${W}${H}F (Turn On Supports).stl`, qty: 1, supports: true },
      ],
    },
    {
      // 说明书第 7 步：螺栓从正面穿过面板拧进盒体，头部落在沉台底（面板前表面往里 4.1）
      id: 'bolts', name: `M4×14 螺栓 ×${holes.length}`, slot: '功能件', hardware: true, real: 'none', fixedColor: '10101',
      blocks: holes.flatMap(([x, y]) => bolt(x, faceY + y, d + 5.9, 14)),
      explode: [0, 0, pull + 100],
      files: [],
    },
    {
      // 说明书第 8 步：标签盖住左下那颗螺栓，其余每个沉孔压一个面板盖，正面看就是官网图上的浅色小圆
      id: 'caps', real: 'each', name: `面板盖 ×${holes.length - 1}`, slot: '面板',
      blocks: holes.slice(1).map(([x, y]) => ({ at: [x - 4.9, faceY + y - 4.9, d + 10 - 3.8], size: [9.8, 9.8, 3.8] }) as Block),
      explode: [0, 0, pull + 125],
      files: [{ path: `${DU}/Facade Cap.stl`, qty: holes.length - 1 }],
    },
    {
      // 实测：钥匙前段圆台 Ø34.7、长 3.5，正好嵌进面板锁孔最前面 Ø34.2、深 4 的一段，圆台前端和面板前表面齐平，
      // 只有握把露在外面。圆台前端离钥匙后端 18.1，所以钥匙后端在面板前表面往里 18.1 = d + 10 - 18.1
      id: 'key', name: '钥匙锁 + 钥匙帽', slot: '功能件', blocks: [{ at: [w / 2 - 22.5, band - 18.25, d - 8.1], size: [45, 36.5, 33.4], round: true }],
      explode: [0, 0, pull + 150],
      files: [{ path: `${DU}/Key (Turn On Supports).stl`, qty: 1, supports: true }, { path: `${DU}/Key Cap.stl`, qty: 1 }],
    },
    {
      // 说明书第 3 步：两片弹簧平面朝后压进面板背面锁孔两侧的槽里，各自顶住钥匙后面的凸轮。
      // 实测：打印文件里并排两片，每片 47.5×37×5.2，厚的一端带销孔；面板背面槽深 5.8、外沿距中心 62.3（S/M/L 相同），
      // 所以弹簧贴槽底放：z = d+0.6～d+5.8。文件里两片的销孔都朝 +x，左边那片绕深度轴转 180° 让销孔朝外
      id: 'springs', name: '弹簧', slot: '功能件', real: 'each', split: true,
      blocks: [
        { at: [w / 2 - 62.3, band - 18.5, d + 0.6], size: [47.5, 37, 5.2], flip: [0, 0, 180] },
        { at: [w / 2 + 14.8, band - 18.5, d + 0.6], size: [47.5, 37, 5.2] },
      ],
      explode: [0, 40, pull + 30],
      files: [{ path: `${DU}/Springs.stl`, qty: 1 }],
    },
    {
      id: 'label', name: '标签', slot: '标签', blocks: [{ at: [28 - 47.9 / 2, band - 20.6 / 2, d + 10 - 2.1], size: [47.9, 20.6, 2] }],
      explode: [0, 30, pull + 110],
      files: [{ path: `${DU}/Label.stl`, qty: 1 }],
    },
    {
      // 导槽 / 滑块文件里都已并排放着左右两件（实测两件完全相同），所以各打 1 份；
      // 右侧那件绕深度轴转 180° 就是左侧的镜像（导槽上下对称）。限位块左右各一（说明书第 11 步）
      id: 'runners', real: 'each', split: true, name: '导轨导槽 / 滑块 / 限位块', slot: '功能件',
      blocks: [
        { at: [5.9, band - 13.5, boxZ], size: [guideT, 27, guideL] },
        { at: [w - 5.9 - guideT, band - 13.5, boxZ], size: [guideT, 27, guideL], flip: [0, 0, 180] },
      ],
      explode: [0, 0, pull * 0.5],
      files: [
        { path: `${DU}/Runners/${runner} Runner Guides.stl`, qty: 1 },
        { path: `${DU}/Runners/${runner} Runner Slides.stl`, qty: 1 },
        { path: `${DU}/Runners/Runner Stopper.stl`, qty: 2 },
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

  // 面板（实测高 46 / 80 / 176，厚 10）挡在模组前面，上沿与模组上沿齐，箱盖前沿再盖住它（箱盖深 d + 10）
  const faceH = { 1: 46, 2: 80, 4: 176 }[H];
  const faceTop = bodyH;
  const faceHoles = sustainerHoles(W, H, w, faceH);
  // 标签槽（转 180° 后）：1F 在上沿开口、从上往下插；2F/4F 在左侧、中心距上沿 43.6。槽深 2.1
  const labelCX = H === 1 ? { S: 29, M: 51.4, L: w / 2, XL: w / 2 }[W] : 27.8;
  const labelCY = H === 1 ? faceTop - 20.1 / 2 : faceTop - 43.6;
  const lockBlocks: Block[] = (wide ? [w * 0.25, w * 0.75] : [w / 2]).map((cx) => ({ at: [cx - 16, bodyH - 34, d + 6], size: [32, 28, 18], round: true }));

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
      id: 'facade', name: `${W} ${H}F 面板`, slot: '面板', blocks: [{ at: [0, faceTop - faceH, d], size: [w, faceH, 10], round: true }],
      explode: [0, 0, 80],
      // 同抽屉面板：打印文件绕深度轴转 180° 才是装配方向（锁槽开口朝上、贯穿孔靠近箱盖，见说明书第 5 页）
      orient: { post: [0, 0, 180] },
      files: [{ path: facadeFile, qty: 1 }],
    },
    {
      // 说明书收纳箱第 9 步：M4×20 从正面把面板拧到模组上；没有沉孔，黑色螺栓头露在外面（对照官网图）
      id: 'bolts', name: `M4×20 螺栓 ×${faceHoles.length}`, slot: '功能件', hardware: true, real: 'none', fixedColor: '10101',
      blocks: faceHoles.flatMap(([x, y]) => bolt(x, faceTop - faceH + y, d + 10, 20, 2.2)),
      explode: [0, 0, 110],
      files: [],
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
      // 下铰链文件里就是一对（两件相同），L-XL 上铰链文件也是一对；S/M 上铰链是一整件，夹在两个下铰链之间
      id: 'hinges', real: 'each', split: true, name: '铰链 + 连杆', slot: '功能件',
      blocks: [w * 0.25, w * 0.75].map((cx) => ({ at: [cx - 18, bodyH - 30, -8], size: [36, 40, 8] }) as Block),
      explode: [0, 60, -80],
      files: [
        { path: hinge[0], qty: 1 },
        { path: hinge[1], qty: 1, uncertain: !wide },
        { path: `${SU}/Rods/${wide ? 'L-XL' : 'S-M'} Rods.stl`, qty: 1 },
      ],
    },
    {
      id: 'label', name: '收纳箱标签', slot: '标签', blocks: [{ at: [labelCX - 38.1 / 2, labelCY - 20.1 / 2, d + 10 - 2.1], size: [38.1, 20.1, 2] }],
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
  // 说明书写「1F ×4、2F/4F ×6」，是按 M/L 宽度算的；按各尺寸面板上实测的沉孔数取（S 1F 只有 2 个）
  if (spec.type === 'drawer') return { 'M4×14mm 螺栓': drawerHoles(spec).length };
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
