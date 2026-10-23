// 本地运行（npm run dev）时的模型通道：用户粘贴本地路径 → Node 读取该目录并把 STL 提供给网页。
// 只在开发/本地预览服务器里生效，模型文件不离开本机；部署成纯静态网站时走浏览器「选择文件夹」。
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import type { Connect, Plugin } from 'vite';

const CONFIG = resolve('.vault-local.json'); // 记住上次的路径（已加入 .gitignore）

type Entry = { p: string; size: number; mtime: number };
let root: string | null = null;
let files: Entry[] = [];

const stripToRoot = (p: string) => {
  const m = p.normalize('NFC').match(/(0[1-3]\. (DRAWERS|SUSTAINERS|MODIFICATIONS)\/.*)$/);
  return m ? m[1] : p.normalize('NFC');
};

async function scan(dir: string, out: Entry[], base: string) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) await scan(full, out, base);
    else if (ent.name.toLowerCase().endsWith('.stl')) {
      const st = await stat(full);
      out.push({ p: relative(base, full).split(sep).join('/').normalize('NFC'), size: st.size, mtime: st.mtimeMs });
    }
  }
}

async function connect(path: string) {
  const dir = resolve(path.trim().replace(/^~(?=$|\/)/, homedir()).replace(/^["']|["']$/g, ''));
  const st = await stat(dir).catch(() => null);
  if (!st?.isDirectory()) throw new Error(`找不到文件夹：${dir}`);
  const out: Entry[] = [];
  await scan(dir, out, dir);
  if (!out.length) throw new Error('这个文件夹里没有 STL 文件');
  root = dir;
  files = out;
  await writeFile(CONFIG, JSON.stringify({ root: dir }, null, 2)).catch(() => {});
  return info();
}

const info = () => ({
  root,
  name: root?.split(sep).pop(),
  files: files.map((f) => ({ ...f, key: stripToRoot(f.p) })),
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
      let body = '';
      for await (const chunk of req) body += chunk;
      return json(res, 200, await connect(JSON.parse(body).path));
    }
    if (url.pathname === '/api/source' && req.method === 'DELETE') {
      root = null;
      files = [];
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
      const p = url.searchParams.get('p') ?? '';
      const full = resolve(root, p);
      if (!full.startsWith(root + sep) || !full.toLowerCase().endsWith('.stl')) return json(res, 403, { error: '路径不合法' });
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
