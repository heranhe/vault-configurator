// npm run demo-models -- <模型包内层目录> [输出目录]
// 只做预览；原始打印 STL 不复制进网站。复用浏览器的简化算法，保证装配行为一致。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import ts from 'typescript';
import { partsOf } from '../src/core/parts';
import { resolveFile } from '../src/core/catalog';
import { DEMO_SPECS } from '../src/models/demo';

const [root, out = 'public/demo-models'] = process.argv.slice(2);
if (!root) throw new Error('用法：npm run demo-models -- <模型包内层目录> [输出目录]');
const workerCode = await readFile(new URL('../src/models/stl.worker.ts', import.meta.url), 'utf8');
const codecCode = await readFile(new URL('../src/models/mesh-codec.ts', import.meta.url), 'utf8');
const compile = (code) => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const codec = { exports: {} };
vm.runInNewContext(compile(codecCode), { exports: codec.exports, Float32Array, Float64Array, Uint8Array, Uint32Array });
let result;
const self = { postMessage: (r) => { result = r; } };
vm.runInNewContext(compile(workerCode), { self, exports: {}, TextDecoder, DataView, Float32Array, Uint32Array });
const paths = new Set(DEMO_SPECS.flatMap((s) => partsOf(s).filter((p) => p.real !== 'none').flatMap((p) => p.files.slice(0, 1).map((f) => f.path))));
const files = [...paths].map((p) => { const f = resolveFile(p); if (!f) throw new Error(`找不到体验零件：${p}`); return f; });
await mkdir(out, { recursive: true });
const manifest = { version: 1, files: {} };
const report = [];
for (const f of files) {
  const bytes = await readFile(join(root, f.p));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  self.onmessage({ data: { id: 1, buffer, autoZ: true } });
  if (result.error) throw new Error(`${f.p}: ${result.error}`);
  const packed = codec.exports.encodeMesh(result);
  codec.exports.decodeMesh(packed.buffer); // 构建时校验坐标、索引与长度。
  const compressed = gzipSync(packed, { level: 9 });
  const hash = createHash('sha256').update(compressed).digest('hex');
  const file = `${hash}.mesh.gz`;
  await writeFile(join(out, file), compressed);
  manifest.files[f.p] = { file, bytes: compressed.length };
  const row = { path: f.p, original: f.size, preview: compressed.length, triangles: result.indices.length / 3 };
  report.push(row);
  console.log(`${report.length}/${files.length} ${(f.size / 1e6).toFixed(2)} MB → ${(compressed.length / 1024).toFixed(1)} KB (${row.triangles} 面) ${f.p}`);
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest));
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
const original = report.reduce((s, r) => s + r.original, 0), preview = report.reduce((s, r) => s + r.preview, 0);
console.log(JSON.stringify({ files: report.length, originalMB: original / 1e6, previewMB: preview / 1e6, reduction: `${(original / preview).toFixed(1)}x` }));
