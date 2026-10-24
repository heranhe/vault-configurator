// 安装流程：按说明书（02 抽屉组装 / 03 收纳箱组装 / 04 改装）把一个单元拆成若干步，
// 每一步写明「这一步结束时哪些零件在哪」（相对装好位置的偏移），播放时在两步之间插值
import { underTableHoles } from './mounting';
import { dimsOf } from './dims';
import { partsOf } from './parts';
import type { UnitSpec, Vec3 } from './types';

export type AsmStep = {
  title: string;
  note: string;
  /** 说明书出处 */
  ref: string;
  /** 这一步结束时零件的位置（相对装好位置）。第一次出现的零件会从 place + from 飞过来 */
  place: Record<string, Vec3>;
  from?: Record<string, Vec3>;
  /** 新零件先进场、再整体移动（默认先移动、后进场） */
  enterFirst?: boolean;
  /** 不移动但需要强调的零件 */
  focus?: string[];
};

const O: Vec3 = [0, 0, 0];

function drawerSteps(spec: Extract<UnitSpec, { type: 'drawer' }>): AsmStep[] {
  const { d } = dimsOf(spec);
  const bolts = partsOf(spec).find((p) => p.id === 'bolts')!.blocks.length / 2;
  // 组装时盒体放在模组前方，面板再往前一点
  const BX: Vec3 = [0, 0, d * 0.95];
  const FA: Vec3 = [0, 0, d * 0.95 + 120];
  const all = (ids: string[], at: Vec3) => Object.fromEntries(ids.map((id) => [id, at]));
  const front = ['facade', 'key', 'key-cap', 'springs', 'bolts', 'label', 'caps'];
  const boxParts = spec.width === 'XL' ? ['box', 'box-back'] : ['box'];
  const steps: AsmStep[] = [
    {
      title: '钥匙锁装进面板', ref: '抽屉组装 第 1 步',
      note: '把钥匙锁按说明书图示方向插进面板。',
      place: { facade: FA, key: FA }, from: { facade: [0, -50, 0], key: [0, 0, 130] },
    },
    {
      title: '扣上钥匙帽', ref: '抽屉组装 第 2 步',
      note: '把钥匙帽扣到钥匙上，用橡胶锤敲到位。钥匙帽和钥匙锁各打印一件。',
      place: { 'key-cap': FA }, from: { 'key-cap': [0, 0, 75] },
    },
    {
      title: '压入弹簧', ref: '抽屉组装 第 3 步',
      note: '把弹簧从背面压进面板，弹簧的平面朝上。',
      place: { springs: FA }, from: { springs: [0, 0, -90] },
    },
    {
      title: '拆掉盒体支撑', ref: '抽屉组装 第 4 步',
      note: '掰掉盒体里的 F 形手动支撑，否则盒体装不进模组。支撑随盒体一起打印，不计为独立装配件。',
      place: all(boxParts, BX), from: { box: [0, -70, 0], 'box-back': [0, 0, -90] },
    },
    ...(spec.gearedRails !== false ? [{
      title: '装上下齿轮导轨（可选）', ref: '抽屉组装 第 5 步',
      note: '把上下两根齿条从两侧滑进盒体并推到底。一份 Rails 文件已包含两根。用于增强锁紧力；同一个 2F / 4F 模组内放多个盒体时必须安装。',
      place: { 'geared-rails': BX }, from: { 'geared-rails': [-160, 0, 0] as Vec3 },
    }] : []),
    {
      title: '装入导轨滑块', ref: '抽屉组装 第 6 步',
      note: '把左右两条滑块分别滑入盒体两侧。一份 Runner Slides 文件包含左右两件，只需打印一份。',
      place: { 'runner-slides': BX }, from: { 'runner-slides': [0, 0, 120] },
    },
    {
      title: '面板固定到盒体', ref: '抽屉组装 第 7 步',
      note: `锁要保持「打开」状态插入，才能和齿条咬合。用 M4×14 螺栓 ×${bolts} 从正面穿过面板拧进盒体。`,
      place: { ...all(['facade', 'key', 'key-cap', 'springs'], BX), bolts: BX }, from: { bolts: [0, 0, 110] },
    },
    {
      title: '插标签、压面板盖', ref: '抽屉组装 第 8 步',
      note: '标签从左侧滑进标签槽，正好盖住左下角那颗螺栓；其余螺栓孔各压一个面板盖。',
      place: { label: BX, caps: BX }, from: { label: [-140, 0, 0], caps: [0, 0, 70] },
    },
    {
      title: '装导轨导槽', ref: '抽屉组装 第 9 步',
      note: '左右各一条导槽，扣到盒体两侧的滑块上。',
      place: { runners: BX }, from: { runners: [0, 80, 0] },
    },
    {
      title: '整套推进模组', ref: '抽屉组装 第 10 步',
      note: '把装好的盒体对准模组开口，一直推到底。接下来还需装入左右两颗导轨限位块，再翻转安装底部卡扣。',
      enterFirst: true,
      place: { module: O, ...all(boxParts, O), runners: O, 'runner-slides': O, ...(spec.gearedRails !== false ? { 'geared-rails': O } : {}), ...all(front, O) }, from: { module: [0, -60, 0] },
    },
    {
      title: '推入左右限位块 ×2', ref: '抽屉组装 第 11 步',
      note: '确认盒体完全卡到位以后，再把两颗导轨限位块分别从左、右两侧推进导轨，左右各一颗。装好后再翻转模组安装底部卡扣。',
      place: { 'runner-stoppers': O }, from: { 'runner-stoppers': [-50, 0, 0] },
    },
    {
      title: '翻转模组，按上卡扣', ref: '抽屉组装 第 12 步',
      note: '把模组翻过来，卡扣按进底部的槽里。',
      place: { latch: O }, from: { latch: [0, -110, 0] },
    },
  ];
  if (spec.interior === 'baseplate')
    steps.push({ title: '放入 Gridfinity 底板', ref: '说明书 第 1 页', note: '底板直接平放进盒体；XL6 / XL7 的前后两段分别装入。', place: { baseplate: O, ...(spec.width === 'XL' && spec.depth >= 6 ? { 'baseplate-back': O } : {}) }, from: { baseplate: [0, 160, 0], 'baseplate-back': [0, 190, 0] } });
  return steps;
}

