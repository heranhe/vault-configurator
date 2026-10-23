// 放置规则引擎：纯函数，3D 拖放、点击放置、删除都调用这里
import { dimsOf, NEST_MM, WIDTH_MM } from './dims';
import type { Placement, UnitSpec, Vec3, Width } from './types';

const EPS = 0.6; // mm，拼接容差
const GROUND_SNAP = 25; // mm，地面上靠近其他单元侧面时吸附
const PUSH_SNAP = 90; // mm，与其他单元重叠不多时，自动推到贴靠位置

export type Box = { x: number; y: number; z: number; w: number; h: number; d: number };
export type Drop = { pos: Vec3; ok: boolean; reason?: string; hint?: string };

/** 占位盒：高度扣掉顶部嵌套凸台，上一层直接压在 y + 48F 处（碰撞和叠放都用它） */
export const boxOf = (p: Placement): Box => solidBox(p.spec, p.pos);
const solidBox = (spec: UnitSpec, pos: Vec3): Box => {
  const { w, h, d } = dimsOf(spec);
  return { x: pos[0], y: pos[1], z: pos[2], w, h: spec.type === 'roof' ? h : h - NEST_MM, d };
};

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - EPS && b0 < a1 - EPS;
export const intersects = (a: Box, b: Box) =>
  overlap1(a.x, a.x + a.w, b.x, b.x + b.w) &&
  overlap1(a.y, a.y + a.h, b.y, b.y + b.h) &&
  overlap1(a.z, a.z + a.d, b.z, b.z + b.d);

const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const label = (s: UnitSpec) => `${s.width}${s.depth}`;

/**
 * 上方单元 upper 叠在下方单元 lower 顶面时，upper 相对 lower 左边缘的合法 X 偏移。
 * 规则（说明书第 8 页）：同宽直接叠；L = S+S，XL = S+M，所以 L 顶面可放两个 S，XL 顶面可放 S 和 M。
 * 【待确认】XL 上的 S、M 能否左右互换。这里假设可以。
 */
export function stackOffsets(lower: Width, upper: Width): number[] {
  if (lower === upper) return [0];
  const S = WIDTH_MM.S, M = WIDTH_MM.M;
  if (lower === 'L' && upper === 'S') return [0, S];
  if (lower === 'XL' && upper === 'S') return [0, M];
  if (lower === 'XL' && upper === 'M') return [0, S];
  return [];
}

/** 两个并排单元合起来能承托的宽度：S+S → L，S+M / M+S → XL */
function pairWidth(a: Width, b: Width): Width | null {
  if (a === 'S' && b === 'S') return 'L';
  if ((a === 'S' && b === 'M') || (a === 'M' && b === 'S')) return 'XL';
  return null;
}

type Socket = { pos: Vec3; supports: string[] };

/** spec 叠放到单元 u（以及 u 参与组成的并排对）顶面的所有插槽 */
function socketsOn(spec: UnitSpec, u: Placement, others: Placement[]): Socket[] {
  if (u.spec.type === 'roof' || u.spec.depth !== spec.depth) return [];
  const b = boxOf(u);
  const top = b.y + b.h;
  const out: Socket[] = stackOffsets(u.spec.width, spec.width).map((dx) => ({
    pos: [b.x + dx, top, b.z],
    supports: [u.id],
  }));
  // 并排对：u 与左右紧贴、等高、同深、前后对齐的邻居
  for (const v of others) {
    if (v.id === u.id || v.spec.type === 'roof' || v.spec.depth !== spec.depth) continue;
    const c = boxOf(v);
    if (!near(c.y + c.h, top) || !near(c.z, b.z)) continue;
    const [left, right, lw, rw] = near(b.x + b.w, c.x)
      ? [b, c, u.spec.width, v.spec.width]
      : near(c.x + c.w, b.x)
        ? [c, b, v.spec.width, u.spec.width]
        : [null, null, null, null];
    if (!left || !right || !lw || !rw) continue;
    if (pairWidth(lw, rw) === spec.width) out.push({ pos: [left.x, top, b.z], supports: [u.id, v.id] });
  }
  return out;
}

function widthReason(spec: UnitSpec, u: Placement) {
  const need =
    spec.width === 'L' ? 'L 只能叠在 L 上，或叠在并排的两个 S 上'
    : spec.width === 'XL' ? 'XL 只能叠在 XL 上，或叠在并排的 S + M 上'
    : `${spec.width} 只能叠在 ${spec.width}${spec.width === 'S' ? '、L、XL' : '、XL'} 上`;
  return `宽度不匹配：${need}（下方是 ${u.spec.width}）`;
}

const collides = (box: Box, units: Placement[]) => units.some((o) => intersects(box, boxOf(o)));

/** 指针悬停在某个单元上：找它顶面最近的合法插槽，否则给出原因 */
export function dropOnUnit(spec: UnitSpec, target: Placement, pointX: number, units: Placement[]): Drop {
  const { w, h, d } = solidBox(spec, [0, 0, 0]);
  const tb = boxOf(target);
  const fallback: Vec3 = [Math.min(Math.max(pointX - w / 2, tb.x), tb.x + tb.w - w), tb.y + tb.h, tb.z];
  if (spec.type === 'base') return { pos: fallback, ok: false, reason: '底座只能放在地面，作为一座塔的最底层' };
  if (spec.type === 'roof' && target.spec.type === 'roof') return { pos: fallback, ok: false, reason: '顶盖上不能再叠放' };
  if (target.spec.type === 'roof') return { pos: fallback, ok: false, reason: '已有顶盖，不能再往上叠' };
  if (target.spec.depth !== spec.depth)
    return { pos: fallback, ok: false, reason: `深度不同：${label(spec)} 不能放在 ${label(target.spec)} 上（深度必须一致）` };

  const sockets = socketsOn(spec, target, units);
  if (!sockets.length) return { pos: fallback, ok: false, reason: widthReason(spec, target) };

  const sorted = sockets
    .map((s) => ({ s, dist: Math.abs(s.pos[0] + w / 2 - pointX) }))
    .sort((a, b) => a.dist - b.dist);
  for (const { s } of sorted) {
    if (!collides({ x: s.pos[0], y: s.pos[1], z: s.pos[2], w, h, d }, units)) {
      const names = s.supports.map((id) => units.find((u) => u.id === id)!).map((u) => label(u.spec));
      return { pos: s.pos, ok: true, hint: `叠放在 ${names.join(' + ')} 上` };
    }
  }
  return { pos: sorted[0].s.pos, ok: false, reason: '这个位置已经被占用' };
}

