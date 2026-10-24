// 每个最小单元由哪些零件组成：代理几何（预览/爆炸用）+ 对应的打印文件（清单用）
import { mountingHardwareOf, underTableHoles } from './mounting';
import { BASE_BODY_MM, BASE_LIFT_MM, dimsOf, heightMM } from './dims';
import type { OrientHint } from '../models/orient';
import type { ColorSlot, UnitSpec, Vec3 } from './types';

export type PartFile = {
  path: string; // 相对模型包内层目录的逻辑路径，由 catalog 解析成真实文件名
  qty: number;
  /** 一份 STL 内含的独立打印件数（qty 仍表示打印整份文件的次数）。 */
  pieces?: number;
  supports?: boolean; // 切片时需开支撑
  uncertain?: boolean; // 数量【待确认】
};

/**
 * 一块代理几何：相对单元最小角的盒子。flip = 这一块的真实模型改用的翻转（度），如右侧导轨；
 * cyl = 画成沿 Z 轴（前后方向）的圆柱，直径取 size[0]，用于螺栓
 */
export type Block = { at: Vec3; size: Vec3; round?: boolean; flip?: Vec3; cyl?: boolean; cylAxis?: 'x' | 'y' | 'z'; cylVector?: Vec3; cylRadius?: number; bore?: number; slide?: Vec3 };

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
  /** 成套摆盘的连杆、销钉逐件摆正，不能用整套文件的包围盒推断轴线。 */
  deskew?: boolean;
  /** 细长连杆以杆身圆心定位；打印用端帽的包围盒中心不在转轴上。 */
  shaft?: boolean;
  /** 真实模型的朝向修正（对照官网图和爆炸图标定） */
  orient?: OrientHint;
  /** 固定颜色（不参与配色），如 TPU 轮胎 */
  fixedColor?: string;
  /** 外购五金件（螺栓等）：只画示意，不进打印清单（数量见 hardwareOf） */
  hardware?: boolean;
  /** 一个实物由几块代理几何组成，例如一颗螺栓的头部和杆身。 */
  blocksPerPiece?: number;
  /** 可复用的打印装配工具：进打印清单，但不作为装配体零件显示。 */
  tooling?: boolean;
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