function sustainerSteps(spec: Extract<UnitSpec, { type: 'sustainer' }>): AsmStep[] {
  const { h, d } = dimsOf(spec);
  const bolts = partsOf(spec).find((p) => p.id === 'bolts')!.blocks.length / 2;
  const FA: Vec3 = [0, 0, d * 0.8 + 60];
  const R: Vec3 = [0, h + 90, -40];
  const lockIds = ['locks', 'lock-holders', 'lock-inner', 'lock-pins'];
  const lockAt = (at: Vec3) => Object.fromEntries(lockIds.map((id) => [id, at]));
  const topBolts = spec.width === 'L' || spec.width === 'XL' ? 8 : 4;
  const steps: AsmStep[] = [
    {
      title: '组装锁', ref: '收纳箱组装 第 1–2 步',
      note: '用小销钉把锁内件装到锁扣支架上，再用大销钉装上锁外件。注意「UP」标识的朝向。',
      place: lockAt([FA[0], FA[1], FA[2] + 80]),
      from: { 'lock-holders': [0, -40, 0], 'lock-inner': [0, 30, 40], locks: [0, 50, 70], 'lock-pins': [-80, 0, 0] },
    },
    {
      title: '锁固定到面板', ref: '收纳箱组装 第 3–4 步',
      note: '支架「UP」朝上，闭合的锁外件自由端朝下，用 M4×14 螺栓把支架固定到面板上。',
      enterFirst: true,
      place: { facade: FA, ...lockAt(FA), 'lock-bolts': FA }, from: { facade: [0, -50, 0], 'lock-bolts': [0, 0, 80] },
    },
    {
      title: '上铰链装到箱盖', ref: '收纳箱组装 第 5 步',
      note: `用 M4×14 螺栓 ×${topBolts} 把上铰链固定在箱盖底面。`,
      place: { roof: R, 'hinge-tops': R, 'roof-bolts': R }, from: { roof: [0, 70, 0], 'hinge-tops': [0, -70, 0], 'roof-bolts': [0, -100, 0] },
    },
    {
      title: '下铰链装到模组', ref: '收纳箱组装 第 6 步',
      note: '用 M4×10 螺栓 ×8 把下铰链固定在模组上。',
      enterFirst: true,
      place: { module: O, hinges: O, 'hinge-bolts': O }, from: { module: [0, -60, 0], hinges: [0, 0, 100], 'hinge-bolts': [0, 0, 140] },
    },
    {
      title: '对接箱盖，穿入连杆', ref: '收纳箱组装 第 7–8 步',
      note: '把箱盖和模组的铰链对齐，用两根连杆从两侧把上下铰链串起来。',
      place: { roof: O, 'hinge-tops': O, 'roof-bolts': O, rods: O },
    },
    {
      title: '面板固定到模组', ref: '收纳箱组装 第 9 步',
      note: `用 M4×20 螺栓 ×${bolts} 把装好锁的面板固定到模组上。`,
      place: { facade: O, ...lockAt(O), 'lock-bolts': O, bolts: O }, from: { bolts: [0, 0, 110] },
    },
    {
      title: '插入标签', ref: '收纳箱组装 第 10 步',
      note: spec.height === 1 ? '标签从面板上沿插进去。' : '标签从左侧滑进标签槽。',
      place: { label: O }, from: { label: spec.height === 1 ? [0, 90, 0] : [-140, 0, 0] },
    },
  ];
  const inners = partsOf(spec).filter((p) => p.slot === '内衬');
  if (inners.length)
    steps.push({
      title: '插入分隔片', ref: '收纳箱组装 第 11–12 步',
      note: `先拆掉模组里的手动支撑。分隔片可按需要减少，当前清单和预览按所选布局提供：${inners.map((p) => p.name).join('；')}。${spec.interior === 'sealed' ? '纵向隔墙已经集成在密封模组内，只需将小分隔片横向插入各腔室。' : '深度分隔片沿前后方向放，宽度分隔片横向插入并与深度片交叉。'}`,
      place: Object.fromEntries(inners.map((p) => [p.id, O])), from: Object.fromEntries(inners.map((p) => [p.id, [0, h + 140, 0] as Vec3])),
    });
  return steps;
}

