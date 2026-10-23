// 扫描本地 VAULT 模型包，生成 src/data/catalog.json（只含相对路径和文件大小，不含任何几何数据）
// 用法：node tools/build-catalog.mjs "<模型包内层目录>"
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('用法: node tools/build-catalog.mjs "<模型包目录>"');
  process.exit(1);
}

async function walk(dir, out) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, out);
    else if (ent.name.toLowerCase().endsWith('.stl')) {
      out.push({ p: relative(root, full).normalize('NFC'), size: (await stat(full)).size });
    }
  }
  return out;
}

const files = (await walk(root, [])).sort((a, b) => a.p.localeCompare(b.p));
await writeFile(new URL('../src/data/catalog.json', import.meta.url), JSON.stringify({ files }, null, 0));
console.log(`catalog.json: ${files.length} 个 STL`);
