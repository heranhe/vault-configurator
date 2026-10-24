import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogFileSize, catalogPaths, normPath } from '../core/catalog';
import { connectPath, fromDrop, fromFileList, lookup, pickFolder, type ImportProgress, type ModelSource } from './source';
import { sourceIndex } from './source-index';

const box = '01. DRAWERS/01. S Families/S5/Boxes/S5 Box 1F.stl';
const drawerBase = '01. DRAWERS/01. S Families/S5/Gridfinity Baseplate/S5 Baseplate.stl';
const sustainerBase = '02. SUSTAINERS/05. Universal/Baseplates/01. S/S5 Baseplate.stl';
const file = (path: string) => Object.defineProperty(new File(['solid test'], path.split('/').pop()!, { lastModified: 123 }), 'webkitRelativePath', { value: path });
const dropped = (entries: unknown[]) => ({ items: entries, files: [] }) as unknown as DataTransfer;
const handleFile = (name: string, read = async () => file(name)) => ({ kind: 'file', name, getFile: read });
const dir = (name: string, children: unknown[]) => ({ kind: 'directory', name, async *values() { yield* children; } });
const handleItem = (handle: unknown) => ({ kind: 'file', getAsFileSystemHandle: async () => handle, getAsFile: () => null });

afterEach(() => vi.unstubAllGlobals());