function roofSteps(spec: Extract<UnitSpec, { type: 'roof' }>): AsmStep[] {
  if (spec.roof === 'underTable') {
    const screws = underTableHoles(spec).length;
    return [
      {
        title: '顶盖定位并固定到桌板底面', ref: '安装说明 第 10–11 页',
        note: `先将桌下安装顶盖贴合桌板底面，按全部预设孔位准备固定螺钉 ×${screws}。螺钉规格、长度按桌板选用；可使用桌板螺纹嵌件配螺钉，或适合木材的螺钉直接固定。`,
        place: { roof: O, 'mounting-screws': O }, from: { roof: [0, -100, 0], 'mounting-screws': [0, -130, 0] },
      },
      {
        title: '滑入并锁住收纳模组', ref: '安装说明 第 12 页',
        note: '顶盖固定完成后，将装好的模组从前方滑入顶盖的嵌套连接处，用模组底部卡扣锁定；后续层按相同方式连接。卡扣随模组清单提供，顶盖不重复计数。',
        place: {}, focus: ['roof'],
      },
    ];
  }
  const steps: AsmStep[] = [
    { title: '盖上顶盖', ref: '说明书 第 8、10 页', note: '顶盖对准最上层模组的嵌套凸台，向下压到位。', place: { roof: O }, from: { roof: [0, 110, 0] } },
  ];
  if (spec.roof === 'grid')
    steps.push({
      title: '固定栅格顶盖提手', ref: '说明书 第 11、18 页',
      note: '把 Top Handle 对准栅格顶盖中部，用 M6×50 螺栓 ×2 固定提手；该提手打印时需开启支撑。',
      place: { handle: O, 'handle-bolts': O }, from: { handle: [0, 90, 0], 'handle-bolts': [0, 120, 0] },
    });
  if (spec.roof === 'heavyweight')
    steps.push({
      title: '装加重型顶盖握把和两侧嵌件', ref: '说明书 第 10 页；Heawyweight Roof 模型',
      note: '圆柱握把放入两侧杯形支座之间，两端各装一个嵌件，共 1 只握把、2 只嵌件。',
      place: { handle: O, 'handle-inserts': O }, from: { handle: [0, 110, 0], 'handle-inserts': [0, 70, 0] },
    });
  return steps;
}

