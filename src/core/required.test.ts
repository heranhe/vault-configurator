import { describe, expect, it } from 'vitest';
import { catalogPaths } from './catalog';
import { requiredPaths } from './required';

describe('导入核对用的必需文件清单', () => {
  it('只含本工具会用到的文件，不含模型包里的多余旧文件', () => {
    const required = requiredPaths();
    console.log('required', required.length, 'of', catalogPaths.length);
    expect(required.length).toBeGreaterThan(0);
    expect(required.length).toBeLessThanOrEqual(catalogPaths.length);
    expect(required.some((p) => p.endsWith('x4 runner slides.stl'))).toBe(true);
    // M4 文件夹里多出来的旧底板，零件里从不引用
    expect(required.some((p) => p.endsWith('m4 gridfinity baseplate 2_handles.stl'))).toBe(false);
  });
});
