// 本地运行（npm run dev）时的模型通道：用户粘贴本地路径 → Node 读取该目录并把 STL 提供给网页。
// 只在开发/本地预览服务器里生效，模型文件不离开本机；部署成纯静态网站时走浏览器「选择文件夹」。
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import type { Connect, Plugin } from 'vite';
import type { OnImportProgress } from '../src/models/source';

const CONFIG = resolve('.vault-local.json'); // 记住上次的路径（已加入 .gitignore）

type Entry = { p: string; size: number; mtime: number };
let root: string | null = null;
let files: Entry[] = [];
let failed: string[] = [];
let connecting = false;

async function scan(dir: string, out: string[], base: string, onProgress?: OnImportProgress, signal?: AbortSignal) {
  signal?.throwIfAborted();
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    signal?.throwIfAborted();
    if (ent.name.startsWith('.')) continue;
    const full = join(dir, ent.name);
    const p = relative(base, full).split(sep).join('/');
    onProgress?.({ phase: 'scanning', discovered: out.length, completed: 0, current: p, failed: 0 });
    if (ent.isDirectory()) await scan(full, out, base, onProgress, signal);
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.stl')) out.push(p);
  }
}

async function connect(path: string, onProgress?: OnImportProgress, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (typeof path !== 'string' || !path.trim()) throw new Error('请输入文件夹路径');
  const dir = resolve(path.trim().replace(/^["']|["']$/g, '').replace(/^~(?=$|\/)/, homedir()));
  const st = await stat(dir).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`找不到文件夹：${dir}`);
  const paths: string[] = [];
  onProgress?.({ phase: 'scanning', discovered: 0, completed: 0, failed: 0 });
  await scan(dir, paths, dir, onProgress, signal);
  if (!paths.length) throw new Error('这个文件夹里没有 STL 文件');
  const out: Entry[] = [], errors: string[] = [];
  const total = paths.length;
  onProgress?.({ phase: 'reading', discovered: total, completed: 0, total, failed: 0 });
  for (const [i, p] of paths.entries()) {
    signal?.throwIfAborted();
    try {
      const st = await stat(join(dir, p));
      out.push({ p, size: st.size, mtime: st.mtimeMs });
    } catch { errors.push(p); }
    onProgress?.({ phase: 'reading', discovered: total, completed: i + 1, total, current: p, failed: errors.length });
  }
  if (!out.length) throw new Error(`无法读取 ${errors.length} 个 STL 文件，请检查文件夹权限后重试`);
  signal?.throwIfAborted();
  root = dir;
  files = out;
  failed = errors;
  await writeFile(CONFIG, JSON.stringify({ root: dir }, null, 2)).catch(() => {});
  onProgress?.({ phase: 'done', discovered: total, completed: total, total, failed: errors.length });
  return info();
}

const info = () => ({
  root,
  name: root?.split(sep).pop(),
  files,
  failed,
});

const json = (res: Parameters<Connect.NextHandleFunction>[1], code: number, body: unknown) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const middleware: Connect.NextHandleFunction = async (req, res, next) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (url.pathname === '/api/source' && req.method === 'GET') return json(res, 200, root ? info() : { root: null });
    if (url.pathname === '/api/source' && req.method === 'POST') {
      if (connecting) return json(res, 409, { error: '正在读取另一个文件夹，请稍后重试' });
      let body = '';
      for await (const chunk of req) body += chunk;
      const path = JSON.parse(body).path;
      connecting = true;
      const controller = new AbortController();
      const cancel = () => controller.abort();
      res.on('close', cancel);
      try {
        if (!req.headers.accept?.includes('application/x-ndjson')) return json(res, 200, await connect(path, undefined, controller.signal));
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.flushHeaders();
        const send = (event: unknown) => { if (!res.destroyed) res.write(`${JSON.stringify(event)}\n`); };
        let last = 0;
        let phase = '';
        try {
          const source = await connect(path, (progress) => {
            // 扫描大目录时限制消息频率；阶段切换与最终数量始终发送。
            if (progress.phase !== phase || Date.now() - last >= 50 || progress.completed === progress.total) {
              send({ type: 'progress', progress }); last = Date.now(); phase = progress.phase;
            }
          }, controller.signal);
          send({ type: 'result', source });
        } catch (e) { send({ type: 'error', error: (e as Error).message }); }
        return res.end();
      } finally { res.off('close', cancel); connecting = false; }
    }
    if (url.pathname === '/api/source' && req.method === 'DELETE') {
      if (connecting) return json(res, 409, { error: '文件夹正在读取中' });
      root = null;
      files = [];
      failed = [];
      await writeFile(CONFIG, '{}').catch(() => {});
      return json(res, 200, { root: null });
    }
    // 开发辅助：保存渲染截图（.shots/ 用于标定），或零件库缩略图 / 示例预览图（public/ 随网站发布）
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const target = url.searchParams.get('dir');
      const dir = target === 'thumbs' || target === 'examples' ? resolve(`public/${target}`) : resolve('.shots');
      const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const b64 = Buffer.concat(chunks).toString().replace(/^data:image\/\w+;base64,/, '');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${name}.png`), Buffer.from(b64, 'base64'));
      return json(res, 200, { ok: true, path: join(dir, `${name}.png`) });
    }
    if (url.pathname === '/api/file') {
      if (!root) return json(res, 409, { error: '尚未连接模型文件夹' });
      if (url.searchParams.has('root') && url.searchParams.get('root') !== root) return json(res, 409, { error: '模型文件夹已切换，请重新连接' });
      const p = url.searchParams.get('p') ?? '';
      const full = resolve(root, p);
      const rel = relative(root, full);
      if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== full || !full.toLowerCase().endsWith('.stl')) return json(res, 403, { error: '路径不合法' });
      const st = await stat(full);
      res.setHeader('Content-Type', 'model/stl');
      res.setHeader('Content-Length', String(st.size));
      res.setHeader('Cache-Control', 'no-cache');
      return createReadStream(full).pipe(res);
    }
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }
  next();
};

export function localSource(): Plugin {
  const restore = async () => {
    const cfg = JSON.parse(await readFile(CONFIG, 'utf8').catch(() => '{}'));
    if (cfg.root) await connect(cfg.root).catch(() => {});
  };
  return {
    name: 'vault-local-source',
    async configureServer(server) {
      await restore();
      server.middlewares.use(middleware);
    },
    async configurePreviewServer(server) {
      await restore();
      server.middlewares.use(middleware);
    },
  };
}
