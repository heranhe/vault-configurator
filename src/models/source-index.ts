import { catalogFileSize, catalogPaths, normPath } from '../core/catalog';
import type { ModelSource, SourceFile } from './source';
import { requiredPaths } from '../core/required';

/** required / found：本工具用到的文件数与其中已认出的数量；missing：其中没认出的文件（模型包里用不到的文件不算）；duplicates：同一模型的多余副本（已用其中一份）；
 *  renamed：文件名与对照版本不同、按相近名称匹配上的文件（如另一批模型包的 x4 Runner Slide.stl） */
export type ImportReport = { required: number; found: number; matched: number; unmatched: string[]; ambiguous: string[]; failed: string[]; missing: string[]; duplicates: string[]; renamed: string[] };
const byName = new Map<string, string[]>();
for (const path of catalogPaths) {
  const name = path.split('/').pop()!;
  byName.set(name, [...(byName.get(name) ?? []), path]);
}

function suffixLength(a: string, b: string) {
  const aa = a.split('/'), bb = b.split('/');
  let count = 0;
  while (count < Math.min(aa.length, bb.length) && aa[aa.length - 1 - count] === bb[bb.length - 1 - count]) count++;
  return count;
}

/**
 * 同一模型有多份副本（旧版 / 新版、重复解压）时选一份：
 * 只有一份与官方文件字节数一致就用它；所有副本大小相同（同一文件的拷贝）就用路径排序后的第一份。
 * 大小各不相同又都对不上官方文件时无法判断，返回 undefined，交给用户确认。
 */
function pickCopy(key: string, matches: SourceFile[]) {
  if (matches.length === 1) return matches[0];
  const first = (list: SourceFile[]) => [...list].sort((a, b) => a.path.localeCompare(b.path))[0];
  const official = catalogFileSize(key);
  const exact = matches.filter((f) => f.size === official);
  if (exact.length) return first(exact);
  if (new Set(matches.map((f) => f.size)).size === 1) return first(matches);
  return undefined;
}

/**
 * 宽松文件名：不同批次的模型包会改名（x4 Runner Slides → x4 Runner Slide，XL4 Runner Slides → x4 Runner Slide XL）。
 * 去掉「(Turn On Supports)」和复数 s，把 XL4 拆成 x4 + xl，词序无关。
 */
export function looseName(path: string) {
  const name = normPath(path).split('/').pop()!.replace('(turn on supports)', '').replace(/\.stl$/, '');
  return name
    .replace(/\bxl(\d)\b/g, 'x$1 xl')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .sort()
    .join(' ');
}

// 宽松名在整个目录里唯一的模型才允许按宽松名匹配（S1F 等抽屉 / 收纳箱同名件靠目录区分，不参与）
const looseCount = new Map<string, number>();
for (const p of catalogPaths) looseCount.set(looseName(p), (looseCount.get(looseName(p)) ?? 0) + 1);

/** 精确匹配后仍缺的模型，与未认出的文件按宽松名配对；目录里唯一、导入文件里也唯一才配，避免猜错 */
function matchRenamed(files: Map<string, SourceFile>, unknown: Map<string, SourceFile[]>, report: ImportReport) {
  const strays = new Map<string, [string, SourceFile][]>();
  for (const [path, list] of unknown) {
    if (list.length !== 1) continue;
    const loose = looseName(path);
    strays.set(loose, [...(strays.get(loose) ?? []), [path, list[0]]]);
  }
  for (const key of catalogPaths) {
    if (files.has(key)) continue;
    const loose = looseName(key);
    const hits = strays.get(loose);
    if (looseCount.get(loose) !== 1 || hits?.length !== 1) continue;
    const [strayPath, file] = hits[0];
    files.set(key, file);
    unknown.delete(strayPath);
    report.matched++;
    report.renamed.push(file.path);
    report.unmatched = report.unmatched.filter((p) => p !== file.path);
  }
}

const indexes = new WeakMap<ModelSource, { files: Map<string, SourceFile>; report: ImportReport }>();

/** 保留真实路径；按目录后缀匹配，只有唯一文件名才允许省略全部目录。歧义不静默覆盖。 */
export function sourceIndex(source: ModelSource) {
  const cached = indexes.get(source);
  if (cached) return cached;
  const report: ImportReport = { required: requiredPaths().length, found: 0, matched: 0, unmatched: [], ambiguous: [], failed: source.failed ?? [], missing: [], duplicates: [], renamed: [] };
  const candidates = new Map<string, SourceFile[]>();
  const unknown = new Map<string, SourceFile[]>();
  for (const file of source.files.values()) {
    const path = normPath(file.path);
    const options = byName.get(path.split('/').pop()!) ?? [];
    if (!options.length) {
      report.unmatched.push(file.path);
      unknown.set(path, [...(unknown.get(path) ?? []), file]);
      continue;
    }
    const scores = options.map((p) => suffixLength(path, p));
    const max = Math.max(...scores);
    const best = options.filter((_, i) => scores[i] === max);
    if (best.length !== 1) { report.ambiguous.push(file.path); continue; }
    const key = best[0];
    candidates.set(key, [...(candidates.get(key) ?? []), file]);
  }
  const files = new Map<string, SourceFile>();
  for (const [key, matches] of candidates) {
    const chosen = pickCopy(key, matches);
    if (!chosen) { report.ambiguous.push(...matches.map((f) => f.path)); continue; }
    files.set(key, chosen);
    report.matched++;
    report.duplicates.push(...matches.filter((f) => f !== chosen).map((f) => f.path));
  }
  matchRenamed(files, unknown, report);
  report.missing = requiredPaths().filter((p) => !files.has(p));
  report.found = report.required - report.missing.length;
  for (const [key, matches] of unknown) if (matches.length === 1) files.set(key, matches[0]);
  const index = { files, report };
  indexes.set(source, index);
  return index;
}
