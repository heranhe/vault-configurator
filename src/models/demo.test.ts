import { describe, expect, it } from 'vitest';
import { DEMO_SPECS, isDemoSpec } from './demo';
import { partsOf } from '../core/parts';
import { resolveFile } from '../core/catalog';
import manifest from '../../public/demo-models/manifest.json';

describe('四款基础体验范围', () => {
  it('只允许截图中的 S5 1F / 2F 抽屉和收纳箱', () => {
    expect(DEMO_SPECS).toHaveLength(4);
    expect(DEMO_SPECS.every(isDemoSpec)).toBe(true);
    expect(isDemoSpec({ type: 'drawer', width: 'S', depth: 5, height: 4, interior: 'empty' })).toBe(false);
    expect(isDemoSpec({ type: 'drawer', width: 'M', depth: 5, height: 1, interior: 'empty' })).toBe(false);
    expect(isDemoSpec({ type: 'drawer', width: 'S', depth: 4, height: 1, interior: 'empty' })).toBe(false);
    expect(isDemoSpec({ type: 'sustainer', width: 'S', depth: 5, height: 1, interior: 'sealed' })).toBe(false);
  });
  it('发布目录完整覆盖四款体验，且不包含额外整库模型', () => {
    const needed = new Set(DEMO_SPECS.flatMap((s) => partsOf(s).filter((p) => p.real !== 'none').flatMap((p) => p.files.slice(0, 1).map((f) => resolveFile(f.path)!.p))));
    expect(new Set(Object.keys(manifest.files))).toEqual(needed);
    expect(needed.size).toBe(31);
  });
});
