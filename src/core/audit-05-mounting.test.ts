import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt } from './assembly';
import { resolveFile } from './catalog';
import { DEPTHS, WIDTHS } from './dims';
import { mountingHardwareOf, UNDER_TABLE_SCREW, underTableHoles } from './mounting';
import { partsOf } from './parts';
import type { UnitSpec } from './types';

type Roof = Extract<UnitSpec, { type: 'roof' }>;
// 从模型包 20 个 STL 各自 15 mm 横截面中检测闭合 Ø4.4 通孔得到，不能用 PDF 的 S3 图示替代。
const MEASURED = { S: [7, 9, 12, 14, 17], M: [7, 9, 12, 14, 17], L: [14, 18, 24, 28, 34], XL: [14, 18, 24, 28, 34] };

describe('05 安装说明：已支持的桌下顶盖', () => {
  it('20 款固定孔与 STL 实测孔数一致，并为每个孔提供一颗规格可选的五金', () => {
    for (const width of WIDTHS) for (const [i, depth] of DEPTHS.entries()) {
      const spec: Roof = { type: 'roof', width, depth, roof: 'underTable' };
      const holes = underTableHoles(spec), qty = MEASURED[width][i];
      expect(holes).toHaveLength(qty);
      expect(new Set(holes.map(([x, z]) => `${x},${z}`)).size).toBe(qty);
      expect(mountingHardwareOf(spec)).toEqual({ [UNDER_TABLE_SCREW]: qty });
      const parts = partsOf(spec), screws = parts.find((p) => p.id === 'mounting-screws')!;
      expect(screws.hardware).toBe(true);
      expect(screws.blocks).toHaveLength(qty);
      expect(screws.files).toEqual([]);
      expect(resolveFile(parts[0].files[0].path)).toBeTruthy();
    }
  });

  it('桌下安装先固定到桌板再滑入模组，最终五金可见且到位', () => {
    const spec: Roof = { type: 'roof', width: 'S', depth: 5, roof: 'underTable' };
    const steps = assemblyOf(spec);
    expect(steps[0].note).toContain('×12');
    expect(steps[0].ref).toContain('10–11');
    expect(steps[1].note).toContain('卡扣随模组清单提供');
    expect(poseAt(steps, steps.length - 1, 1, 'mounting-screws')).toMatchObject({ visible: true, offset: [0, 0, 0] });
  });

  it('未选择桌下顶盖时不添加安装选件，也不重复计入可选嵌件、墙挂与洞洞板', () => {
    for (const roof of ['grid', 'table', 'bowl', 'heavyweight'] as const) {
      const spec: Roof = { type: 'roof', width: 'L', depth: 5, roof };
      expect(mountingHardwareOf(spec)).toEqual({});
      expect(underTableHoles(spec)).toEqual([]);
      expect(partsOf(spec).some((p) => p.id === 'mounting-screws')).toBe(false);
    }
    expect(mountingHardwareOf({ type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' })).toEqual({});
  });
});