/** 指针在地面上：自由摆放，靠近其他单元侧面时吸附对齐 */
export function dropOnGround(spec: UnitSpec, point: [number, number], units: Placement[]): Drop {
  const { w, h, d } = solidBox(spec, [0, 0, 0]);
  let x = Math.round(point[0] - w / 2);
  let z = Math.round(point[1] - d / 2);
  let snapped = false;
  for (const o of units) {
    const b = boxOf(o);
    const xs = [b.x + b.w, b.x - w, b.x, b.x + b.w - w];
    for (const cand of xs) if (Math.abs(cand - x) < GROUND_SNAP) { x = cand; snapped = true; break; }
    const zs = [b.z, b.z + b.d - d, b.z + b.d, b.z - d];
    for (const cand of zs) if (Math.abs(cand - z) < GROUND_SNAP) { z = cand; snapped = true; break; }
  }
  if (spec.type === 'roof') return { pos: [x, 0, z], ok: false, reason: '顶盖要放在单元顶上，不能直接放在地面' };
  if (!collides({ x, y: 0, z, w, h, d }, units)) return { pos: [x, 0, z], ok: true, hint: snapped ? '已贴靠相邻单元' : undefined };

  // 重叠时把它「推」到最近的贴靠位置（磁吸），太远就判为重叠
  let best: { pos: Vec3; dist: number } | null = null;
  for (const o of units) {
    const b = boxOf(o);
    if (!intersects({ x, y: 0, z, w, h, d }, b)) continue;
    const cands: Vec3[] = [[b.x + b.w, 0, z], [b.x - w, 0, z], [x, 0, b.z + b.d], [x, 0, b.z - d]];
    for (const c of cands) {
      const dist = Math.hypot(c[0] - x, c[2] - z);
      if (dist < PUSH_SNAP && !collides({ x: c[0], y: 0, z: c[2], w, h, d }, units) && (!best || dist < best.dist)) best = { pos: c, dist };
    }
  }
  if (best) return { pos: best.pos, ok: true, hint: '已贴靠相邻单元' };
  return { pos: [x, 0, z], ok: false, reason: '与其他单元重叠' };
}

/** 直接压在 p 顶面上的单元 */
export function unitsOn(p: Placement, units: Placement[]) {
  const b = boxOf(p);
  return units.filter((o) => {
    if (o.id === p.id) return false;
    const c = boxOf(o);
    return near(c.y, b.y + b.h) && overlap1(c.x, c.x + c.w, b.x, b.x + b.w) && overlap1(c.z, c.z + c.d, b.z, b.z + b.d);
  });
}

/** 直接承托 p 的单元 */
export function supportsOf(p: Placement, units: Placement[]) {
  return units.filter((o) => o.id !== p.id && unitsOn(o, units).some((x) => x.id === p.id));
}

/**
 * 拖动或删除 id 时会一起带走的整列（它自己 + 上方叠放的所有单元）。
 * 如果上方某个单元同时压在列外的单元上（比如 L 跨在两个 S 上），返回 blocked。
 */
export function columnOf(id: string, units: Placement[]): { ids: string[]; blocked?: string } {
  const ids = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const curId = queue.shift();
    const cur = units.find((u) => u.id === curId)!;
    for (const up of unitsOn(cur, units)) if (!ids.has(up.id)) { ids.add(up.id); queue.push(up.id); }
  }
  for (const uid of ids) {
    if (uid === id) continue;
    const u = units.find((x) => x.id === uid)!;
    if (supportsOf(u, units).some((s) => !ids.has(s.id)))
      return { ids: [...ids], blocked: `上方的 ${label(u.spec)} 同时压在别的单元上，请先移开它` };
  }
  return { ids: [...ids] };
}

/** 点击零件库卡片时的自动放置：优先叠在选中单元上，否则放在地面最右侧 */
export function autoPlace(spec: UnitSpec, units: Placement[], selectedId?: string | null): Drop {
  const sel = units.find((u) => u.id === selectedId);
  if (sel) {
    // 沿整列往上找到顶部
    let top = sel;
    for (;;) { const up = unitsOn(top, units)[0]; if (!up) break; top = up; }
    const b = boxOf(top);
    const r = dropOnUnit(spec, top, b.x + b.w / 2, units);
    if (r.ok || spec.type === 'roof') return r;
  }
  const { w, d } = dimsOf(spec);
  if (spec.type === 'roof') return { pos: [0, 0, -d / 2], ok: false, reason: '先选中一座塔，再点顶盖' };
  const maxX = Math.max(-Infinity, ...units.map((u) => boxOf(u).x + boxOf(u).w));
  const x = units.length ? maxX + 40 : -w / 2;
  return { pos: [x, 0, -d / 2], ok: true };
}
