import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt } from './assembly';
import { resolveFile } from './catalog';
import { DEPTHS, WIDTHS } from './dims';
import { hardwareOf, partsOf } from './parts';
import type { UnitSpec } from './types';

// 04_Modifications.pdf 第 2–6 页（步骤 1–8），并逐一核对原始 STL 连通件。
describe('04 改装说明书零件审计', () => {
  for (const width of WIDTHS) for (const depth of DEPTHS) {
    const cart: UnitSpec = { type: 'base', width, depth, mode: 'wheels' };
    const stationary: UnitSpec = { ...cart, mode: 'feet' };
    it(`${width}${depth} 双轮底座：每侧四件，工装一件，各文件独立显示`, () => {
      const parts = partsOf(cart);
      for (const name of ['Bushing.stl', 'Disk.stl', 'Tyre (TPU).stl', 'Cover.stl']) {
        const part = parts.find((p) => p.files.some((f) => f.path.endsWith(`/${name}`)))!;
        expect(part.files).toHaveLength(1);
        expect(part.files[0].qty).toBe(2);
        expect(part.files[0].pieces ?? 1).toBe(1);
        expect(part.files[0].uncertain).not.toBe(true);
        expect(part.real).toBe('each');
        expect(part.blocks).toHaveLength(2);
      }
      const jig = parts.find((p) => p.tooling)!;
      expect(jig.files).toEqual([{ path: '03. MODIFICATIONS/Wheels/Jig.stl', qty: 1 }]);
      expect(parts.find((p) => p.id === 'feet')!.files[0].qty).toBe(1);
      for (const part of parts) for (const file of part.files) expect(resolveFile(file.path), file.path).toBeTruthy();
      const steps = assemblyOf(cart);
      for (const part of parts.filter((p) => !p.tooling)) {
        expect(steps.some((s) => s.place[part.id]), part.id).toBe(true);
        expect(poseAt(steps, steps.length - 1, 1, part.id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
      }
    });
    it(`${width}${depth} 支脚底座：两份单件支脚，没有轮组或轮组五金`, () => {
      const parts = partsOf(stationary);
      expect(parts.filter((p) => !p.hardware).map((p) => p.id)).toEqual(['base', 'feet']);
      const feet = parts.find((p) => p.id === 'feet')!;
      expect(feet.files[0].qty).toBe(2);
      expect(feet.files[0].pieces ?? 1).toBe(1);
      expect(feet.blocks).toHaveLength(2);
      expect(hardwareOf(stationary)).toEqual({ 'M6×90mm 螺栓': 4 });
    });
  }
  it('轮轴随宽度裁切，两个轮子各一轴承/锁紧环、六颗外盖螺栓', () => {
    const lengths = { S: 248, M: 338, L: 414, XL: 504 };
    for (const width of WIDTHS) {
      const hw = hardwareOf({ type: 'base', width, depth: 5, mode: 'wheels' });
      expect(hw).toEqual({
        'M6×90mm 螺栓': 2,
        [`Ø16mm 轮轴杆 ${lengths[width]}mm`]: 1,
        'M4×25mm 螺栓': 12,
        '6205ZZ 轴承': 2,
        'SCSAW 轴锁紧环（内径16/外径30/厚10mm）': 2,
      });
    }
  });
});
