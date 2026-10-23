import { afterEach, expect, it } from 'vitest';
import { partsOf } from './core/parts';
import { buildBom } from './core/bom';
import { visibleParts, labeledParts } from './scene/part-instances';
import { DEFAULT_PALETTE, useStore } from './store';
import type { Placement } from './core/types';

const placements: Placement[] = [{ id: 'box', spec: { type: 'sustainer', width: 'L', depth: 5, height: 1, interior: 'dividers' }, pos: [0, 0, 0] }];
afterEach(() => useStore.setState({ showHardwareLabels: false }));
it('每次启动默认只隐藏紧固件名称', () => {
  expect(useStore.getInitialState().showHardwareLabels).toBe(false);
});
it('模型始终含紧固件，开关只筛选名称标注，保留打印销钉名称', () => {
  const parts = partsOf(placements[0].spec);
  const hardware = parts.filter((p) => p.hardware);
  expect(hardware.length).toBeGreaterThan(0);
  expect(visibleParts(parts).filter((p) => p.hardware)).toEqual(hardware);
  expect(labeledParts(parts, false).some((p) => p.hardware)).toBe(false);
  expect(labeledParts(parts, false).find((p) => p.id === 'lock-pins')).toBeDefined();
  expect(labeledParts(parts, true).filter((p) => p.hardware)).toEqual(hardware);
});
it('切换名称不改变模型、取景、方案、打印清单或采购数量', () => {
  useStore.setState({ placements, showHardwareLabels: false });
  const before = buildBom(placements, DEFAULT_PALETTE);
  const models = visibleParts(partsOf(placements[0].spec));
  const fit = useStore.getState().fitNonce;
  for (const on of [true, false]) {
    useStore.getState().setShowHardwareLabels(on);
    expect(useStore.getState().showHardwareLabels).toBe(on);
    expect(useStore.getState().fitNonce).toBe(fit);
    expect(visibleParts(partsOf(placements[0].spec))).toEqual(models);
  }
  expect(useStore.getState().placements).toBe(placements);
  expect(buildBom(useStore.getState().placements, DEFAULT_PALETTE)).toEqual(before);
});
