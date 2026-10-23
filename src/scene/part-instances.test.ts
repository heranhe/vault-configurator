import { describe, expect, it } from 'vitest';
import { assemblyOf, poseAt, type AsmStep } from '../core/assembly';
import type { Part } from '../core/parts';
import { partsOf } from '../core/parts';
import { instanceAssemblySteps, instanceExplodeOffset, instanceFocused, partInstances } from './part-instances';

const pair: Part = {
  id: 'rails', name: '导轨 ×2', slot: '结构', real: 'each', split: true,
  blocks: [{ at: [0, 0, 0], size: [10, 20, 100] }, { at: [100, 0, 0], size: [10, 20, 100] }],
  explode: [0, 20, 40], files: [{ path: 'rail-pair.stl', qty: 1, pieces: 2 }],
};

describe('每个实物独立显示', () => {
  it('同一STL里的两件都有独立ID、编号、锚点和爆炸偏移，不改变打印份数', () => {
    const pieces = partInstances(pair);
    expect(pieces.map((p) => p.id)).toEqual(['rails::1', 'rails::2']);
    expect(pieces.map((p) => p.name)).toEqual(['导轨 1/2', '导轨 2/2']);
    expect(pieces[0].anchor).not.toEqual(pieces[1].anchor);
    expect(pieces[0].explode).not.toEqual(pieces[1].explode);
    expect(pieces.map((p) => p.blockIndices)).toEqual([[0], [1]]);
    expect(pair.files).toEqual([{ path: 'rail-pair.stl', qty: 1, pieces: 2 }]);
  });
  it('单件点击只聚焦自己，打印清单父ID仍聚焦全部实物', () => {
    const [one, two] = partInstances(pair);
    expect(instanceFocused(one.id, one)).toBe(true);
    expect(instanceFocused(one.id, two)).toBe(false);
    expect(instanceFocused(pair.id, one)).toBe(true);
    expect(instanceFocused(pair.id, two)).toBe(true);
  });
  it('螺栓头和杆按显式声明合为一颗，box和cyl都支持', () => {
    for (const cyl of [false, true]) {
      const bolts: Part = { ...pair, id: 'bolts', name: '螺栓 ×2', real: 'none', hardware: true, blocksPerPiece: 2,
        blocks: Array.from({ length: 4 }, (_, i) => ({ at: [Math.floor(i / 2) * 20, 0, i % 2 * 5], size: [5, 5, 5], cyl })) };
      expect(partInstances(bolts).map((p) => p.blockIndices)).toEqual([[0, 1], [2, 3]]);
    }
  });
  it('未声明头杆分组的两颗单块五金仍分成两件', () => {
    expect(partInstances({ ...pair, real: 'none', hardware: true }).map((p) => p.blocks.length)).toEqual([1, 1]);
  });
  it('只去除数量乘号，M4×14 这样的螺栓规格必须保留', () => {
    const [one, two] = partInstances({ ...pair, name: 'M4×14 螺栓 ×2' });
    expect(one.name).toBe('M4×14 螺栓 1/2');
    expect(two.name).toBe('M4×14 螺栓 2/2');
  });
  it('装配入场的slide不再重复加入爆炸距离', () => {
    const a = partInstances(pair);
    const b = partInstances({ ...pair, blocks: pair.blocks.map((block) => ({ ...block, slide: [1000, 0, 0] })) });
    expect(a.map((p) => p.explode)).toEqual(b.map((p) => p.explode));
  });
  it('一个壳体的多面墙始终是一个实物', () => {
    const instances = partInstances({ ...pair, real: 'union' });
    expect(instances).toHaveLength(1);
    expect(instances[0].blocks).toHaveLength(2);
    expect(instances[0].id).toBe('rails');
  });
  it('定位工装不进入装配场景或标签', () => expect(partInstances({ ...pair, tooling: true })).toEqual([]));
  it('关闭爆炸时所有实物偏移严格归零', () => {
    for (const p of partInstances(pair)) expect(instanceExplodeOffset(p, 0, 2)).toEqual([0, 0, 0]);
  });
  it('单件入场方向分别生效，完成装配后归零且不修改父步骤', () => {
    const steps: AsmStep[] = [{ title: '插入', ref: '', note: '', place: { rails: [0, 0, 0] }, from: { rails: [0, 0, 50] } }];
    for (const slide of [[-40, 0, 0], [40, 0, 0]] as const) {
      const pieceSteps = instanceAssemblySteps(steps, 'rails', [...slide]);
      expect(poseAt(pieceSteps, 0, 0, 'rails').offset).toEqual([...slide]);
      expect(poseAt(pieceSteps, 0, 1, 'rails').offset).toEqual([0, 0, 0]);
    }
    expect(steps[0].from!.rails).toEqual([0, 0, 50]);
  });
  it('真实收纳箱锁销钉为8个独立实物，全部装配结束都归位', () => {
    const spec = { type: 'sustainer', width: 'L', depth: 5, height: 1, interior: 'flat' } as const;
    const pins = partsOf(spec).find((p) => p.id === 'lock-pins')!;
    const pieces = partInstances(pins);
    expect(pieces).toHaveLength(8);
    expect(pieces[7].name).toContain('8/8');
    expect(new Set(pieces.map((p) => p.id)).size).toBe(8);
    const steps = assemblyOf(spec);
    for (const p of pieces) expect(poseAt(instanceAssemblySteps(steps, pins.id, p.slide), steps.length - 1, 1, pins.id).offset).toEqual([0, 0, 0]);
  });
});
