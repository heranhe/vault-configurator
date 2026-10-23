/** 左右各一列，在实际画布高度内分页，不把零件标注挤出屏幕。 */
export const calloutPageSize = (height: number) => 2 * Math.max(1, Math.floor((height - 164) / 30) + 1);

export function calloutPage<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(0, Math.min(page, pages - 1));
  return { pages, current, items: items.slice(current * size, (current + 1) * size) };
}
