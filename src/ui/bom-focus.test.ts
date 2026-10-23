import { describe, expect, it } from 'vitest';
import { buildBom } from '../core/bom';
import { partsOf } from '../core/parts';
import type { Placement } from '../core/types';
import { partInstances } from '../scene/part-instances';
import { DEFAULT_PALETTE } from '../store';
import { bomFocus } from './bom-focus';

const units: Placement[] = [
  { id: 'a', spec: { type: 'drawer', width: 'L', depth: 4, height: 2, interior: 'empty' }, pos: [0, 0, 0] },
  { id: 'b', spec: { type: 'drawer', width: 'L', depth: 4, height: 2, interior: 'empty' }, pos: [400, 0, 0], colors: { 功能件: '10101' } },
];
const rows = buildBom(units, DEFAULT_PALETTE).rows;

describe('爆炸图反向定位打印清单', () => {
  it('独立实物编号映射到父零件文件，保留所选单件名称', () => {
    const part = partsOf(units[0].spec).find((p) => p.real === 'each' && p.split && p.files.length)!;
    const second = partInstances(part)[1];
    const focus = bomFocus(units, rows, 'a', second.id)!;
    expect(focus.name).toBe(second.name);
    expect(focus.name).toContain('2/2');
    expect(focus.rows.length).toBeGreaterThan(0);
    expect(focus.rows.every((r) => r.targets.some((t) => t.unitId === 'a' && t.partId === part.id))).toBe(true);
    expect(focus.rows.every((r) => r.colorId === DEFAULT_PALETTE[part.slot])).toBe(true);
  });

  it('正向清单聚焦父零件时仍能识别', () => {
    expect(bomFocus(units, rows, 'a', 'module')?.rows.map((r) => r.fileName)).toEqual(['L4 Module 2F.stl']);
  });

  it('五金不进打印清单，但仍显示所选单颗名称', () => {
    const focus = bomFocus(units, rows, 'a', 'bolts::1')!;
    expect(focus.name).toMatch(/M4×14.*1\//);
    expect(focus.rows).toEqual([]);
  });

  it('取消选择、退出爆炸图和无效编号均清除底部名称', () => {
    for (const [unit, part] of [['a', null], [null, 'module'], ['deleted', 'module'], ['a', 'missing'], ['a', 'module::999']] as const) {
      expect(bomFocus(units, rows, unit, part)).toBeNull();
    }
  });
});
