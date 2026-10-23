import { describe, expect, it } from 'vitest';
import { calloutPage, calloutPageSize } from './callout-layout';

describe('多零件标注分页', () => {
  it('每列标签在真实高度内排开，所有59件均可访问且不重复', () => {
    const items = Array.from({ length: 59 }, (_, i) => i), size = calloutPageSize(500);
    expect((size / 2 - 1) * 30).toBeLessThanOrEqual(500 - 164);
    const pages = calloutPage(items, 0, size).pages;
    const all = Array.from({ length: pages }, (_, i) => calloutPage(items, i, size).items).flat();
    expect(all).toEqual(items);
  });
  it('窗口缩小或零件减少时页码保持有效', () => {
    expect(calloutPage([1, 2], 10, 12)).toEqual({ pages: 1, current: 0, items: [1, 2] });
    expect(calloutPageSize(100)).toBe(2);
  });
});
