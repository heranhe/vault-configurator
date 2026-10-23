import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt } from './assembly';
import { buildBom } from './bom';
import { resolveFile } from './catalog';
import { DEPTHS, HEIGHTS } from './dims';
import { hardwareOf, partsOf } from './parts';
import { COLOR_SLOTS, type ColorSlot, type UnitSpec } from './types';

type Sustainer = Extract<UnitSpec, { type: 'sustainer' }>;
const make = (width: Sustainer['width'], depth: Sustainer['depth'], interior: Sustainer['interior'], extra: Partial<Sustainer> = {}): Sustainer => ({ type: 'sustainer', width, depth, height: 1, interior, ...extra });
const palette = Object.fromEntries(COLOR_SLOTS.map((s) => [s, '10100'])) as Record<ColorSlot, string>;

describe('03 收纳箱说明书逐件审计回归', () => {
  it.each(DEPTHS)('%i 深默认分隔片数量对应实际槽位，每种 STL 单独显示', (depth) => {
    const rows = depth === 3 ? 3 : depth - 1;
    for (const width of ['L', 'XL'] as const) {
      const inner = partsOf(make(width, depth, 'dividers')).filter((p) => p.slot === '内衬');
      expect(inner.map((p) => [p.id, p.files[0].qty, p.blocks.length])).toEqual([
        ['depth-dividers', 2, 2], ['width-dividers', rows, rows],
      ]);
      for (const p of inner) {
        expect(p.files).toHaveLength(1);
        expect(p.real).toBe('each');
        expect(p.name).toContain('默认满配，可按需减少');
        expect(resolveFile(p.files[0].path)).toBeDefined();
      }
    }
  });

  it.each(DEPTHS)('%i 深密封款只增加横向小片，集成隔墙不重复打印', (depth) => {
    for (const width of ['L', 'XL'] as const) {
      const rows = width === 'L' ? depth - 1 : depth === 3 ? 3 : depth - 1;
      const spec = make(width, depth, 'sealed');
      const inner = partsOf(spec).filter((p) => p.slot === '内衬');
      expect(inner.reduce((sum, p) => sum + p.blocks.length, 0)).toBe(rows * (width === 'L' ? 2 : 3));
      for (const p of inner) {
        expect(p.files).toHaveLength(1);
        expect(p.blocks).toHaveLength(p.files[0].qty);
        expect(p.real).toBe('each');
        expect(resolveFile(p.files[0].path)).toBeDefined();
      }
      const bom = buildBom([{ id: 'sustainer', pos: [0, 0, 0], spec }], palette);
      const printedInner = bom.rows.filter((r) => r.path.includes('Seal Divider'));
      expect(printedInner.reduce((sum, r) => sum + r.qty * r.piecesPerFile, 0)).toBe(rows * (width === 'L' ? 2 : 3));
    }
  });

  it('按需分隔数量真正改变打印份数和预览，零片不生成空 part', () => {
    const spec = make('L', 5, 'dividers', { dividerCount: 1, depthDividerCount: 1 });
    expect(partsOf(spec).filter((p) => p.slot === '内衬').map((p) => p.files[0].qty)).toEqual([1, 1]);
    expect(partsOf({ ...spec, dividerCount: 0, depthDividerCount: 0 }).some((p) => p.slot === '内衬')).toBe(false);
    expect(partsOf(make('XL', 3, 'sealed', { dividerCount: 1 })).filter((p) => p.slot === '内衬').map((p) => p.files[0].qty)).toEqual([2, 1]);
    expect(partsOf({ ...spec, dividerCount: -1, depthDividerCount: Infinity }).filter((p) => p.slot === '内衬').map((p) => p.files[0].qty)).toEqual([2]);
  });

  it('动画里的 M4 螺栓数量与五金采购清单一致，并在对应步骤出现', () => {
    for (const width of ['S', 'M', 'L', 'XL'] as const) {
      const spec = make(width, 5, 'flat');
      const parts = partsOf(spec), steps = assemblyOf(spec), hardware = hardwareOf(spec);
      const qty = (id: string) => parts.find((p) => p.id === id)!.blocks.length / 2;
      expect(qty('lock-bolts') + qty('roof-bolts')).toBe(hardware['M4×14mm 螺栓']);
      expect(qty('hinge-bolts')).toBe(hardware['M4×10mm 螺栓']);
      expect(qty('bolts')).toBe(hardware['M4×20mm 螺栓']);
      expect(poseAt(steps, 0, 1, 'lock-bolts').visible).toBe(false);
      expect(poseAt(steps, 1, 1, 'lock-bolts').visible).toBe(true);
      expect(poseAt(steps, 2, 1, 'roof-bolts').offset).toEqual(poseAt(steps, 2, 1, 'roof').offset);
      expect(poseAt(steps, 3, 1, 'hinge-bolts').visible).toBe(true);
    }
  });

  it('每种内衬、宽深高的所有零件，在动画最后都出现并归位', () => {
    for (const width of ['S', 'M', 'L', 'XL'] as const)
      for (const depth of DEPTHS)
        for (const height of width === 'XL' ? [1] as const : HEIGHTS)
          for (const interior of ['flat', 'dividers', 'sealed'] as const) {
            const spec = make(width, depth, interior, { height });
            const steps = assemblyOf(spec);
            for (const p of partsOf(spec)) expect(poseAt(steps, steps.length - 1, 1, p.id), `${width}${depth} ${height}F ${interior} ${p.id}`).toMatchObject({ visible: true, offset: [0, 0, 0] });
          }
  });
});
