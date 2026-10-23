import { describe, expect, it } from 'vitest';
import { resolveFile } from './catalog';
import { DEPTHS, heightsFor, ROOF_TYPES, WIDTH_MM, WIDTHS } from './dims';
import { assemblyOf, poseAt } from './assembly';
import { partsOf } from './parts';
import { boxOf, columnOf, dropOnGround, dropOnUnit, intersects, supportsOf } from './rules';
import { EXAMPLES } from '../data/examples';
import type { Placement, UnitSpec, Width } from './types';

const drawer = (width: Width, depth = 5, height: 1 | 2 | 4 = 1): UnitSpec => ({ type: 'drawer', width, depth: depth as 5, height, interior: 'empty' });
const at = (id: string, spec: UnitSpec, x: number, y = 0, z = 0): Placement => ({ id, spec, pos: [x, y, z] });

describe('放置规则', () => {
  it('同宽同深可以叠放', () => {
    const units = [at('a', drawer('S'), 0)];
    const r = dropOnUnit(drawer('S', 5, 2), units[0], 80, units);
    expect(r.ok).toBe(true);
    expect(r.pos).toEqual([0, 48, 0]);
  });

  it('深度不同拒绝', () => {
    const units = [at('a', drawer('S', 5), 0)];
    const r = dropOnUnit(drawer('S', 3), units[0], 80, units);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/深度/);
  });

  it('M 不能叠在 S 上', () => {
    const units = [at('a', drawer('S'), 0)];
    expect(dropOnUnit(drawer('M'), units[0], 80, units).reason).toMatch(/宽度/);
  });

  it('L 顶面可以放两个 S，按指针选择左右', () => {
    const units = [at('a', drawer('L'), 0)];
    expect(dropOnUnit(drawer('S'), units[0], 300, units).pos[0]).toBeCloseTo(WIDTH_MM.S);
    const withLeft = [...units, at('b', drawer('S'), 0, 48)];
    const r = dropOnUnit(drawer('S'), units[0], 10, withLeft);
    expect(r.ok).toBe(true);
    expect(r.pos[0]).toBeCloseTo(WIDTH_MM.S); // 左边被占，自动选右边
  });

  it('两个 1F 叠起来和一个 2F 等高，可以一起承托 L', () => {
    const units = [at('a', drawer('S'), 0), at('a2', drawer('S'), 0, 48), at('b', drawer('S', 5, 2), WIDTH_MM.S)];
    expect(dropOnUnit(drawer('L'), units[1], 100, units)).toMatchObject({ ok: true, pos: [0, 96, 0] });
  });

  it('并排的两个 S 可以承托一个 L；高度不同则不行', () => {
    const units = [at('a', drawer('S'), 0), at('b', drawer('S'), WIDTH_MM.S)];
    expect(dropOnUnit(drawer('L'), units[1], 200, units)).toMatchObject({ ok: true, pos: [0, 48, 0] });
    const uneven = [at('a', drawer('S'), 0), at('b', drawer('S', 5, 2), WIDTH_MM.S)];
    expect(dropOnUnit(drawer('L'), uneven[0], 100, uneven).ok).toBe(false);
  });

  it('S + M 并排可以承托 XL', () => {
    const units = [at('a', drawer('S'), 0), at('b', drawer('M'), WIDTH_MM.S)];
    expect(dropOnUnit(drawer('XL'), units[0], 100, units).ok).toBe(true);
  });

  it('底座只能放在地面，上面可以叠同宽同深的单元', () => {
    const base: UnitSpec = { type: 'base', width: 'L', depth: 5, mode: 'wheels' };
    const units = [at('b', base, 0)];
    expect(dropOnUnit(base, units[0], 100, units).ok).toBe(false);
    const r = dropOnUnit(drawer('L', 5, 2), units[0], 100, units);
    expect(r.ok).toBe(true);
    expect(r.pos[1]).toBeCloseTo(123.2);
    expect(dropOnUnit(drawer('S'), units[0], 10, units).ok).toBe(true);
  });

  it('顶盖上不能再叠', () => {
    const roof: UnitSpec = { type: 'roof', width: 'S', depth: 5, roof: 'grid' };
    const units = [at('a', drawer('S'), 0), at('r', roof, 0, 48)];
    expect(dropOnUnit(drawer('S'), units[1], 80, units).ok).toBe(false);
  });

  it('地面重叠拒绝，靠近时吸附', () => {
    const units = [at('a', drawer('S'), 0, 0, -115)];
    expect(dropOnGround(drawer('S'), [80, 0], units).ok).toBe(false);
    const r = dropOnGround(drawer('S'), [WIDTH_MM.S + 90, 0], units);
    expect(r.ok).toBe(true);
    expect(r.pos[0]).toBeCloseTo(WIDTH_MM.S);
  });

  it('跨在两个单元上的 L 会阻止单独拖走其中一个 S', () => {
    const units = [at('a', drawer('S'), 0), at('b', drawer('S'), WIDTH_MM.S), at('c', drawer('L'), 0, 48)];
    expect(columnOf('a', units).blocked).toBeTruthy();
    expect(columnOf('c', units)).toEqual({ ids: ['c'] });
  });
});