function baseSteps(spec: Extract<UnitSpec, { type: 'base' }>): AsmStep[] {
  const steps: AsmStep[] = [{ title: '放好底座', ref: '改装 第 2 页', note: '底座正面朝上放平。', place: { base: O }, from: { base: [0, 80, 0] } }];
  if (spec.mode === 'wheels') {
    const rodMM = { S: 248, M: 338, L: 414, XL: 504 }[spec.width];
    steps.push(
      {
        title: '穿入轮轴，压装衬套', ref: '改装 第 2–3 页，第 1–2 步',
        note: `把 Ø16mm 轮轴杆切到 ${rodMM}mm，穿过底座。两端各压一个衬套，用 Jig 定位工装控制轮轴露出 10mm，完成后取下工装。`,
        place: { 'wheel-bushings': O, 'wheel-axle': O }, from: { 'wheel-bushings': [0, 0, -80], 'wheel-axle': [-140, 0, 0] },
      },
      {
        title: '装轮盘、轴承与轴锁紧环', ref: '改装 第 4–5 页，第 3–5 步',
        note: '左右各装一个轮盘；各压入一个 6205ZZ 轴承（25×52×15mm），再用一个 SCSAW 轴锁紧环（16×30×10mm）固定。',
        place: { 'wheel-disks': O, 'wheel-bearings': O, 'wheel-collars': O }, from: { 'wheel-disks': [0, 0, -100], 'wheel-bearings': [0, 0, -130], 'wheel-collars': [0, 0, -160] },
      },
      {
        title: '套上 TPU 轮胎', ref: '改装 第 5 页，第 6 步',
        note: '两侧轮盘各套上一条 TPU 轮胎。',
        place: { wheels: O }, from: { wheels: [0, 0, -120] },
      },
      {
        title: '固定轮子外盖', ref: '改装 第 6 页，第 7 步',
        note: '左右各装一个外盖，每侧用 6 颗 M4×25mm 螺栓固定，共 12 颗。',
        place: { 'wheel-covers': O, 'wheel-cover-bolts': O }, from: { 'wheel-covers': [0, 0, -140], 'wheel-cover-bolts': [0, 0, -180] },
      },
    );
  }
  const feet = spec.mode === 'wheels' ? 1 : 2;
  steps.push({
    title: '翻过来装支脚', ref: '改装 第 6 页，第 8 步',
    note: `把底座翻过来，${spec.mode === 'wheels' ? '在前方装 1 个' : '在前后各装 1 个'}对应宽度的支脚。每个支脚用 2 颗 M6×90mm 螺栓固定，共 ${2 * feet} 颗。`,
    place: { feet: O, 'feet-bolts': O }, from: { feet: [0, -100, 0], 'feet-bolts': [0, -130, 0] },
  });
  return steps;
}

export function assemblyOf(spec: UnitSpec): AsmStep[] {
  if (spec.type === 'drawer') return drawerSteps(spec);
  if (spec.type === 'sustainer') return sustainerSteps(spec);
  if (spec.type === 'roof') return roofSteps(spec);
  return baseSteps(spec);
}

export type Pose = { visible: boolean; offset: Vec3; active: boolean };

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const same = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

/** 第 step 步开始前零件的位置；还没出场返回 null */
function before(steps: AsmStep[], step: number, partId: string): Vec3 | null {
  let at: Vec3 | null = null;
  for (let i = 0; i < step; i++) at = steps[i].place[partId] ?? at;
  return at;
}

/**
 * 第 step 步播放到 t（0～1）时某个零件的位置。
 * 一步里既有「已在场零件移动」又有「新零件进场」时分两段播：默认先移动、后进场，enterFirst 反过来。
 * 没有任何一步放置的零件视为一开始就装好。
 */
export function poseAt(steps: AsmStep[], step: number, t: number, partId: string): Pose {
  if (!steps.some((x) => x.place[partId])) return { visible: true, offset: O, active: false };
  const s = steps[step];
  const prev = before(steps, step, partId);
  const cur = s.place[partId] ?? prev;
  if (!cur) return { visible: false, offset: O, active: false };

  const ids = Object.keys(s.place);
  const entering = ids.some((id) => !before(steps, step, id));
  const moving = ids.some((id) => {
    const p = before(steps, step, id);
    return p && !same(p, s.place[id]);
  });
  const both = entering && moving;
  if (!prev) {
    const [a, b] = !both ? [0, 1] : s.enterFirst ? [0, 0.55] : [0.45, 1];
    const f = s.from?.[partId] ?? O;
    const start: Vec3 = [cur[0] + f[0], cur[1] + f[1], cur[2] + f[2]];
    return { visible: true, offset: lerp(start, cur, ease((t - a) / (b - a))), active: true };
  }
  if (same(prev, cur)) return { visible: true, offset: cur, active: !!s.focus?.includes(partId) };
  const [a, b] = !both ? [0, 1] : s.enterFirst ? [0.45, 1] : [0, 0.55];
  return { visible: true, offset: lerp(prev, cur, ease((t - a) / (b - a))), active: true };
}

/** 整个流程里每个零件到过的所有偏移，用来给相机取景 */
export function assemblyOffsets(steps: AsmStep[]): Vec3[] {
  const out: Vec3[] = [O];
  for (const s of steps)
    for (const [id, at] of Object.entries(s.place)) {
      out.push(at);
      const f = s.from?.[id];
      if (f) out.push([at[0] + f[0], at[1] + f[1], at[2] + f[2]]);
    }
  return out;
}
