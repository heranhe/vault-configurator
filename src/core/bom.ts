import { colorById } from '../data/colors';
import { resolveFile } from './catalog';
import { hardwareOf, partsOf } from './parts';
import type { ColorSlot, Placement } from './types';

export type BomRow = {
  key: string;
  path: string; // 真实相对路径（解析失败时为逻辑路径）
  fileName: string;
  partName: string;
  colorId: string;
  qty: number;
  supports: boolean;
  uncertain: boolean;
  missingInCatalog: boolean;
  size: number;
};

export const colorOf = (p: Placement, slot: ColorSlot, palette: Record<ColorSlot, string>) => p.colors?.[slot] ?? palette[slot];

/** 打印清单：同一文件 + 同一颜色合并，数量累加 */
export function buildBom(placements: Placement[], palette: Record<ColorSlot, string>) {
  const rows = new Map<string, BomRow>();
  const hardware: Record<string, number> = {};
  for (const p of placements) {
    for (const part of partsOf(p.spec)) {
      const colorId = part.fixedColor ?? colorOf(p, part.slot, palette);
      for (const f of part.files) {
        const hit = resolveFile(f.path);
        const path = hit?.p ?? f.path;
        const key = `${path}|${colorId}`;
        const row = rows.get(key);
        if (row) row.qty += f.qty;
        else
          rows.set(key, {
            key, path, colorId, qty: f.qty,
            fileName: path.split('/').pop()!,
            partName: part.name,
            supports: !!f.supports || /turn on supports/i.test(path),
            uncertain: !!f.uncertain,
            missingInCatalog: !hit,
            size: hit?.size ?? 0,
          });
      }
    }
    for (const [k, n] of Object.entries(hardwareOf(p.spec))) hardware[k] = (hardware[k] ?? 0) + n;
  }
  const list = [...rows.values()].sort((a, b) => a.colorId.localeCompare(b.colorId) || a.path.localeCompare(b.path));
  return { rows: list, hardware };
}

export function bomCsv(rows: BomRow[], hardware: Record<string, number>) {
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['文件', '路径', '零件', '颜色', '色号', '数量', '需开支撑', '数量待确认'].map(esc).join(',')];
  for (const r of rows) {
    const c = colorById(r.colorId);
    lines.push([r.fileName, r.path, r.partName, `${c.nameZh} ${c.nameEn}`, c.id, r.qty, r.supports ? '是' : '', r.uncertain ? '是' : ''].map(esc).join(','));
  }
  lines.push('', [esc('五金件'), esc('数量')].join(','));
  for (const [k, n] of Object.entries(hardware)) lines.push([esc(k), esc(n)].join(','));
  return '﻿' + lines.join('\n');
}