describe('目录识别与文件归属', () => {
  it('完整 723 个模型经过多层外壳仍逐个匹配且保留原路径', async () => {
    const source = (await fromFileList(catalogPaths.map((p) => file(`下载/解压/VAULT/${p}`))))!;
    expect(source.files.size).toBe(catalogPaths.length);
    expect(sourceIndex(source).report).toMatchObject({ matched: catalogPaths.length, unmatched: [], ambiguous: [] });
    expect(lookup(source, box)?.path).toBe(`下载/解压/VAULT/${box.toLowerCase()}`);
  });

  it.each([box, `外层/解压/${box}`, 'S5/Boxes/S5 Box 1F.stl', 'S5 Box 1F.stl'])('根目录、子目录或独立文件：%s', async (path) => {
    const source = (await fromFileList([file(path)]))!;
    expect(await lookup(source, box)?.read()).toBeInstanceOf(Blob);
  });

  it('目录后缀区分同名底板，不能把一个文件用于多个不同模型', async () => {
    const source = (await fromFileList([file('Gridfinity Baseplate/S5 Baseplate.stl'), file('01. S/S5 Baseplate.stl')]))!;
    expect(lookup(source, drawerBase)?.path).toContain('Gridfinity Baseplate/');
    expect(lookup(source, sustainerBase)?.path).toContain('01. S/');
    expect(sourceIndex(source).report.matched).toBe(2);
    const flat = (await fromFileList([file('S5 Baseplate.stl')]))!;
    expect(lookup(flat, drawerBase)).toBeUndefined();
    expect(lookup(flat, sustainerBase)).toBeUndefined();
    expect(sourceIndex(flat).report.ambiguous).toEqual(['S5 Baseplate.stl']);
  });

  it('同模型多份完全相同的副本：用路径排序后的第一份，其余列为重复副本', async () => {
    const source = (await fromFileList([file(`旧版/${box}`), file(`新版/${box}`), file('S5 BOX 1F.STL')]))!;
    expect(source.files.size).toBe(3);
    expect(lookup(source, box)).toBeDefined();
    const { report } = sourceIndex(source);
    expect(report).toMatchObject({ matched: 1, ambiguous: [] });
    expect(report.duplicates).toHaveLength(2);
    expect(report.missing).not.toContain(normPath(box));
  });

  const sized = (entries: [string, number][]): ModelSource => ({
    kind: 'folder', name: 'test',
    files: new Map(entries.map(([path, size]) => [path, { path, size, version: '1', read: async () => new Blob() }])),
  });

  it('多份副本大小不同：用与官方文件字节数一致的那份', () => {
    const official = catalogFileSize(normPath(box))!;
    const source = sized([[`旧版/${box}`, official - 100], [`新版/${box}`, official]]);
    expect(lookup(source, box)?.path).toBe(`新版/${box}`);
    expect(sourceIndex(source).report.duplicates).toEqual([`旧版/${box}`]);
  });

  it('多份副本大小不同且都对不上官方文件：不猜，列为待确认并算作缺少', () => {
    const official = catalogFileSize(normPath(box))!;
    const source = sized([[`旧版/${box}`, official - 100], [`新版/${box}`, official + 100]]);
    expect(lookup(source, box)).toBeUndefined();
    const { report } = sourceIndex(source);
    expect(report.ambiguous).toHaveLength(2);
    expect(report.missing).toContain(normPath(box));
  });

  it('另一批模型包改了名（Runner Slide / Runner Slide XL）：按宽松名认出，并标为改名匹配', () => {
    const runners = '01. DRAWERS/07. Universal/Runners/';
    const renamed: [string, string][] = [
      ['Runners/x4 Runner Slide.stl', `${runners}x4 Runner Slides.stl`],
      ['Runners/x4 Runner Guide.stl', `${runners}x4 Runner Guides.stl`],
      ['XL Runners/x4 Runner Slide XL.stl', `${runners}XL4 Runner Slides.stl`],
      ['XL Runners/x4 Runner Guide XL.stl', `${runners}XL4 Runner Guides.stl`],
    ];
    const source = sized(renamed.map(([path]) => [path, 1000]));
    for (const [path, logical] of renamed) expect(lookup(source, logical)?.path, logical).toBe(path);
    const { report } = sourceIndex(source);
    expect(report.renamed).toHaveLength(4);
    expect(report.unmatched).toEqual([]);
  });

  it('宽松名在目录里不唯一（抽屉 / 收纳箱都有 S1F）时不按宽松名猜', () => {
    // 「S1F_.stl」宽松名是 s1f，目录里有多个（抽屉面板、收纳箱面板、洞洞板…）
    const source = sized([['S1F_.stl', 1000]]);
    expect(sourceIndex(source).report.renamed).toEqual([]);
    expect(sourceIndex(source).report.unmatched).toEqual(['S1F_.stl']);
  });

  it('缺少的文件逐个列出：完整包 723 个，少两个就报两个', () => {
    const drop = catalogPaths.filter((p) => p.includes('runner slides')).slice(0, 2);
    const source = sized(catalogPaths.filter((p) => !drop.includes(p)).map((p) => [p, catalogFileSize(p)!]));
    const { report } = sourceIndex(source);
    expect(report.matched).toBe(catalogPaths.length - 2);
    expect(report.missing).toEqual(drop);
  });

  it('忽略说明文件和 macOS 资源文件，并列出未知 STL', async () => {
    const source = (await fromFileList([file(box), file('README.pdf'), file('._S5 Box 1F.stl'), file('custom.stl')]))!;
    expect(source.files.size).toBe(2);
    expect(sourceIndex(source).report.unmatched).toEqual(['custom.stl']);
    expect(await fromFileList([file('README.pdf')])).toBeNull();
  });

  it('归一化 Windows 分隔符、大小写、多空格与 Roof 拼写', () => {
    const logical = catalogPaths.find((p) => p.includes('/roofs/') && p.includes('s5'))!;
    const physical = `包装\\${logical.replaceAll('/', '\\').replace('roofs', 'roof').toUpperCase()}`;
    const source: ModelSource = { kind: 'folder', name: 'test', files: new Map([[physical, { path: physical, size: 1, version: '1', read: async () => new Blob() }]]) };
    expect(lookup(source, logical)?.path).toBe(physical);
  });
});

