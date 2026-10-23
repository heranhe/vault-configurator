import { normPath, resolveFile } from '../core/catalog';
import { decodeMesh, type MeshData } from './mesh-codec';

type Entry = { file: string; bytes: number };
// 只随网站提供四个基础单元的体验零件，不连接整库或 R2。
const base = `${import.meta.env.BASE_URL}demo-models`;
// 离线版双击 HTML 打开（file://）时浏览器拦截 fetch，改用 <script> 加载构建时生成的同名 .js（见 tools/offline-plugin.ts）
const viaScript = globalThis.location?.protocol === 'file:';
function loadScript(file: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement('script'), { src: `${base}/${file}.js` });
    el.onload = () => {
      const store = (window as unknown as { __VAULT_DEMO__?: Record<string, unknown> }).__VAULT_DEMO__ ?? {};
      const value = store[file];
      delete store[file];
      el.remove();
      value === undefined ? reject(new Error(`缺少 ${file}`)) : resolve(value);
    };
    el.onerror = () => {
      el.remove();
      reject(new Error(`无法加载 ${file}`));
    };
    document.head.append(el);
  });
}

let manifest: Promise<Map<string, Entry>> | undefined;
function readManifest(): Promise<{ version?: number; files?: Record<string, Entry> }> {
  if (viaScript) return loadScript('manifest.json') as Promise<{ version?: number; files?: Record<string, Entry> }>;
  return fetch(`${base}/manifest.json`).then((r) => {
    if (!r.ok) throw new Error('未配置在线预览模型');
    return r.json();
  });
}
function entries() {
  return manifest ??= readManifest().then((data) => {
    if (data.version !== 1 || !data.files || typeof data.files !== 'object') throw new Error('预览目录格式无效');
    return new Map<string, Entry>(Object.entries(data.files).map(([p, e]) => [normPath(p), e as Entry]));
  }).catch(() => new Map<string, Entry>()); // 未部署模型时保持代理模型，不重复请求。
}

// 只限制模型网络请求，不在首页预取整个模型库。
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try { return await run(); }
  finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export async function previewEntry(path: string) {
  const entry = (await entries()).get(normPath(resolveFile(path)?.p ?? path));
  if (!entry || !/^[a-f0-9]{64}\.mesh\.gz$/.test(entry.file)) return null;
  return { key: `${base}|${entry.file}`, read: () => limited(async (): Promise<MeshData> => {
    let buffer: ArrayBuffer;
    if (viaScript) {
      buffer = Uint8Array.from(atob(await loadScript(entry.file) as string), (c) => c.charCodeAt(0)).buffer;
    } else {
      const r = await fetch(`${base}/${entry.file}`);
      if (!r.ok || !r.body) throw new Error('预览模型下载失败');
      buffer = await r.arrayBuffer();
    }
    // Vite 等服务器会给 .gz 自动加 Content-Encoding，浏览器此时已解压。
    // 依据内容识别，兼容应用层 gzip 和 HTTP 自动解压，避免二次解压导致全部退回代理块。
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b)
      buffer = await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return decodeMesh(buffer);
  }) };
}
