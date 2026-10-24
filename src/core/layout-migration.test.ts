import { describe, expect, it } from 'vitest';
import type { Placement } from './types';
import { migrateBaseHeight } from './layout-migration';
import { unitsOn } from './rules';

describe('旧底座高度存档兼容', () => {
  it('整列下移20mm，保留底座、独立单元和配色，并恢复承托关系', () => {
    const units: Placement[] = [
      { id: 'base', spec: { type: 'base', width: 'L', depth: 5, mode: 'wheels' }, pos: [0, 0, 0] },
      { id: 'left', spec: { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' }, pos: [0, 123.2, 0], colors: { 功能件: '10101' } },
      { id: 'right', spec: { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' }, pos: [164.8, 123.2, 0] },
      { id: 'bridge', spec: { type: 'drawer', width: 'L', depth: 5, height: 1, interior: 'empty' }, pos: [0, 171.2, 0] },
      { id: 'separate', spec: { type: 'drawer', width: 'S', depth: 5, height: 1, interior: 'empty' }, pos: [500, 0, 0] },
    ];
    const migrated = migrateBaseHeight(units);
    expect(migrated.map((p) => p.pos[1])).toEqual([0, 103.2, 103.2, 151.2, 0]);
    expect(migrated[0]).toBe(units[0]); expect(migrated[4]).toBe(units[4]);
    expect(migrated[1].colors).toEqual(units[1].colors);
    expect(units[1].pos[1]).toBe(123.2);
    expect(unitsOn(migrated[0], migrated).map((p) => p.id)).toEqual(['left', 'right']);
    expect(migrateBaseHeight(migrated)).toEqual(migrated);
  });
});
