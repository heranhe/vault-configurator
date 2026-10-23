import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBom } from './core/bom';
import type { Placement } from './core/types';
import { DEFAULT_PALETTE, useStore } from './store';

const placements: Placement[] = [
  { id: 's1', spec: { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' }, pos: [0, 0, 0] },
  { id: 's2', spec: { type: 'drawer', width: 'S', depth: 5, height: 2, interior: 'empty' }, pos: [0, 48, 0] },
  { id: 'roof', spec: { type: 'roof', width: 'L', depth: 5, roof: 'heavyweight' }, pos: [400, 0, 0] },
];

const rowFor = (name: string) => buildBom(useStore.getState().placements, DEFAULT_PALETTE).rows.find((r) => r.fileName.includes(name))!;

describe('打印清单定位爆炸图', () => {
  beforeEach(() => {
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    useStore.setState({ placements, palette: DEFAULT_PALETTE, selectedId: null, explodeId: null, focusPart: null, assembly: null, explodeT: 0 });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('合并相同文件时保留每个所属单元，数量仍累加', () => {
    const row = rowFor('Key Cap');
    expect(row.qty).toBe(2);
    expect(row.targets).toEqual([{ unitId: 's1', partId: 'key-cap' }, { unitId: 's2', partId: 'key-cap' }]);
  });

  it('从普通视图点击零件，直接展开所属单元并高亮', () => {
    useStore.getState().focusBomPart(rowFor('Heawyweight').key);
    expect(useStore.getState()).toMatchObject({ selectedId: 'roof', explodeId: 'roof', explodeT: 1, focusPart: 'roof' });
  });

  it('共享零件优先保留当前爆炸图单元，其次使用选中单元', () => {
    const key = rowFor('Key Cap').key;
    useStore.setState({ explodeId: 's2', selectedId: 's1' });
    useStore.getState().focusBomPart(key);
    expect(useStore.getState()).toMatchObject({ explodeId: 's2', focusPart: 'key-cap' });
    useStore.setState({ explodeId: null, selectedId: 's2' });
    useStore.getState().focusBomPart(key);
    expect(useStore.getState().explodeId).toBe('s2');
  });

  it('当前单元不含目标零件时自动切换，并退出安装流程', () => {
    useStore.setState({ explodeId: 's1', selectedId: 's1', assembly: { unitId: 's1', step: 0, t: 0, playing: true, chain: true } });
    useStore.getState().focusBomPart(rowFor('S5 Module 2F').key);
    expect(useStore.getState()).toMatchObject({ selectedId: 's2', explodeId: 's2', explodeT: 1, focusPart: 'module', assembly: null });
  });

  it('重复点击保持高亮；过期清单项不会激活已删除单元', () => {
    const key = rowFor('S5 Module 2F').key;
    useStore.getState().focusBomPart(key);
    useStore.getState().focusBomPart(key);
    expect(useStore.getState().focusPart).toBe('module');
    useStore.setState({ placements: [], explodeId: null, selectedId: null, focusPart: null });
    useStore.getState().focusBomPart(key);
    expect(useStore.getState()).toMatchObject({ explodeId: null, selectedId: null, focusPart: null });
  });

  it('同文件不同颜色分别定位到对应单元', () => {
    useStore.setState({ placements: placements.map((p) => p.id === 's2' ? { ...p, colors: { 功能件: '10101' } } : p), selectedId: 's1' });
    const row = buildBom(useStore.getState().placements, DEFAULT_PALETTE).rows.find((r) => r.fileName.includes('Key (') && r.colorId === '10101')!;
    useStore.getState().focusBomPart(row.key);
    expect(useStore.getState()).toMatchObject({ explodeId: 's2', focusPart: 'key' });
  });
});
