import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt } from './assembly';
import { bomCsv, buildBom } from './bom';
import { resolveFile } from './catalog';
import { DEPTHS, heightsFor, WIDTHS } from './dims';
import { partsOf } from './parts';
import type { UnitSpec } from './types';
import { DEFAULT_PALETTE } from '../store';
import { instanceAssemblySteps, partInstances } from '../scene/part-instances';

type Drawer = Extract<UnitSpec, { type: 'drawer' }>;
const spec: Drawer = { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' };
const bom = (specs: Drawer[]) => buildBom(specs.map((s, i) => ({ id: `d${i}`, spec: s, pos: [i * 500, 0, 0] })), DEFAULT_PALETTE);

describe('02 抽屉说明书逐步核对', () => {
  it('每个宽度和深度均匹配齿条、左右滑块、导槽及两颗独立限位块', () => {
    for (const width of WIDTHS) for (const depth of DEPTHS) for (const height of heightsFor(width)) {
      const current: Drawer = { ...spec, width, depth, height };
      const parts = partsOf(current);
      const rails = parts.find((p) => p.id === 'geared-rails')!;
      expect(resolveFile(rails.files[0].path)?.p).toContain(`/${width} Rails.stl`);
      for (const id of ['geared-rails', 'runners', 'runner-slides']) {
        const p = parts.find((p) => p.id === id)!;
        expect(p.files).toHaveLength(1);
        expect(p.files[0]).toMatchObject({ qty: 1, pieces: 2 });
        expect(p.blocks).toHaveLength(2);
      }
      const stoppers = parts.find((p) => p.id === 'runner-stoppers')!;
      expect(stoppers.files).toHaveLength(1);
      expect(stoppers.files[0].qty).toBe(2);
      expect(stoppers.blocks).toHaveLength(2);
    }
  });

  it('独立显示钥匙帽，卡扣数量确定为一件，手动支撑不作为装配件重复打印', () => {
    const parts = partsOf(spec);
    expect(parts.find((p) => p.id === 'key')!.files).toHaveLength(1);
    expect(parts.find((p) => p.id === 'key-cap')!.files[0]).toMatchObject({ qty: 1 });
    expect(parts.find((p) => p.id === 'latch')!.files[0]).toMatchObject({ qty: 1 });
    expect(parts.find((p) => p.id === 'latch')!.files[0].uncertain).toBeUndefined();
    expect(parts.some((p) => /support/i.test(p.id))).toBe(false);
  });

  it('一个抽屉只打一套上下齿条，关掉可选项后清单、CSV、预览与步骤同时移除', () => {
    const enabled = bom([spec]).rows;
    const rail = enabled.find((r) => r.path.includes('Geared Rails'))!;
    expect(rail).toMatchObject({ qty: 1, piecesPerFile: 2, colorId: DEFAULT_PALETTE.功能件 });
    expect(rail.targets).toEqual([{ unitId: 'd0', partId: 'geared-rails' }]);
    const disabled: Drawer = { ...spec, gearedRails: false };
    const result = bom([disabled]);
    expect(result.rows.some((r) => r.path.includes('Geared Rails'))).toBe(false);
    expect(bomCsv(result.rows, result.hardware)).not.toContain('Rails.stl');
    expect(partsOf(disabled).some((p) => p.id === 'geared-rails')).toBe(false);
    expect(assemblyOf(disabled).some((s) => s.place['geared-rails'])).toBe(false);
  });

  it('多个同宽抽屉合并打印份数，保持每份两根齿条、单件限位块各两份', () => {
    const rows = bom([spec, { ...spec, height: 2 }, { ...spec, gearedRails: false }]).rows;
    expect(rows.find((r) => r.path.includes('Geared Rails'))).toMatchObject({ qty: 2, piecesPerFile: 2 });
    expect(rows.find((r) => r.fileName === 'Runner Stopper.stl')).toMatchObject({ qty: 6, piecesPerFile: 1 });
  });

  it('按步骤2/5/6/9/11分别装钥匙帽、齿条、滑块、导槽与限位块，最后全部归位', () => {
    const steps = assemblyOf(spec);
    for (const [id, ref] of [['key-cap', '2'], ['geared-rails', '5'], ['runner-slides', '6'], ['runners', '9'], ['runner-stoppers', '11']]) {
      const first = steps.findIndex((s) => s.place[id]);
      expect(steps[first].ref).toBe(`抽屉组装 第 ${ref} 步`);
      expect(poseAt(steps, first - 1, 1, id).visible).toBe(false);
      expect(poseAt(steps, first, 1, id).visible).toBe(true);
    }
    for (const p of partsOf(spec)) expect(poseAt(steps, steps.length - 1, 1, p.id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
  });

  it('盒体推进后先从左右装入两颗限位块，再安装底部卡扣', () => {
    const variants: Drawer[] = [
      { ...spec, depth: 4 },
      { ...spec, gearedRails: false },
      { ...spec, width: 'XL', depth: 6, interior: 'baseplate' },
    ];
    for (const current of variants) {
      const steps = assemblyOf(current);
      const insert = steps.findIndex((s) => s.ref === '抽屉组装 第 10 步');
      const stop = steps.findIndex((s) => s.ref === '抽屉组装 第 11 步');
      const latch = steps.findIndex((s) => s.ref === '抽屉组装 第 12 步');
      expect(stop).toBe(insert + 1);
      expect(latch).toBe(stop + 1);
      const stoppers = partsOf(current).find((p) => p.id === 'runner-stoppers')!;
      const pieces = partInstances(stoppers);
      expect(pieces).toHaveLength(2);
      for (const [i, piece] of pieces.entries()) {
        const pieceSteps = instanceAssemblySteps(steps, stoppers.id, piece.slide);
        expect(poseAt(pieceSteps, insert, 1, stoppers.id).visible).toBe(false);
        const start = poseAt(pieceSteps, stop, 0, stoppers.id);
        expect(start).toMatchObject({ visible: true, active: true });
        expect(start.offset).toEqual([i === 0 ? -45 : 45, 0, 0]);
        expect(poseAt(pieceSteps, stop, 1, stoppers.id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
        expect(poseAt(pieceSteps, latch, 1, stoppers.id)).toMatchObject({ visible: true, offset: [0, 0, 0] });
      }
      expect(poseAt(steps, stop, 1, 'latch').visible).toBe(false);
      expect(poseAt(steps, latch, 1, 'latch')).toMatchObject({ visible: true, offset: [0, 0, 0] });
    }
  });
});
