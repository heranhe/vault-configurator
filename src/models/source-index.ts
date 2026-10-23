import { catalogPaths, normPath } from '../core/catalog';
import type { ModelSource, SourceFile } from './source';

export type ImportReport = { matched: number; unmatched: string[]; ambiguous: string[]; failed: string[] };
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

const indexes = new WeakMap<ModelSource, { files: Map<string, SourceFile>; report: ImportReport }>();

/** 保留真实路径；按目录后缀匹配，只有唯一文件名才允许省略全部目录。歧义不静默覆盖。 */
export function sourceIndex(source: ModelSource) {
  const cached = indexes.get(source);
  if (cached) return cached;
  const report: ImportReport = { matched: 0, unmatched: [], ambiguous: [], failed: source.failed ?? [] };
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
    if (matches.length === 1) { files.set(key, matches[0]); report.matched++; }
    else report.ambiguous.push(...matches.map((f) => f.path));
  }
  for (const [key, matches] of unknown) if (matches.length === 1) files.set(key, matches[0]);
  const index = { files, report };
  indexes.set(source, index);
  return index;
}
