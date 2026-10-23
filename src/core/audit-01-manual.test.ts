import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt } from './assembly';
import { resolveFile } from './catalog';
import { DEPTHS, WIDTHS } from './dims';
import { partsOf } from './parts';
import type { UnitSpec } from './types';

const roof = (kind: 'grid' | 'heavyweight'): UnitSpec => ({ type: 'roof', width: 'L', depth: 5, roof: kind });

describe('01 总说明书：顶盖装配零件核查', () => {
  it('栅格顶盖按第 10、11、18 页包含一个需要支撑的提手和两颗外购螺栓', () => {
    for (const width of WIDTHS) for (const depth of DEPTHS) {
      const parts = partsOf({ type: 'roof', width, depth, roof: 'grid' });
      const handle = parts.find((p) => p.id === 'handle')!;
      expect(handle.files).toEqual([{ path: '01. DRAWERS/07. Universal/Top Handle (Turn On Supports).stl', qty: 1, supports: true }]);
      expect(resolveFile(handle.files[0].path)).toBeTruthy();
      const bolts = parts.find((p) => p.id === 'handle-bolts')!;
      expect(bolts.hardware).toBe(true);
      expect(bolts.blocks).toHaveLength(2);
      expect(bolts.files).toHaveLength(0);
    }
  });

  it('加重顶盖一只圆柱握把、两只嵌件，嵌件单独建模，不再标数量待确认', () => {
    const parts = partsOf(roof('heavyweight'));
    const grip = parts.find((p) => p.id === 'handle')!;
    const inserts = parts.find((p) => p.id === 'handle-inserts')!;
    expect(grip.files).toEqual([{ path: '01. DRAWERS/07. Universal/Heawyweight Roof Handle.stl', qty: 1 }]);
    expect(inserts.files).toEqual([{ path: '01. DRAWERS/07. Universal/Heawyweight Roof Insert.stl', qty: 2 }]);
    expect(inserts.real).toBe('each');
    expect(inserts.blocks).toHaveLength(2);
    expect(parts.find((p) => p.id === 'roof')!.blocks[0].size[1]).toBeCloseTo(88.3);
    expect(assemblyOf(roof('heavyweight')).some((s) => /M6/.test(s.note))).toBe(false);
  });

  it('新增提手及嵌件都在流程指定步骤进场，并在最终状态装配到位', () => {
    for (const kind of ['grid', 'heavyweight'] as const) {
      const spec = roof(kind), steps = assemblyOf(spec);
      const ids = partsOf(spec).filter((p) => p.id !== 'roof').map((p) => p.id);
      for (const id of ids) {
        expect(poseAt(steps, 0, 1, id).visible).toBe(false);
        expect(poseAt(steps, steps.length - 1, 1, id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
      }
    }
  });
});
