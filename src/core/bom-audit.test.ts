import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt } from './assembly';
import { buildBom } from './bom';
import { DEPTHS, heightsFor, ROOF_TYPES, WIDTHS } from './dims';
import { partsOf } from './parts';
import { UNDER_TABLE_SCREW } from './mounting';
import type { UnitSpec } from './types';
import { partInstances } from '../scene/part-instances';
import { DEFAULT_PALETTE } from '../store';

const specs: UnitSpec[] = [];
for (const width of WIDTHS) for (const depth of DEPTHS) {
  for (const height of heightsFor(width)) {
    for (const interior of ['empty', 'baseplate'] as const) specs.push({ type: 'drawer', width, depth, height, interior });
    for (const interior of ['flat', 'dividers', 'sealed'] as const) specs.push({ type: 'sustainer', width, depth, height, interior });
  }
  for (const roof of ROOF_TYPES) if (roof !== 'heavyweight' || width === 'L' || width === 'XL') specs.push({ type: 'roof', width, depth, roof });
  for (const mode of ['wheels', 'feet'] as const) specs.push({ type: 'base', width, depth, mode });
}

describe('五份说明书修复后的跨模块清单核对', () => {
  it('380 个规格没有多个 STL 隐藏在同一渲染组内，打印实物数量与独立实例数量一致', () => {
    expect(specs).toHaveLength(380);
    for (const spec of specs) for (const part of partsOf(spec)) {
      expect(part.files.length, `${spec.type}/${part.id}`).toBeLessThanOrEqual(1);
      if (!part.hardware && !part.tooling) {
        const printed = part.files.reduce((n, f) => n + f.qty * (f.pieces ?? 1), 0);
        expect(partInstances(part).length, `${spec.type}/${part.id}`).toBe(printed);
      }
    }
  });

  it('每个实物拥有唯一标注编号，所有装配件在最后一步归位', () => {
    for (const spec of specs) {
      const steps = assemblyOf(spec), keys = new Set<string>();
      for (const part of partsOf(spec).filter((p) => !p.tooling)) {
        expect(poseAt(steps, steps.length - 1, 1, part.id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
        for (const piece of partInstances(part)) {
          expect(keys.has(piece.id)).toBe(false);
          keys.add(piece.id);
          if (piece.count > 1) expect(piece.name.endsWith(`${piece.index + 1}/${piece.count}`)).toBe(true);
        }
      }
    }
  });

  it('同一方案的定位工装共用一份，两个推车的轮盘和五金仍分别累计', () => {
    const spec: UnitSpec = { type: 'base', width: 'S', depth: 5, mode: 'wheels' };
    const result = buildBom([0, 1].map((i) => ({ id: `b${i}`, spec, pos: [i * 500, 0, 0] })), DEFAULT_PALETTE);
    expect(result.rows.find((r) => r.fileName === 'Jig.stl')).toMatchObject({ qty: 1, piecesPerFile: 1, tooling: true });
    expect(result.rows.find((r) => r.fileName === 'Disk.stl')).toMatchObject({ qty: 4, piecesPerFile: 1 });
    expect(result.hardware['M4×25mm 螺栓']).toBe(24);
    expect(result.hardware['6205ZZ 轴承']).toBe(4);
  });

  it('桌下固定和栅格提手的五金进入汇总清单，保持与普通顶盖区分', () => {
    const specs: UnitSpec[] = [
      { type: 'roof', width: 'S', depth: 5, roof: 'underTable' },
      { type: 'roof', width: 'L', depth: 5, roof: 'grid' },
      { type: 'roof', width: 'L', depth: 5, roof: 'heavyweight' },
    ];
    const { rows, hardware } = buildBom(specs.map((spec, i) => ({ id: `r${i}`, spec, pos: [i * 500, 0, 0] })), DEFAULT_PALETTE);
    expect(hardware).toEqual({ [UNDER_TABLE_SCREW]: 12, 'M6×50mm 螺栓': 2 });
    expect(rows.find((r) => r.fileName === 'Heawyweight Roof Insert.stl')?.qty).toBe(2);
    expect(rows.find((r) => r.fileName === 'Top Handle (Turn On Supports).stl')?.qty).toBe(1);
    expect(rows.some((r) => /螺栓|螺钉/.test(r.fileName))).toBe(false);
  });
});