describe('打印文件解析', () => {
  const specs: UnitSpec[] = [];
  for (const width of WIDTHS)
    for (const depth of DEPTHS) {
      for (const height of heightsFor(width)) {
        specs.push({ type: 'drawer', width, depth, height, interior: 'baseplate' });
        for (const interior of ['flat', 'dividers', 'sealed'] as const) specs.push({ type: 'sustainer', width, depth, height, interior });
      }
      for (const roof of ROOF_TYPES) if (roof !== 'heavyweight' || width === 'L' || width === 'XL') specs.push({ type: 'roof', width, depth, roof });
      for (const mode of ['wheels', 'feet'] as const) specs.push({ type: 'base', width, depth, mode });
    }

  it('所有规格的零件都能在模型包里找到', () => {
    const missing = specs.flatMap((s) => partsOf(s).flatMap((p) => p.files.filter((f) => !resolveFile(f.path)).map((f) => f.path)));
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('示例方案', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name}：不重叠，且每个悬空单元都有支撑`, () => {
      const units = ex.build();
      for (const a of units) for (const b of units) if (a !== b) expect(intersects(boxOf(a), boxOf(b))).toBe(false);
      for (const u of units) if (u.pos[1] > 0) expect(supportsOf(u, units).length).toBeGreaterThan(0);
    });
  }
});

describe('零件数量', () => {
  const qtyOf = (spec: UnitSpec, name: string) =>
    partsOf(spec).flatMap((p) => p.files).filter((f) => f.path.includes(name)).reduce((n, f) => n + f.qty, 0);

  it('左右成对的零件已合在一个文件里，每个单元只打 1 份', () => {
    // 实测：导槽、滑块、下铰链、L-XL 上铰链、连杆的打印文件里都并排放着两件
    expect(qtyOf(drawer('S'), 'Runner Guides')).toBe(1);
    expect(qtyOf(drawer('XL'), 'Runner Slides')).toBe(1);
    expect(qtyOf(drawer('S'), 'Runner Stopper')).toBe(2);
    const sus = (width: Width): UnitSpec => ({ type: 'sustainer', width, depth: 5, height: 2, interior: 'flat' });
    expect(qtyOf(sus('S'), 'Hinges/S-M 2-4F Hinge')).toBe(1);
    expect(qtyOf(sus('L'), 'Hinge Top')).toBe(1);
  });

  it('拆件显示的零件，代理块数等于文件里的件数', () => {
    for (const p of [...partsOf(drawer('M')), ...partsOf({ type: 'sustainer', width: 'L', depth: 5, height: 1, interior: 'flat' })])
      if (p.split) expect(p.blocks.length).toBe(2);
  });
});

describe('安装流程', () => {
  const specs: UnitSpec[] = [
    drawer('S'), drawer('M', 5, 2), { type: 'drawer', width: 'L', depth: 5, height: 4, interior: 'baseplate' },
    { type: 'sustainer', width: 'S', depth: 5, height: 2, interior: 'flat' },
    { type: 'sustainer', width: 'L', depth: 5, height: 1, interior: 'dividers' },
    { type: 'roof', width: 'L', depth: 5, roof: 'heavyweight' },
    { type: 'base', width: 'M', depth: 5, mode: 'wheels' },
    { type: 'base', width: 'S', depth: 5, mode: 'feet' },
  ];

  it('最后一步播完，每个零件都在装好的位置', () => {
    for (const spec of specs) {
      const steps = assemblyOf(spec);
      for (const part of partsOf(spec)) {
        const pose = poseAt(steps, steps.length - 1, 1, part.id);
        expect(pose.visible, `${spec.type} ${part.id}`).toBe(true);
        expect(pose.offset, `${spec.type} ${part.id}`).toEqual([0, 0, 0]);
      }
    }
  });

  it('零件在第一次被放置之前不显示，进场时从 from 的位置飞过来', () => {
    const steps = assemblyOf(drawer('S'));
    expect(poseAt(steps, 0, 0, 'module').visible).toBe(false);
    const enter = poseAt(steps, 0, 0, 'key');
    expect(enter.visible).toBe(true);
    expect(enter.offset[2]).toBeGreaterThan(poseAt(steps, 0, 1, 'key').offset[2]);
  });
});

describe('面板螺栓', () => {
  it('螺栓数按实测沉孔数，面板盖 = 孔数 − 被标签盖住的 1 个', () => {
    const n = (spec: UnitSpec) => ({
      bolts: partsOf(spec).find((p) => p.id === 'bolts')!.blocks.length / 2,
      caps: partsOf(spec).find((p) => p.id === 'caps')!.files[0].qty,
    });
    expect(n(drawer('S'))).toEqual({ bolts: 2, caps: 1 });
    expect(n(drawer('S', 5, 2))).toEqual({ bolts: 4, caps: 3 });
    expect(n(drawer('M'))).toEqual({ bolts: 4, caps: 3 });
    expect(n(drawer('L', 5, 4))).toEqual({ bolts: 6, caps: 5 });
  });
});