/** 斜孔内的五金杆：保留真实轴向，同时用圆柱的轴对齐范围参与取景与标注。 */
function cylinderBetween(from: Vec3, to: Vec3, radius: number): Block {
  const vector = to.map((v, k) => v - from[k]) as Vec3;
  const length = Math.hypot(...vector);
  const radial = vector.map((v) => radius * Math.sqrt(Math.max(0, 1 - (v / length) ** 2)));
  const at = from.map((v, k) => Math.min(v, to[k]) - radial[k]) as Vec3;
  const size = vector.map((v, k) => Math.abs(v) + 2 * radial[k]) as Vec3;
  return { at, size, cyl: true, cylVector: vector, cylRadius: radius };
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
  const slideL = d - 28.1;
  const railL = { S: 121.045, M: 165.624, L: 203.424, XL: 248.424 }[W];
  const holes = drawerHoles(spec);

  const parts: Part[] = [
    {
      id: 'module', name: `${code} ${H}F 模组`, slot: '结构', blocks: shell(w, h, d), explode: [0, 0, 0],
      files: [{ path: `${dir}/Modules/${code} Module ${H}F.stl`, qty: 1 }],
    },
    {
      id: 'box', name: `${code} ${H}F 盒体${split ? '前段 1/2' : ''}`, slot: '盒体',
      blocks: split
        ? [{ at: [(w - 377.674) / 2, 8.75, d - (D === 6 ? 144.028 : 165.019)], size: [377.674, 37.5, D === 6 ? 144.028 : 165.019] }]
        : tray(T + 4, T + 2, boxZ, w - 2 * T - 8, boxH, boxD),
      explode: [0, 0, pull],
      orient: { post: [0, 0, 180] }, // 同收纳箱盒体：导出时开口朝下，翻过来
      files: split
        ? [{ path: `${dir}/Boxes/${code} Box 1F Part 1.stl`, qty: 1 }]
        : [{ path: `${dir}/Boxes/${code} Box ${H}F.stl`, qty: 1 }],
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
      id: 'bolts', name: `M4×14 螺栓 ×${holes.length}`, slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
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
      id: 'key', name: '钥匙锁', slot: '功能件', blocks: [{ at: [w / 2 - 22.5, band - 18.25, d - 8.1], size: [45, 36.5, 33.4], round: true }],
      explode: [0, 0, pull + 150],
      files: [{ path: `${DU}/Key (Turn On Supports).stl`, qty: 1, supports: true }],
    },
    {
      // 说明书第 2 步：内腔沿原文件 +Z，翻向后方套住钥匙握柄，不能把开口转朝上。
      // 帽厚 11.67、底壁 2mm；内底面在 d+25.32，与握柄前端 d+25.32 贴合。
      id: 'key-cap', name: '钥匙帽', slot: '面板',
      blocks: [{ at: [w / 2 - 18.9, band - 6.585, d + 15.65], size: [37.8, 13.17, 11.67], round: true }],
      orient: { rotation: [180, 0, 0] },
      explode: [0, 0, pull + 180],
      files: [{ path: `${DU}/Key Cap.stl`, qty: 1 }],
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
      files: [{ path: `${DU}/Springs.stl`, qty: 1, pieces: 2 }],
    },
    {
      id: 'label', name: '标签', slot: '标签', blocks: [{ at: [28 - 47.9 / 2, band - 20.6 / 2, d + 10 - 2.1], size: [47.9, 20.6, 2] }],
      explode: [0, 30, pull + 110],
      files: [{ path: `${DU}/Label.stl`, qty: 1 }],
    },
    {
      // 导槽 STL 已包含左右两件，一份即可；滑块、限位块独立显示和装配。
      id: 'runners', real: 'each', split: true, name: '导轨导槽 ×2', slot: '结构',
      blocks: [
        { at: [5.9, band - 13.5, boxZ], size: [guideT, 27, guideL] },
        { at: [w - 5.9 - guideT, band - 13.5, boxZ], size: [guideT, 27, guideL], flip: [0, 0, 180] },
      ],
      explode: [0, 0, pull * 0.5],
      files: [{ path: `${DU}/Runners/${runner} Runner Guides.stl`, qty: 1, pieces: 2 }],
    },
    {
      id: 'runner-slides', real: 'each', split: true, name: '导轨滑块 ×2', slot: '功能件',
      blocks: [
        { at: [10.8, band - 9.11, d - slideL - 0.3], size: [8.98, 18.22, slideL] },
        { at: [w - 19.78, band - 9.11, d - slideL - 0.3], size: [8.98, 18.22, slideL], flip: [0, 0, 180] },
      ],
      explode: [0, 30, pull * 0.7],
      files: [{ path: `${DU}/Runners/${runner} Runner Slides.stl`, qty: 1, pieces: 2 }],
    },
    {
      // 说明书第 11 步：单件 STL，左右各打印一份，盒体完全推进后从两侧插入。
      id: 'runner-stoppers', real: 'each', name: '导轨限位块 ×2', slot: '功能件',
      blocks: [
        { at: [4, band - 4.09, d - 19], size: [7.68, 8.19, 17.84], slide: [-45, 0, 0] },
        { at: [w - 11.68, band - 4.09, d - 19], size: [7.68, 8.19, 17.84], flip: [0, 0, 180], slide: [45, 0, 0] },
      ],
      explode: [0, 0, pull * 0.5],
      files: [{ path: `${DU}/Runners/Runner Stopper.stl`, qty: 2 }],
    },
    {
      id: 'latch', name: '卡扣', slot: '功能件', blocks: [{ at: [w / 2 - 48.3, 0.5, d - 86], size: [96.6, 4.5, 74.6] }], // 嵌在模组底部
      explode: [0, -60, 0],
      files: [{ path: `${DU}/Latch.stl`, qty: 1 }],
    },
  ];
  if (W === 'XL') {
    parts.push({
      id: 'box-back', name: split ? `${code} 盒体后段 2/2` : `${code} 盒体背板`, slot: '盒体',
      blocks: [{ at: [(w - (split ? 367 : 356.638)) / 2, 8.75, boxZ], size: [split ? 367 : 356.638, 37.5, split ? (D === 6 ? 131.901 : 152.901) : 6.224] }],
      explode: [0, 55, pull * 0.6],
      files: [{ path: `${dir}/Boxes/${code} ${split ? 'Box 1F Part 2' : 'Back Panel'}.stl`, qty: 1 }],
    });
  }
  if (spec.gearedRails !== false) {
    parts.push({
      // 一份 Rails.stl 含两根不同齿条：下条齿向上，上条绕前后轴转 180°、齿向下。
      id: 'geared-rails', name: '齿轮导轨 ×2（可选）', slot: '功能件', real: 'each', split: true,
      orient: { rotation: [0, 0, 0] },
      blocks: [
        { at: [(w - railL) / 2, 15.55, d - 5.8], size: [railL, 6.224, 3.8], slide: [-w, 0, 0] },
        { at: [(w - railL) / 2, 32.75, d - 5.8], size: [railL, 4.805, 3.8], flip: [0, 0, 180], slide: [w, 0, 0] },
      ],
      explode: [0, 0, pull],
      files: [{ path: `${DU}/Geared Rails/${W} Rails.stl`, qty: 1, pieces: 2 }],
    });
  }
  if (spec.interior === 'baseplate') {
    parts.push({
      id: 'baseplate', name: `${code} Gridfinity 底板${split ? '前段 1/2' : ''}`, slot: '内衬',
      blocks: split
        ? [{ at: [(w - 368.56) / 2, 11.5, d - 132], size: [368.56, 25.854, 131.69] }]
        : [{ at: [T + 8, T + 5, boxZ + 4], size: [w - 2 * T - 16, 4, boxD - 8] }],
      explode: [0, h * 0.8 + 40, pull],
      files: split
        ? [{ path: `${dir}/Gridfinity Baseplate/${code} Baseplate Part 1.stl`, qty: 1 }]
        : [{ path: `${dir}/Gridfinity Baseplate/${code} Baseplate.stl`, qty: 1 }],
    });
    if (split) parts.push({
      id: 'baseplate-back', name: `${code} Gridfinity 底板后段 2/2`, slot: '内衬',
      blocks: [{ at: [(w - 358.919) / 2, 11.5, boxZ + 4], size: [358.919, 25.854, D === 6 ? 128.311 : 170.502] }],
      explode: [0, h * 0.8 + 80, pull * 0.5],
      files: [{ path: `${dir}/Gridfinity Baseplate/${code} Baseplate Part 2.stl`, qty: 1 }],
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
  const locks = wide ? 2 : 1;
  const hf = H === 1 ? '1F' : '2-4F';

  const moduleFile = wide ? `${code} ${H}F ${INTERIOR_FILE[spec.interior]} Module.stl` : `${code} ${H}F Module.stl`;
  const roofFile = D >= 6 ? `${code} Roof Whole.stl` : `${code} Roof.stl`;
  const facadeFile = W === 'XL' ? `02. SUSTAINERS/${S_FAM.XL}/XL1F Facade.stl` : `02. SUSTAINERS/${S_FAM[W]}/Facades/${W}${H}F Facade.stl`;
  const hinge = wide
    ? [H === 1 ? `${SU}/Hinges/L-XL 1F Hinge.stl` : `${SU}/Hinges/L 2-4F Hinge.stl`, `${SU}/Hinges/L-XL Hinge Top.stl`]
    : [`${SU}/Hinges/S-M ${hf} Hinge.stl`, `${SU}/Hinges/${W} Hinge Top.stl`];

  // 模组实测高 50.8 / 84.8 / 180.8，从 y = 0 起（之前按 h - 10 居中摆，2F 悬空 5mm、1F 陷进地面 1.9mm）
  const moduleH = { 1: 50.8, 2: 84.8, 4: 180.8 }[H];
  // 面板（实测高 46 / 80 / 176，厚 10）挡在模组前面，上沿与模组上沿齐，箱盖前沿再盖住它（箱盖深 d + 10）
  const faceH = { 1: 46, 2: 80, 4: 176 }[H];
  const faceTop = moduleH;
  const faceHoles = sustainerHoles(W, H, w, faceH);
  // 标签槽（转 180° 后）：1F 在上沿开口、从上往下插；2F/4F 在左侧、中心距上沿 43.6。槽深 2.1
  const labelCX = H === 1 ? { S: 29, M: 51.4, L: w / 2, XL: w / 2 }[W] : 27.8;
  const labelCY = H === 1 ? faceTop - 20.1 / 2 : faceTop - 43.6;
  // 收纳箱组装第 1–4 步：支架在面板上沿，内件连接上下两个轴，外件闭合后自由端朝下。
  // 以实测轴心定位，外件绕正面法线转 180°；不能和内件共用同一个朝向。
  const lockL = H === 1 ? 49.3 : 55.3;
  const lockXs = wide ? [w * 0.25, w * 0.75] : [w / 2];
  const lockBlocks: Block[] = lockXs.map((cx) => ({ at: [cx - 25, faceTop + 8.3 - lockL, d + 5.5], size: [50, lockL, 18.2] }));

  // 收纳箱组装第 5–8 步：底铰链贴后壁内侧；顶部铰链在盖底面，连杆轴线沿箱宽。
  // 下铰链的轴心距长边末端 7mm，上下铰链同轴于 (y=moduleH, z=-7.6)。
  const bottomHeight = H === 1 ? 47.8 : 67;
  const bottomWidth = wide ? 50 : 40;
  const bottomLeft = wide ? 53.1 : W === 'S' ? 10.6 : 37.9;
  const bottomXs = [bottomLeft, w - bottomLeft - bottomWidth];
  const topWidth = wide ? 40 : W === 'S' ? 62.8 : 98.8;
  const topXs = wide ? [bottomXs[0] + bottomWidth + 0.4, bottomXs[1] - topWidth - 0.4] : [(w - topWidth) / 2];
  const rodLength = wide ? 99 : 75;
  const pinBlocks: Block[] = lockXs.flatMap((cx) => [
    { at: [cx - 25.4, moduleH - 0.3, d + 15.1], size: [21.4, 5.2, 5.2] },
    { at: [cx + 4, moduleH - 0.3, d + 15.1], size: [21.4, 5.2, 5.2], flip: [0, 180, 0] },
    { at: [cx - 20.2, moduleH - 15.3, d + 15.1], size: [18, 5.2, 5.2] },
    { at: [cx + 2.2, moduleH - 15.3, d + 15.1], size: [18, 5.2, 5.2], flip: [0, 180, 0] },
  ]);

  const parts: Part[] = [
    {
      id: 'module', name: `${code} ${H}F 收纳箱模组`, slot: '结构', blocks: shell(w, moduleH, d, true), explode: [0, 0, 0],
      orient: { post: [0, 0, 180] }, // 导出时开口朝下，翻过来
      files: [{ path: `${dir}/Modules/${moduleFile}`, qty: 1 }],
    },
    {
      // 箱盖实测总厚 27.8（包括嵌套凸台和内侧结构），安装面距其最低点 14.6。
      // 按安装面贴模组上沿定位，不能把整件当成 10mm 厚的板居中，否则 2F/4F 会悬空。
      id: 'roof', name: `${code} 箱盖`, slot: '结构', blocks: [{ at: [0, moduleH - 14.6, 0], size: [w, 27.8, d + 10], round: true }],
      explode: [0, 110, -30],
      orient: { rotation: [0, 0, 90] },
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
      id: 'bolts', name: `M4×20 螺栓 ×${faceHoles.length}`, slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
      blocks: faceHoles.flatMap(([x, y]) => bolt(x, faceTop - faceH + y, d + 10, 20, 2.2)),
      explode: [0, 0, 110],
      files: [],
    },
    {
      // 第 4 步每把锁支架 4 颗，按 LOCK HOLDER 的真实孔心定位。
      // 螺丝头贴安装板正面 d+10.9，不能取转轴凸耳的最前端 d+25.4（会悬空 14.5mm）。
      id: 'lock-bolts', name: `锁支架 M4×14 螺栓 ×${locks * 4}`, slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
      blocks: lockXs.flatMap((cx) => [-30.7, 30.7].flatMap((dx) => [-6.56, -15.56].flatMap((dy) => bolt(cx + dx, moduleH + dy, d + 10.9, 14, 2.2)))),
      explode: [0, 0, 130], files: [],
    },
    {
      // 第 5 步：上铰链固定螺栓沿竖直方向穿入盖底。硬件用代理几何，不计入打印文件。
      id: 'roof-bolts', name: `上铰链 M4×14 螺栓 ×${wide ? 8 : 4}`, slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
      blocks: topXs.flatMap((x) => [x + 7, x + topWidth - 7].flatMap((cx) => [15, 35].flatMap((z): Block[] => [
        { at: [cx - 3.5, moduleH - 9.2, z - 3.5], size: [7, 2.2, 7], round: true },
        { at: [cx - 2, moduleH - 7, z - 2], size: [4, 14, 4] },
      ]))),
      explode: [0, 70, -30], files: [],
    },
    {
      // 第 6 步：两片下铰链每片 4 颗 M4×10。
      id: 'hinge-bolts', name: '下铰链 M4×10 螺栓 ×8', slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
      blocks: bottomXs.flatMap((x) => [x + 7, x + bottomWidth - 7].flatMap((cx) => [moduleH - 17, moduleH - 32].flatMap((cy) => bolt(cx, cy, 16.9, 10, 2.2)))),
      explode: [0, 0, 80], files: [],
    },
    {
      id: 'locks', real: 'each', name: `锁 ×${locks}`, slot: '功能件', blocks: lockBlocks, explode: [0, 0, 150],
      orient: { rotation: [90, 90, 0], post: [0, 0, 180] },
      files: [{ path: `${SU}/Locks/LOCK OUTER PART ${hf}.stl`, qty: locks }],
    },
    {
      id: 'lock-holders', real: 'each', name: `锁扣支架 ×${locks}`, slot: '面板',
      blocks: lockXs.map((cx) => ({ at: [cx - 37.26, moduleH - 22.12, d + 5.3], size: [74.52, 22.12, 20.1] })),
      explode: [0, 0, 110], orient: { rotation: [90, -90, 0] },
      files: [{ path: `${SU}/Locks/LOCK HOLDER.stl`, qty: locks }],
    },
    {
      id: 'lock-inner', real: 'each', name: `锁内件 ×${locks}`, slot: '功能件',
      blocks: lockXs.map((cx) => ({ at: [cx - 19.8, moduleH - 17, d + 13.4], size: [39.6, 23.6, 8.6] })),
      explode: [0, 0, 140], orient: { rotation: [90, 90, 0] },
      files: [{ path: `${SU}/Locks/LOCK INNER PART.stl`, qty: locks }],
    },
    {
      id: 'lock-pins', real: 'each', split: true, deskew: true, name: `锁销钉 ×${locks * 4}`, slot: '功能件', fixedColor: '10104',
      blocks: pinBlocks, explode: [0, 35, 175], orient: { rotation: [0, 0, 0] },
      files: [{ path: `${SU}/Locks/1 SET OF PINS FOR 1 LOCK.stl`, qty: locks, pieces: 4 }],
    },
    {
      id: 'hinges', real: 'each', split: true, name: '下铰链 ×2', slot: '功能件',
      // 原文件第二片绕自身长轴翻了 180° 摆盘，分别定向才能让两块安装板都贴后壁内侧。
      blocks: bottomXs.map((x, i) => ({ at: [x, moduleH - bottomHeight + 7, -14.6], size: [bottomWidth, bottomHeight, 25.5], ...(i === 1 ? { flip: [-90, -90, 0] as Vec3 } : {}) })),
      explode: [0, 35, -70], orient: { rotation: [90, 90, 0] },
      files: [{ path: hinge[0], qty: 1, pieces: 2 }],
    },
    {
      // L/XL 两件上铰链；S/M 为一体式上铰链，原文件只有一件，不能强行拆成两件。
      id: 'hinge-tops', real: 'each', split: wide, name: `上铰链 ×${wide ? 2 : 1}`, slot: '功能件',
      blocks: topXs.map((x, i) => ({ at: [x, moduleH - 7, -14.6], size: [topWidth, 14, 57], ...(wide && i === 1 ? { flip: [90, -90, 0] as Vec3 } : {}) })),
      // L/XL 的第一片上铰链也反向摆盘；S/M 单件以及 L/XL 第二片使用另一面。
      explode: [0, 110, -30], orient: { rotation: wide ? [90, 90, 0] : [90, -90, 0] },
      files: [{ path: hinge[1], qty: 1, pieces: wide ? 2 : 1 }],
    },
    {
      id: 'rods', real: 'each', split: true, deskew: true, shaft: true, name: '铰链连杆 ×2', slot: '功能件',
      blocks: [
        // 端帽长约 5.3mm，留在铰链外侧；杆身才进入轴孔。
        { at: [bottomXs[0] - 5.3, moduleH - 6.325, -13.925], size: [rodLength, 12.65, 12.65], slide: [-100, 0, 0] },
        // 文件里两根杆的端帽已经朝相反方向，右杆不再额外翻转。
        { at: [bottomXs[1] + bottomWidth + 5.3 - rodLength, moduleH - 6.325, -13.925], size: [rodLength, 12.65, 12.65], slide: [100, 0, 0] },
      ],
      explode: [0, 35, -70], orient: { rotation: [0, 0, 0] },
      files: [{ path: `${SU}/Rods/${wide ? 'L-XL' : 'S-M'} Rods.stl`, qty: 1, pieces: 2 }],
    },
    {
      id: 'label', name: '收纳箱标签', slot: '标签', blocks: [{ at: [labelCX - 38.1 / 2, labelCY - 20.1 / 2, d + 10 - 2.1], size: [38.1, 20.1, 2] }],
      explode: [0, -20, 130],
      files: [{ path: `${SU}/Label for Sustainers.stl`, qty: 1 }],
    },
  ];
  // 第 12 步允许按需插分隔片。默认给出满槽布局，用户可减少；每个 part 只绑定一种 STL，
  // 避免多个文件放在同一个 part 时，真实预览只载入 files[0] 而漏掉另一种分隔片。
  const clampCount = (value: number | undefined, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value!))) : max;
  const slotCount = D === 3 ? 3 : D - 1;
  const countLabel = (configured: boolean) => configured ? '按需配置' : '默认满配，可按需减少';
  if (spec.interior === 'dividers' && wide) {
    const rows = clampCount(spec.dividerCount, slotCount);
    const depthCount = clampCount(spec.depthDividerCount, 2);
    const dividerH = moduleH - 9.95;
    const xs = (W === 'L' ? [123.7, 205.9] : [147.3, 271.4]).slice(0, depthCount);
    const zs = (D === 3 ? [34.5, 75.5, 115.5] : Array.from({ length: slotCount }, (_, i) => 53.6 + 42 * i)).slice(0, rows);
    if (depthCount) parts.push({
      id: 'depth-dividers', real: 'each', name: `深度分隔片 ×${depthCount}（${countLabel(spec.depthDividerCount !== undefined)}）`, slot: '内衬',
      blocks: xs.map((x) => ({ at: [x - 1, 6.9, 0.5], size: [2, dividerH, d - 0.7] })),
      explode: [0, h + 80, 0],
      files: [{ path: W === 'L' ? `${SU}/Dividers/L Depth Dividers/L${D}-${H}F Depth Divider.stl` : `${SU}/Dividers/XL Depth Dividers/XL${D} Depth Divider.stl`, qty: depthCount }],
    });
    if (rows) parts.push({
      id: 'width-dividers', real: 'each', name: `宽度分隔片 ×${rows}（${countLabel(spec.dividerCount !== undefined)}）`, slot: '内衬',
      blocks: zs.map((z) => ({ at: [3.2, 6.9, z - 1], size: [w - 6.4, dividerH, 2] })),
      explode: [0, h + 120, 0],
      files: [{ path: W === 'L' ? `${SU}/Dividers/L Width Dividers/L-${H}F Width Divider.stl` : `${SU}/Dividers/XL Width Divider.stl`, qty: rows }],
    });
  }
  if (spec.interior === 'sealed' && wide) {
    const maxRows = W === 'XL' ? slotCount : D - 1;
    const rows = clampCount(spec.dividerCount, maxRows);
    // 密封款的纵向隔墙已一体打印在模组内，另插的是每个独立腔室里的横向小片。
    const zs = (W === 'L'
      ? D === 3 ? [57, 94.1] : Array.from({ length: maxRows }, (_, i) => 50.8 + 42 * i)
      : D === 3 ? [52.1, 73.1, 94.1] : D === 4 ? [57, 96.5, 136.1] : Array.from({ length: maxRows }, (_, i) => 52.1 + 42 * i)).slice(0, rows);
    const dividerH = moduleH - 0.95;
    const label = countLabel(spec.dividerCount !== undefined);
    if (rows && W === 'L') parts.push({
      id: 'seal-dividers', real: 'each', name: `密封分隔片 ×${rows * 2}（${label}）`, slot: '内衬',
      blocks: zs.flatMap((z) => [2.7, w / 2 + 1.35].map((x) => ({ at: [x, 6.9, z - 1], size: [160.75, dividerH, 2] }))),
      explode: [0, h + 80, 0],
      files: [{ path: `${SU}/Dividers/L Seal Dividers/L-${H}F Seal Divider.stl`, qty: rows * 2 }],
    });
    if (rows && W === 'XL') {
      parts.push({
        id: 'seal-sides', real: 'each', name: `两侧密封分隔片 ×${rows * 2}（${label}）`, slot: '内衬',
        blocks: zs.flatMap((z) => [2.7, w - 2.7 - 142.96].map((x) => ({ at: [x, 6.9, z - 1], size: [142.96, dividerH, 2] }))),
        explode: [0, h + 80, 0],
        files: [{ path: `${SU}/Dividers/XL Seal Divider (Sides).stl`, qty: rows * 2 }],
      }, {
        id: 'seal-center', real: 'each', name: `中间密封分隔片 ×${rows}（${label}）`, slot: '内衬',
        blocks: zs.map((z) => ({ at: [(w - 123.52) / 2, 6.9, z - 1], size: [123.52, dividerH, 2] })),
        explode: [0, h + 120, 0],
        files: [{ path: `${SU}/Dividers/XL Seal Divider (Center).stl`, qty: rows }],
      });
    }
  }
  return parts;
}

function roofParts(spec: Extract<UnitSpec, { type: 'roof' }>): Part[] {
  const { w, h, d } = dimsOf(spec);
  const code = `${spec.width}${spec.depth}`;
  const parts: Part[] = [
    {
      id: 'roof', name: `${code} 顶盖`, slot: '结构',
      // 加重顶盖的两只杯形支座与顶盖为一体，真实高度约 88.3 mm，不能按普通 14 mm 顶盖居中。
      blocks: [{ at: [0, 0, 0], size: [w, spec.roof === 'heavyweight' ? 88.3 : spec.roof === 'underTable' ? 21.35 : h, d], round: true }], explode: [0, 0, 0],
      files: [{ path: `01. DRAWERS/${D_FAM[spec.width]}/${code}/Roofs/${code} ${ROOF_FILE[spec.roof]} Roof.stl`, qty: 1 }],
    },
  ];
  if (spec.roof === 'grid') {
    // 总说明第 10、11、18 页的栅格顶盖方案：一只 Top Handle，用两颗 M6×50 固定。
    parts.push(
      {
        id: 'handle', name: '栅格顶盖提手', slot: '功能件',
        // 原文件 X 为提手高度、Y 为厚度、Z 为长度。底座在 +X，穿手孔法线沿 Y。
        // 底座朝下、孔朝前后；不能仅按包围盒长短把孔转朝上。
        blocks: [{ at: [w / 2 - 63, h, d / 2 - 18.55], size: [126, 51, 37.1], round: true }],
        orient: { rotation: [90, -90, 0] },
        explode: [0, 90, 0],
        files: [{ path: `${DU}/Top Handle (Turn On Supports).stl`, qty: 1, supports: true }],
      },
      {
        id: 'handle-bolts', name: 'M6×50 顶盖提手螺栓 ×2', slot: '功能件', hardware: true, real: 'none', fixedColor: '10101',
        // STL 两条 M6 斜孔为 45°，在宽度方向相向倾斜，轴线在厚度中心前 0.484mm。
        // 50mm 杆身从提手内的孔底伸入顶盖，不能竖直露出提手顶部。
        blocks: [-1, 1].map((side) => {
          const start: Vec3 = [w / 2 + side * 53.55, h + 28.9, d / 2 + 0.484];
          const run = 50 / Math.SQRT2;
          return cylinderBetween(start, [start[0] - side * run, start[1] - run, start[2]], 3);
        }),
        explode: [0, 130, 0], files: [],
      },
    );
  }
  if (spec.roof === 'underTable') {
    const holes = underTableHoles(spec);
    parts.push({
      id: 'mounting-screws', name: `桌下固定螺钉 ×${holes.length}（规格按桌板选择）`, slot: '功能件',
      hardware: true, real: 'none', fixedColor: '10101',
      // 长度仅为安装示意，采购规格由桌板厚度、材料和嵌件方案决定。
      blocks: holes.map(([x, z]) => ({ at: [x - 2.2, 8, z - 2.2], size: [4.4, 25, 4.4] })),
      explode: [0, 90, 0], files: [],
    });
  }
  if (spec.roof === 'heavyweight') {
    // 每份 Handle / Insert STL 都只有一件。圆柱握把两端各用一个 Insert，不能只打一只或合在握把后隐藏。
    parts.push(
      {
        id: 'handle', name: '加重型顶盖握把', slot: '功能件',
        blocks: [{ at: [w / 2 - 78.3, 29, d / 2 - 15], size: [156.6, 29.5, 30], round: true }],
        explode: [0, 110, 0], files: [{ path: `${DU}/Heawyweight Roof Handle.stl`, qty: 1 }],
      },
      {
        id: 'handle-inserts', name: '加重型顶盖嵌件 ×2', slot: '功能件', real: 'each',
        blocks: [w / 2 - 94.8, w / 2 + 78].map((x, i) => ({
          at: [x, 22, d / 2 - 15], size: [16.8, 41.8, 30], ...(i ? { flip: [0, 180, 0] as Vec3 } : {}),
        })),
        explode: [0, 65, 0], files: [{ path: `${DU}/Heawyweight Roof Insert.stl`, qty: 2 }],
      },
    );
  }
  return parts;
}

const MOD = '03. MODIFICATIONS';
/** Ø16mm 轮轴长度（改装说明书第 2 页，第 1 步） */
const ROD_MM = { S: 248, M: 338, L: 414, XL: 504 };

function baseParts(spec: Extract<UnitSpec, { type: 'base' }>): Part[] {
  const { w, d } = dimsOf(spec);
  const { width: W, depth: D } = spec;
  const code = `${W}${D}`;
  const lift = BASE_LIFT_MM;
  const axleY = lift + 20, axleZ = 25; // Base STL：孔心距底面 20、后沿 30；底座后沿为 z=-5。
  const footDepth = 92, footHeight = 60.5;
  const footBacks = spec.mode === 'wheels' ? [d - 89.5] : [-2.5, d - 89.5];
  const parts: Part[] = [
    {
      id: 'base', name: `${code} 底座`, slot: '结构', blocks: [{ at: [0, lift, -5], size: [w, BASE_BODY_MM, d + 10] }], explode: [0, 90, 0],
      // S/M 原文件安装槽朝 -Y，L/XL 摆正后朝 +X；显式翻正，避免自动定向把底面朝上。
      orient: { rotation: W === 'S' || W === 'M' ? [0, 0, 180] : [0, 0, 90] },
      files: [{ path: `${MOD}/Base/${W}/${code} ${D >= 6 ? 'Base Whole' : 'Base'}.stl`, qty: 1 }],
    },
    {
      // 前支脚（推车模式）或前后各一（支脚模式）
      id: 'feet', name: `${W} 支脚`, slot: '功能件', real: 'each',
      // 原文件 +Z 是支脚向下的厚度，平安装面必须朝上；前脚高的一端朝前。
      // 0.5mm 安装凸台嵌进底座，支脚和后轮的最低点均在地面。
      orient: { rotation: [90, 0, 180] },
      blocks: footBacks.map((z, i) => ({ at: [30, 0, z], size: [w - 60, footHeight, footDepth],
        ...(spec.mode === 'feet' && i === 0 ? { flip: [90, 0, 0] as Vec3 } : {}),
      })),
      explode: [0, -50, 0],
      files: [{ path: `${MOD}/Feet/${W} Feet.stl`, qty: spec.mode === 'wheels' ? 1 : 2 }],
    },
  ];
  if (spec.mode === 'wheels') {
    // 改装第 2–6 页：每侧一个衬套、一个轮盘、一条轮胎和一个外盖；每份 STL 都只有一件。
    // 每种文件单独建 Part，否则真实模型预览只加载 files[0]，其余轮组零件会消失。
    const wheelBlocks = (thickness: number, diameter: number, inner: number): Block[] => [
      { at: [-inner - thickness, axleY - diameter / 2, axleZ - diameter / 2], size: [thickness, diameter, diameter], flip: [0, -90, 0], slide: [-100, 0, 0] },
      { at: [w + inner, axleY - diameter / 2, axleZ - diameter / 2], size: [thickness, diameter, diameter], flip: [0, 90, 0], slide: [100, 0, 0] },
    ];
    parts.push(
      {
        id: 'wheel-bushings', name: '轮轴衬套 ×2', slot: '结构', real: 'each', orient: { rotation: [0, 90, 0] },
        blocks: wheelBlocks(33, 31.2, 0), explode: [0, 0, -45],
        files: [{ path: `${MOD}/Wheels/Bushing.stl`, qty: 2 }],
      },
      {
        id: 'wheel-disks', name: '轮盘 ×2', slot: '结构', real: 'each', orient: { rotation: [0, 90, 0] },
        blocks: wheelBlocks(20.1, 142, 1.4), explode: [0, 0, -70],
        files: [{ path: `${MOD}/Wheels/Disk.stl`, qty: 2 }],
      },
      {
        id: 'wheels', name: 'TPU 轮胎 ×2', slot: '功能件', real: 'each', fixedColor: '10101', orient: { rotation: [0, 90, 0] },
        blocks: wheelBlocks(40.6, 160, 1.4), explode: [0, 0, -90],
        files: [{ path: `${MOD}/Wheels/Tyre (TPU).stl`, qty: 2 }],
      },
      {
        id: 'wheel-covers', name: '轮子外盖 ×2', slot: '结构', real: 'each', orient: { rotation: [0, 90, 0] },
        blocks: wheelBlocks(23.9, 140, 18.1), explode: [0, 0, -120],
        files: [{ path: `${MOD}/Wheels/Cover.stl`, qty: 2 }],
      },
      {
        id: 'wheel-jig', name: '轮轴衬套定位工装（可复用）', slot: '结构', tooling: true, real: 'none',
        blocks: [{ at: [-80, 0, 0], size: [38, 38, 20] }], explode: [0, 0, 0],
        files: [{ path: `${MOD}/Wheels/Jig.stl`, qty: 1 }],
      },
      {
        id: 'wheel-axle', name: `Ø16 轮轴杆 ${ROD_MM[W]}mm`, slot: '结构', hardware: true, real: 'none', fixedColor: '10102',
        blocks: [{ at: [(w - ROD_MM[W]) / 2, axleY - 8, axleZ - 8], size: [ROD_MM[W], 16, 16], cyl: true, cylAxis: 'x' }],
        explode: [0, 0, -130], files: [],
      },
      {
        id: 'wheel-bearings', name: '6205ZZ 轴承 ×2', slot: '结构', hardware: true, real: 'none', fixedColor: '10102',
        blocks: [-20, w + 5].map((x) => ({ at: [x, axleY - 26, axleZ - 26], size: [15, 52, 52], cyl: true, cylAxis: 'x', bore: 25 })),
        explode: [0, 0, -150], files: [],
      },
      {
        id: 'wheel-collars', name: 'SCSAW 轴锁紧环 ×2', slot: '结构', hardware: true, real: 'none', fixedColor: '10102',
        blocks: [-30, w + 20].map((x) => ({ at: [x, axleY - 15, axleZ - 15], size: [10, 30, 30], cyl: true, cylAxis: 'x', bore: 16 })),
        explode: [0, 0, -170], files: [],
      },
      {
        id: 'wheel-cover-bolts', name: '轮盖 M4×25 螺栓 ×12', slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
        blocks: [-1, 1].flatMap((side) => Array.from({ length: 6 }, (_, i): Block[] => {
          const a = i * Math.PI / 3, y = axleY + 49 * Math.cos(a), z = axleZ + 49 * Math.sin(a);
          return [
            { at: [side < 0 ? -45 : w + 42, y - 3.5, z - 3.5], size: [3, 7, 7], cyl: true, cylAxis: 'x' },
            { at: [side < 0 ? -42 : w + 17, y - 2, z - 2], size: [25, 4, 4], cyl: true, cylAxis: 'x' },
          ];
        }).flat()),
        explode: [0, 0, -200], files: [],
      },
    );
  }
  parts.push({
    id: 'feet-bolts', name: `支脚 M6×90 螺栓 ×${spec.mode === 'wheels' ? 2 : 4}`, slot: '功能件', hardware: true, blocksPerPiece: 2, real: 'none', fixedColor: '10101',
    blocks: footBacks.map((z, i) => z + (spec.mode === 'feet' && i === 0 ? 30 : footDepth - 30)).flatMap((z) => [60.88, w - 60.88].flatMap((x): Block[] => [
      { at: [x - 5, 0.1, z - 5], size: [10, 4, 10], cyl: true, cylAxis: 'y' },
      { at: [x - 3, 4.1, z - 3], size: [6, 90, 6], cyl: true, cylAxis: 'y' },
    ])),
    explode: [0, -85, 0], files: [],
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
  if (spec.type === 'sustainer') {
    const wide = spec.width === 'L' || spec.width === 'XL';
    const { w } = dimsOf(spec);
    const faceH = { 1: 46, 2: 80, 4: 176 }[spec.height];
    return {
      'M4×14mm 螺栓': wide ? 16 : 8, // 每把锁 4 颗，上铰链每件 4 颗
      'M4×10mm 螺栓': 8,
      'M4×20mm 螺栓': sustainerHoles(spec.width, spec.height, w, faceH).length,
    };
  }
  if (spec.type === 'base') {
    const feet = spec.mode === 'wheels' ? 1 : 2;
    const hw: Record<string, number> = { 'M6×90mm 螺栓': 2 * feet };
    if (spec.mode === 'wheels')
      Object.assign(hw, {
        [`Ø16mm 轮轴杆 ${ROD_MM[spec.width]}mm`]: 1,
        'M4×25mm 螺栓': 12,
        '6205ZZ 轴承': 2,
        'SCSAW 轴锁紧环（内径16/外径30/厚10mm）': 2,
      });
    return hw;
  }
  if (spec.type === 'roof' && spec.roof === 'grid') return { 'M6×50mm 螺栓': 2 };
  return mountingHardwareOf(spec);
}