describe('导入读取与进度', () => {
  it('先统计总数，再逐个读取，多目录拖入和根目录文件均处理', async () => {
    const progress: ImportProgress[] = [];
    const dt = dropped([
      handleItem(dir('模型包', [dir('内层', [handleFile('S5 Box 1F.stl')])])),
      handleItem(dir('其他', [handleFile('S5 Box 2F.stl')])),
      handleItem(handleFile('S5 Box 4F.stl')),
    ]);
    const source = (await fromDrop(dt, (p) => progress.push(p)))!;
    expect(source.files.size).toBe(3);
    expect(sourceIndex(source).report.matched).toBe(3);
    expect(progress.filter((p) => p.phase === 'reading').map((p) => p.completed)).toEqual([0, 1, 2, 3]);
    expect(progress.at(-1)).toMatchObject({ phase: 'done', total: 3, completed: 3, failed: 0 });
    expect(progress.some((p) => p.current === '模型包/内层/S5 Box 1F.stl')).toBe(true);
  });

  it('一个文件读取失败仍完成其他文件，并准确统计失败', async () => {
    const progress: ImportProgress[] = [];
    const source = (await fromDrop(dropped([handleItem(dir('包', [handleFile('S5 Box 1F.stl'), handleFile('broken.stl', async () => { throw new Error('permission'); })]))]), (p) => progress.push(p)))!;
    expect(source.files.size).toBe(1);
    expect(sourceIndex(source).report.failed).toEqual(['包/broken.stl']);
    expect(progress.at(-1)).toMatchObject({ total: 2, completed: 2, failed: 1 });
  });

  it('Safari 目录条目遍历读取所有批次，处理多个拖入入口', async () => {
    const entry = (name: string) => ({ name, fullPath: `/包/内层/${name}`, isDirectory: false, file: (ok: (f: File) => void) => ok(file(name)) });
    let batch = 0;
    const root = { name: '包', fullPath: '/包', isDirectory: true, createReader: () => ({ readEntries: (ok: (entries: unknown[]) => void) => ok(batch++ === 0 ? [entry('S5 Box 1F.stl')] : batch === 2 ? [entry('S5 Box 2F.stl')] : []) }) };
    const source = (await fromDrop(dropped([
      { kind: 'file', webkitGetAsEntry: () => root, getAsFile: () => null },
      { kind: 'file', getAsFile: () => file('S5 Box 4F.stl') },
    ])))!;
    expect(source.files.size).toBe(3);
    expect(batch).toBe(3);
  });

  it('目录权限失败及时拒绝，不让读取状态永久挂起', async () => {
    const root = { name: '包', fullPath: '/包', isDirectory: true, createReader: () => ({ readEntries: (_: unknown, reject: (error: Error) => void) => reject(new Error('无法读取目录')) }) };
    await expect(fromDrop(dropped([{ kind: 'file', webkitGetAsEntry: () => root, getAsFile: () => null }]))).rejects.toThrow('无法读取目录');
  });

  it('选择文件夹时取消会结束等待', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { body: { append: vi.fn() }, createElement: () => ({ remove: vi.fn(), click() { (this as unknown as { oncancel: () => void }).oncancel(); } }) });
    await expect(pickFolder()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('路径进度流支持分块 UTF-8，并保留所选子目录名称用于同名匹配', async () => {
    const events = [
      { type: 'progress', progress: { phase: 'reading', total: 1, discovered: 1, completed: 0, current: '11.stl', failed: 0 } },
      { type: 'result', source: { root: '/模型/20MM TALL', name: '20MM TALL', files: [{ p: '11.stl', size: 5, mtime: 1 }] } },
    ];
    const bytes = new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n'));
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }), { headers: { 'Content-Type': 'application/x-ndjson' } }));
    vi.stubGlobal('fetch', fetcher);
    const progress: ImportProgress[] = [];
    const source = await connectPath('/模型/20MM TALL', (p) => progress.push(p));
    const path = catalogPaths.find((p) => p.endsWith('/20mm tall/11.stl'))!;
    expect(lookup(source, path)?.path).toBe('20MM TALL/11.stl');
    await lookup(source, path)!.read();
    expect(fetcher).toHaveBeenLastCalledWith('/api/file?p=11.stl&root=%2F%E6%A8%A1%E5%9E%8B%2F20MM%20TALL');
    expect(progress.at(-1)).toMatchObject({ phase: 'done', total: 1, completed: 1 });
  });

  it('路径读取中断或服务报错不能误报成功', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"type":"error","error":"读取失败"}\n', { headers: { 'Content-Type': 'application/x-ndjson' } }));
    await expect(connectPath('/missing')).rejects.toThrow('读取失败');
    vi.stubGlobal('fetch', async () => new Response('', { headers: { 'Content-Type': 'application/x-ndjson' } }));
    await expect(connectPath('/missing')).rejects.toThrow('连接中断');
  });
});
