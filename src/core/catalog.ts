// 模型包文件名不统一（大小写、多余空格、Roof/Roofs、L4F' 等），统一归一化后再匹配
import catalog from '../data/catalog.json';

export function normPath(p: string) {
  return p
    .normalize('NFC')
    .replace(/\\/g, '/')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ?\/ ?/g, '/')
    .replace(/ \.stl$/, '.stl')
    .replace(/\/roof\//g, '/roofs/')
    .trim();
}

/** 去掉用户选择的外层目录，只保留从 01./02./03. 开始的部分 */
export function stripToRoot(p: string) {
  const m = p.normalize('NFC').replace(/\\/g, '/').match(/(?:^|\/)(0[1-3]\.\s*(?:DRAWERS|SUSTAINERS|MODIFICATIONS)\/.*)$/i);
  return m ? m[1] : p;
}

type Entry = { p: string; size: number };
const byNorm = new Map<string, Entry>((catalog.files as Entry[]).map((f) => [normPath(f.p), f]));

/** 把逻辑路径解析成模型包里的真实文件；找不到返回 undefined */
export const resolveFile = (logical: string) => byNorm.get(normPath(logical));
export const catalogSize = byNorm.size;
export const catalogPaths = [...byNorm.keys()];
