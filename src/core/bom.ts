import { t, useLocale, type Locale } from '../i18n';
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
  piecesPerFile: number;
  supports: boolean;
  uncertain: boolean;
  tooling: boolean;
  missingInCatalog: boolean;
  size: number;
  /** 合并前的单元与场景零件，用于从清单定位爆炸图 */
  targets: { unitId: string; partId: string }[];
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
        if (row) {
          // 定位工装可供同一方案内的多套轮组重复使用，不按底座数重复打印。
          row.qty = part.tooling ? Math.max(row.qty, f.qty) : row.qty + f.qty;
          if (!row.targets.some((t) => t.unitId === p.id && t.partId === part.id)) {
            row.targets.push({ unitId: p.id, partId: part.id });
          }
        }
        else
          rows.set(key, {
            key, path, colorId, qty: f.qty,
            piecesPerFile: f.pieces ?? 1,
            fileName: path.split('/').pop()!,
            partName: part.name,
            supports: !!f.supports || /turn on supports/i.test(path),
            uncertain: !!f.uncertain,
            tooling: !!part.tooling,
            missingInCatalog: !hit,
            size: hit?.size ?? 0,
            targets: [{ unitId: p.id, partId: part.id }],
          });
      }
    }
    for (const [k, n] of Object.entries(hardwareOf(p.spec))) hardware[k] = (hardware[k] ?? 0) + n;
  }
  const list = [...rows.values()].sort((a, b) => a.colorId.localeCompare(b.colorId) || a.path.localeCompare(b.path));
  return { rows: list, hardware };
}

export function bomCsv(rows: BomRow[], hardware: Record<string, number>, locale: Locale = useLocale.getState().locale) {
  const tr = (value: string) => t(value, locale);
  const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['文件', '路径', '零件', '颜色', '色号', '打印份数', '每份件数', '零件总数', '需开支撑', '数量待确认'].map(tr).map(esc).join(',')];
  for (const r of rows) {
    const c = colorById(r.colorId);
    lines.push([r.fileName, r.path, tr(r.partName), locale === 'en' ? c.nameEn : `${c.nameZh} ${c.nameEn}`, c.id, r.qty, r.piecesPerFile, r.qty * r.piecesPerFile, r.supports ? tr('是') : '', r.uncertain ? tr('是') : ''].map(esc).join(','));
  }
  lines.push('', [esc(tr('五金件')), esc(tr('数量'))].join(','));
  for (const [k, n] of Object.entries(hardware)) lines.push([esc(tr(k)), esc(n)].join(','));
  return '﻿' + lines.join('\n');
}
