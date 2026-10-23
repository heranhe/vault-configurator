import type { AsmStep } from '../core/assembly';
import type { Block, Part } from '../core/parts';
import type { Vec3 } from '../core/types';

export type PartInstance = {
  id: string;
  parentId: string;
  name: string;
  index: number;
  count: number;
  blockIndices: number[];
  blocks: Block[];
  anchor: Vec3;
  /** 相对零件最终装配位置的爆炸偏移，尚未乘 EXPLODE_GAIN。 */
  explode: Vec3;
  slide?: Vec3;
};

function center(blocks: Block[]): Vec3 {
  return [0, 1, 2].map((k) => (
    Math.min(...blocks.map((b) => b.at[k])) + Math.max(...blocks.map((b) => b.at[k] + b.size[k]))
  ) / 2) as Vec3;
}

/** 只拆独立实物；壳体的多块代理墙和螺栓的头杆不能拆开。 */
export function partInstances(part: Part): PartInstance[] {
  if (part.tooling || !part.blocks.length) return [];
  const perPiece = Math.max(1, part.blocksPerPiece ?? (part.real === 'each' || part.hardware ? 1 : part.blocks.length));
  const groups: number[][] = [];
  for (let i = 0; i < part.blocks.length; i += perPiece) groups.push(Array.from({ length: Math.min(perPiece, part.blocks.length - i) }, (_, j) => i + j));
  const count = groups.length;
  const cols = count > 4 ? Math.ceil(Math.sqrt(count)) : count;
  const rows = Math.ceil(count / cols);
  const pieceWidth = Math.max(...groups.map((ids) => {
    const blocks = ids.map((i) => part.blocks[i]);
    return Math.max(...blocks.map((b) => b.at[0] + b.size[0])) - Math.min(...blocks.map((b) => b.at[0]));
  }));
  const gapX = pieceWidth + 20;
  const gapY = Math.max(...groups.map((ids) => {
    const blocks = ids.map((i) => part.blocks[i]);
    return Math.max(...blocks.map((b) => b.at[1] + b.size[1])) - Math.min(...blocks.map((b) => b.at[1]));
  })) + 20;
  // 数量写在单件编号中，避免“轮子×2 1/2”把单件误读成又一组。
  const name = part.name.replace(/\s+×\s*\d+/g, '').replace(/（(?:默认满配，可按需减少|按需配置)）/g, '').trim();
  return groups.map((blockIndices, index) => {
    const blocks = blockIndices.map((i) => part.blocks[i]);
    const slide = blocks.find((b) => b.slide)?.slide;
    const offset = index - (count - 1) / 2;
    // 宽分隔板沿高度和深度错开，避免横向摊满数米、把整个装配体缩成一点。
    const fan: Vec3 = count > 2 && pieceWidth > 120 ? [0, offset * 14, offset * 28]
      : count > 1 ? [(index % cols - (cols - 1) / 2) * gapX, (Math.floor(index / cols) - (rows - 1) / 2) * gapY, 0] : [0, 0, 0];
    return {
      id: count > 1 ? `${part.id}::${index + 1}` : part.id,
      parentId: part.id, name: count > 1 ? `${name} ${index + 1}/${count}` : name,
      index, count, blockIndices, blocks, anchor: center(blocks), slide,
      explode: part.explode.map((v, k) => v + fan[k]) as Vec3,
    };
  });
}

/** 清单仍可聚焦父零件；场景点击与标注使用单件 ID。 */
export const instanceFocused = (focus: string | null, piece: Pick<PartInstance, 'id' | 'parentId'>) => focus === piece.id || focus === piece.parentId;

/** t=0 绝不改变正常装配位置。 */
export const instanceExplodeOffset = (instance: PartInstance, t: number, gain = 1): Vec3 => t === 0 ? [0, 0, 0] : instance.explode.map((v) => v * t * gain) as Vec3;

/** 单件入场方向可不同；装好的坐标和装配顺序仍继承父零件。 */
export function instanceAssemblySteps(steps: AsmStep[], partId: string, slide?: Vec3): AsmStep[] {
  if (!slide) return steps;
  const first = steps.findIndex((s) => s.place[partId]);
  return steps.map((s, i) => i === first ? { ...s, from: { ...s.from, [partId]: slide } } : s);
}

/** 所有装配模型（包括五金）始终显示，打印辅助件不进入场景。 */
export const visibleParts = (parts: Part[]) => parts.filter((p) => !p.tooling);

/** 开关只控制紧固件名称、引线和标注分页，不影响模型。 */
export const labeledParts = (parts: Part[], showHardwareLabels: boolean) => visibleParts(parts).filter((p) => showHardwareLabels || !p.hardware);
