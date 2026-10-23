// 离线版构建（vite build --mode offline）：产物双击 HTML 即可在浏览器里用 file:// 打开。
// file:// 页面的来源是 null，浏览器会拦截它加载的模块脚本、样式表和 fetch，所以：
// - 脚本和样式直接内联进 HTML；
// - 体验模型改写成 <script> 能加载的 .js（经典脚本不受该限制），见 src/models/preview-source.ts；
// - 最后连同使用说明打成 zip。
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import type { Plugin } from 'vite';

export const OFFLINE_OUT = 'dist-offline';
const NAME = 'VAULT配置器-离线版';
const HTML = 'VAULT配置器.html';

/** 使用说明（中英双语），源文件在 tools/offline-docs/，构建时填入版本号和日期 */
function docs() {
  const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const date = new Date().toISOString().slice(0, 10);
  const fill = (f: string) => readFileSync(resolve('tools/offline-docs', f), 'utf8').replaceAll('{{VERSION}}', version).replaceAll('{{DATE}}', date);
  return {
    'README.md': fill('README.md'),
    // txt 加 UTF-8 BOM 和 CRLF：Windows 旧版记事本才能正确识别中文和换行
    '使用说明.txt': '\uFEFF' + fill('使用说明.txt').replace(/\r?\n/g, '\r\n'),
  };
}

/** 转义内联 JS 里的 </script 和 <!--，避免 HTML 解析器提前结束 <script> 标签 */
const safeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

/** 最小 ZIP 写入：deflate 压缩，文件名打 UTF-8 标记（0x0800），Windows 资源管理器解压中文名不会乱码。
 *  系统自带的 zip / ditto 都不打这个标记。 */
function zip(files: { name: string; data: Buffer; mtime: Date }[]) {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), body = deflateRawSync(f.data, { level: 9 }), crc = crc32(f.data);
    const d = f.mtime;
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const common = (h: Buffer, at: number) => {
      h.writeUInt16LE(20, at); h.writeUInt16LE(0x0800, at + 2); h.writeUInt16LE(8, at + 4);
      h.writeUInt16LE(time, at + 6); h.writeUInt16LE(date, at + 8); h.writeUInt32LE(crc, at + 10);
      h.writeUInt32LE(body.length, at + 14); h.writeUInt32LE(f.data.length, at + 18); h.writeUInt16LE(name.length, at + 22);
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); common(local, 4);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); common(entry, 6); entry.writeUInt32LE(offset, 42);
    parts.push(local, name, body);
    central.push(entry, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (f !== '.DS_Store') yield p;
  }
}

export function offline(): Plugin {
  return {
    name: 'vault-offline',
    apply: (_, env) => env.command === 'build' && env.mode === 'offline',
    // 排在所有插件之后：Vite 先生成 index.html 的标签、替换动态导入的 __VITE_PRELOAD__ 占位，再内联
    generateBundle: { order: 'post', handler(_, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return this.error('离线版构建没有找到 index.html');
      let text = String(html.source);
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type === 'chunk' && out.isEntry) {
          text = text.replace(new RegExp(`<script[^>]*src="\\./${file}"[^>]*></script>`), () => `<script type="module">${safeScript(out.code)}</script>`);
          delete bundle[file];
        } else if (out.type === 'asset' && file.endsWith('.css')) {
          text = text.replace(new RegExp(`<link[^>]*href="\\./${file}"[^>]*>`), () => `<style>${out.source}</style>`);
          delete bundle[file];
        }
      }
      if (/src="\.\/assets\/|href="\.\/assets\//.test(text)) this.error('离线版仍引用了外部脚本或样式，file:// 下会被拦截');
      if (text.includes('__VITE_PRELOAD__')) this.error('内联脚本里还有未替换的 __VITE_PRELOAD__');
      html.source = text;
    } },
    closeBundle() {
      const out = resolve(OFFLINE_OUT);
      if (!existsSync(join(out, 'index.html'))) return;
      renameSync(join(out, 'index.html'), join(out, HTML));
      rmSync(join(out, '_headers'), { force: true }); // Cloudflare 专用

      // 体验模型：.mesh.gz / manifest.json → 能用 <script> 加载的 .js
      const models = join(out, 'demo-models');
      const put = (key: string, value: string) => `(window.__VAULT_DEMO__ = window.__VAULT_DEMO__ || {})[${JSON.stringify(key)}] = ${value};\n`;
      for (const f of readdirSync(models)) {
        const p = join(models, f);
        if (f.endsWith('.mesh.gz')) writeFileSync(`${p}.js`, put(f, JSON.stringify(readFileSync(p).toString('base64'))));
        else if (f === 'manifest.json') writeFileSync(`${p}.js`, put(f, readFileSync(p, 'utf8').trim()));
        else continue;
        rmSync(p);
      }

      // 打包：dist-offline/VAULT配置器-离线版/ + 使用说明 → dist-offline/VAULT配置器-离线版.zip
      const stage = join(out, NAME);
      mkdirSync(stage);
      for (const f of readdirSync(out)) if (f !== NAME) renameSync(join(out, f), join(stage, f));
      for (const [f, text] of Object.entries(docs())) writeFileSync(join(stage, f), text);
      const files = [...walk(stage)].map((p) => ({ name: relative(out, p).split(sep).join('/'), data: readFileSync(p), mtime: statSync(p).mtime }));
      writeFileSync(join(out, `${NAME}.zip`), zip(files));
    },
  };
}
