// 安装流程：按说明书（02 抽屉组装 / 03 收纳箱组装 / 04 改装）把一个单元拆成若干步，
// 每一步写明「这一步结束时哪些零件在哪」（相对装好位置的偏移），播放时在两步之间插值
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
  /** 不移动但需要强调的零件（如限位块藏在导轨部件里） */
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
  const front = ['facade', 'key', 'springs', 'bolts', 'label', 'caps'];
  const steps: AsmStep[] = [
    {
      title: '钥匙锁装进面板', ref: '抽屉组装 第 1–2 步',
      note: '把钥匙锁按图示方向插进面板，再把钥匙帽扣到钥匙上，用橡胶锤敲到位。',
      place: { facade: FA, key: FA }, from: { facade: [0, -50, 0], key: [0, 0, 130] },
    },
    {
      title: '压入弹簧', ref: '抽屉组装 第 3 步',
      note: '把弹簧从背面压进面板，弹簧的平面朝上。',
      place: { springs: FA }, from: { springs: [0, 0, -90] },
    },
    {
      title: '准备盒体', ref: '抽屉组装 第 4–6 步',
      note: '掰掉盒体里的 F 形手动支撑，否则装不进模组。同一个 2F/4F 模组里放多个盒体时，先装上下两条齿轮导轨；然后装入导轨滑块。',
      place: { box: BX }, from: { box: [0, -70, 0] },
    },
    {
      title: '面板固定到盒体', ref: '抽屉组装 第 7 步',
      note: `锁要保持「打开」状态插入，才能和齿条咬合。用 M4×14 螺栓 ×${bolts} 从正面穿过面板拧进盒体。`,
      place: { ...all(['facade', 'key', 'springs'], BX), bolts: BX }, from: { bolts: [0, 0, 110] },
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
      note: '把装好的盒体对准模组开口，一直推到底。',
      enterFirst: true,
      place: { module: O, box: O, runners: O, ...all(front, O) }, from: { module: [0, -60, 0] },
    },
    {
      title: '推入限位块', ref: '抽屉组装 第 11 步',
      note: '确认盒体完全卡到位以后，再把两颗导轨限位块从两侧推进去。',
      place: {}, focus: ['runners'],
    },
    {
      title: '翻转模组，按上卡扣', ref: '抽屉组装 第 12 步',
      note: '把模组翻过来，卡扣按进底部的槽里。',
      place: { latch: O }, from: { latch: [0, -110, 0] },
    },
  ];
  if (spec.interior === 'baseplate')
    steps.push({ title: '放入 Gridfinity 底板', ref: '说明书 第 1 页', note: '底板直接平放进盒体。', place: { baseplate: O }, from: { baseplate: [0, 160, 0] } });
  return steps;
}

function sustainerSteps(spec: Extract<UnitSpec, { type: 'sustainer' }>): AsmStep[] {
  const { h, d } = dimsOf(spec);
  const bolts = partsOf(spec).find((p) => p.id === 'bolts')!.blocks.length / 2;
  const FA: Vec3 = [0, 0, d * 0.8 + 60];
  const R: Vec3 = [0, h + 90, -40];
  const steps: AsmStep[] = [
    {
      title: '组装锁', ref: '收纳箱组装 第 1–2 步',
      note: '用小销钉把锁内件装到锁扣支架上，再用大销钉装上锁外件。注意「UP」标识的朝向。',
      place: { locks: [FA[0], FA[1], FA[2] + 80] }, from: { locks: [0, 50, 0] },
    },
    {
      title: '锁固定到面板', ref: '收纳箱组装 第 3–4 步',
      note: '「UP」标识朝上，用 M4×14 螺栓把锁固定到面板上。',
      enterFirst: true,
      place: { facade: FA, locks: FA }, from: { facade: [0, -50, 0] },
    },
    {
      title: '上铰链装到箱盖', ref: '收纳箱组装 第 5 步',
      note: '用 M4×14 螺栓把上铰链固定在箱盖上。',
      place: { roof: R }, from: { roof: [0, 70, 0] },
    },
    {
      title: '下铰链装到模组', ref: '收纳箱组装 第 6 步',
      note: '用 M4×10 螺栓 ×8 把下铰链固定在模组上。',
      enterFirst: true,
      place: { module: O, hinges: O }, from: { module: [0, -60, 0], hinges: [0, 0, -100] },
    },
    {
      title: '对接箱盖，穿入连杆', ref: '收纳箱组装 第 7–8 步',
      note: '把箱盖和模组的铰链对齐，用两根连杆从两侧把上下铰链串起来。',
      place: { roof: O },
    },
    {
      title: '面板固定到模组', ref: '收纳箱组装 第 9 步',
      note: `用 M4×20 螺栓 ×${bolts} 把装好锁的面板固定到模组上。`,
      place: { facade: O, locks: O, bolts: O }, from: { bolts: [0, 0, 110] },
    },
    {
      title: '插入标签', ref: '收纳箱组装 第 10 步',
      note: spec.height === 1 ? '标签从面板上沿插进去。' : '标签从左侧滑进标签槽。',
      place: { label: O }, from: { label: spec.height === 1 ? [0, 90, 0] : [-140, 0, 0] },
    },
  ];
  const inner = partsOf(spec).find((p) => p.id === 'dividers' || p.id === 'seals');
  if (inner)
    steps.push({
      title: '插入分隔片', ref: '收纳箱组装 第 11–12 步',
      note: '先拆掉模组里的手动支撑，再按需要插入分隔片：深度分隔片竖着插、宽度分隔片横着插。',
      place: { [inner.id]: O }, from: { [inner.id]: [0, h + 140, 0] },
    });
  return steps;
}

function roofSteps(spec: Extract<UnitSpec, { type: 'roof' }>): AsmStep[] {
  const steps: AsmStep[] = [
    { title: '盖上顶盖', ref: '说明书 第 8 页', note: '顶盖对准最上层模组的嵌套凸台，向下压到位。', place: { roof: O }, from: { roof: [0, 110, 0] } },
  ];
  if (spec.roof === 'heavyweight')
    steps.push({ title: '装提手', ref: '说明书 第 3 页', note: '把嵌件放进顶盖，用 M6×50 螺栓 ×2 固定提手。', place: { handle: O }, from: { handle: [0, 90, 0] } });
  return steps;
}

function baseSteps(spec: Extract<UnitSpec, { type: 'base' }>): AsmStep[] {
  const steps: AsmStep[] = [{ title: '放好底座', ref: '改装 第 2 页', note: '底座正面朝上放平。', place: { base: O }, from: { base: [0, 80, 0] } }];
  if (spec.mode === 'wheels')
    steps.push({
      title: '装轮子', ref: '改装 第 1–7 步',
      note: '按长度切好 M16 连杆推入底座；用定位工装压上衬套（连杆露出 10mm），套圆盘、压 6205ZZ 轴承、卡 SCSAW 限位垫片，套上 TPU 轮胎，最后用盖板封住（每个轮子 6 颗 M4×25）。',
      place: { wheels: O }, from: { wheels: [0, 0, -140] },
    });
  steps.push({ title: '翻过来装支脚', ref: '改装 第 8 步', note: '把底座翻过来，用 M6×90 螺栓装上对应尺寸的支脚。', place: { feet: O }, from: { feet: [0, -100, 0] } });
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
