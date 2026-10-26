// 路径、选择文件夹、拖拽共用目录索引；连接时只读取文件信息，STL 内容按需读取。
import { normPath } from '../core/catalog';
import { sourceIndex } from './source-index';

export type SourceFile = { path: string; size: number; version: string; read: () => Promise<Blob> };
export type ModelSource = {
  kind: 'path' | 'folder';
  name: string;
  root?: string;
  files: Map<string, SourceFile>; // 保留实际相对路径，避免同名文件互相覆盖
  failed?: string[];
};
export type ImportProgress = {
  phase: 'selecting' | 'scanning' | 'reading' | 'done';
  discovered: number;
  completed: number;
  total?: number;
  current?: string;
  failed: number;
  message?: string;
};
export type OnImportProgress = (progress: ImportProgress) => void;
export const lookup = (src: ModelSource | null, logical: string) => src ? sourceIndex(src).files.get(normPath(logical)) : undefined;

export type ServerInfo = { root: string | null; name?: string; files?: { p: string; size: number; mtime: number }[]; failed?: string[]; error?: string };

function fromServer(info: ServerInfo): ModelSource | null {
  if (!info.root || !info.files) return null;
  const files = new Map<string, SourceFile>();
  for (const f of info.files) {
    files.set(f.p, {
      path: info.name ? `${info.name}/${f.p}` : f.p,
      size: f.size,
      version: String(f.mtime),
      read: () => fetch(`/api/file?p=${encodeURIComponent(f.p)}&root=${encodeURIComponent(info.root!)}`).then((r) => {
        if (!r.ok) throw new Error(`读取失败：${f.p}`);
        return r.blob();
      }),
    });
  }
  return { kind: 'path', name: info.name ?? info.root, root: info.root, files, failed: info.failed };
}

/** 本地服务器是否可用（npm run dev 时可用；部署成静态网站时不可用） */
export async function serverSource(signal?: AbortSignal): Promise<{ available: boolean; source: ModelSource | null }> {
  try {
    const r = await fetch('/api/source', { signal });
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return { available: false, source: null };
    return { available: true, source: fromServer(await r.json()) };
  } catch {
    return { available: false, source: null };
  }
}

export async function connectPath(path: string, onProgress?: OnImportProgress, signal?: AbortSignal): Promise<ModelSource> {
  onProgress?.({ phase: 'scanning', discovered: 0, completed: 0, failed: 0 });
  const r = await fetch('/api/source', { method: 'POST', headers: { Accept: 'application/x-ndjson', 'Content-Type': 'application/json' }, body: JSON.stringify({ path }), signal });
  let info: ServerInfo | undefined;
  if (r.headers.get('content-type')?.includes('application/x-ndjson') && r.body) {
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const line = (s: string) => {
      if (!s.trim()) return;
      const event = JSON.parse(s) as { type: string; progress?: ImportProgress; source?: ServerInfo; error?: string };
      if (event.error) throw new Error(event.error);
      if (event.progress) onProgress?.(event.progress);
      if (event.source) info = event.source;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop()!;
        for (const s of lines) line(s);
        if (done) { line(pending); break; }
      }
    } finally { reader.releaseLock(); }
  } else {
    info = await r.json();
  }
  if (!r.ok || info?.error) throw new Error(info?.error ?? '连接失败');
  const source = info && fromServer(info);
  if (!source) throw new Error('连接中断，请重试');
  onProgress?.({ phase: 'done', discovered: source.files.size + (source.failed?.length ?? 0), completed: source.files.size + (source.failed?.length ?? 0), total: source.files.size + (source.failed?.length ?? 0), failed: source.failed?.length ?? 0 });
  return source;
}

export async function disconnectPath() {
  await fetch('/api/source', { method: 'DELETE' }).catch(() => {});
}

type DirHandle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type PendingFile = { path: string; read: () => Promise<File> };
const isStl = (name: string) => name.toLowerCase().endsWith('.stl') && !name.startsWith('._');
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('已取消读取', 'AbortError');
}

/** 某些内嵌浏览器的文件 API 不返回结果，不能让一次等待锁死整个导入窗口。 */
function waitForFileAPI<T>(task: Promise<T>, signal: AbortSignal | undefined, label: string, timeout = 30_000): Promise<T> {
  checkAbort(signal);
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal?.reason ?? new DOMException('已取消读取', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new DOMException(`${label}超时，请改用粘贴本地路径或拖入文件夹`, 'TimeoutError')); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    task.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

function scanner(onProgress?: OnImportProgress, signal?: AbortSignal) {
  const pending: PendingFile[] = [];
  const errors: { path: string; error: unknown }[] = [];
  let lastYield = performance.now();
  return {
    pending,
    errors,
    signal,
    /** 某个子文件夹读不了（名称 / 路径浏览器不认等）：记下来继续读其他的，不让整个导入失败；取消和超时照常中断 */
    fail(path: string, error: unknown) {
      const name = (error as Error | undefined)?.name;
      if (name === 'AbortError' || name === 'TimeoutError') throw error;
      errors.push({ path, error });
    },
    async visit(path: string, read?: () => Promise<File>) {
      checkAbort(signal);
      if (read) pending.push({ path, read });
      onProgress?.({ phase: 'scanning', discovered: pending.length, completed: 0, current: path, failed: 0 });
      if (performance.now() - lastYield > 16) { await pause(); lastYield = performance.now(); }
    },
  };
}
type Scanner = ReturnType<typeof scanner>;

async function walk(dir: DirHandle, prefix: string, scan: Scanner) {
  let iterator: AsyncIterator<FileSystemHandle>;
  try { iterator = dir.values()[Symbol.asyncIterator](); } catch (error) { return scan.fail(prefix, error); }
  while (true) {
    let next: IteratorResult<FileSystemHandle>;
    try { next = await waitForFileAPI(iterator.next(), scan.signal, `扫描 ${prefix} `); } catch (error) { return scan.fail(prefix, error); }
    if (next.done) break;
    const h = next.value;
    if (h.name.startsWith('.')) continue;
    const path = `${prefix}/${h.name}`;
    if (h.kind === 'directory') { await scan.visit(path); await walk(h as DirHandle, path, scan); }
    else if (isStl(h.name)) await scan.visit(path, () => (h as FileSystemFileHandle).getFile());
  }
}

async function readFiles(pending: PendingFile[], name: string, onProgress?: OnImportProgress, signal?: AbortSignal, unreadable: string[] = []): Promise<ModelSource | null> {
  checkAbort(signal);
  if (!pending.length) return null;
  const files = new Map<string, SourceFile>();
  const failed: string[] = [...unreadable];
  const total = pending.length;
  onProgress?.({ phase: 'reading', discovered: total, total, completed: 0, current: pending[0].path, failed: 0 });
  await pause();
  let lastYield = performance.now();
  for (let i = 0; i < total; i++) {
    checkAbort(signal);
    const item = pending[i];
    try {
      const file = await waitForFileAPI(item.read(), signal, `读取 ${item.path} `);
      // Map 使用原始路径：大小写 / Unicode 归一化后冲突也留给匹配阶段显式报告。
      const key = files.has(item.path) ? `${item.path}\0${i}` : item.path;
      files.set(key, { path: item.path, size: file.size, version: String(file.lastModified), read: async () => file });
    } catch (error) {
      checkAbort(signal);
      if ((error as Error).name === 'TimeoutError') throw error;
      failed.push(item.path);
    }
    onProgress?.({ phase: 'reading', discovered: total, total, completed: i + 1, current: pending[i + 1]?.path ?? item.path, failed: failed.length });
    if (performance.now() - lastYield > 16) { await pause(); lastYield = performance.now(); }
  }
  if (!files.size) throw new Error(`无法读取 ${failed.length} 个 STL 文件，请检查文件夹权限后重试`);
  const source: ModelSource = { kind: 'folder', name, files, failed };
  checkAbort(signal);
  sourceIndex(source);
  onProgress?.({ phase: 'done', discovered: total, total, completed: total, failed: failed.length });
  return source;
}

/**
 * 双击 HTML 打开（file://）的离线版：页面来源是 null，Chrome / Edge 的目录选择 API（showDirectoryPicker）
 * 在这种页面上无法为文件夹里的路径生成合法地址，会报 EncodingError：「A URI supplied to the API was malformed…」。
 * 所以 file:// 一律用 <input webkitdirectory>（Chrome / Edge / Safari / Firefox 都支持）。
 */
export const isFileProtocol = () => globalThis.location?.protocol === 'file:';

/** 导入失败时给用户看的原因和建议；浏览器自己的英文报错对用户没用 */
export function importErrorMessage(error: Error) {
  switch (error.name) {
    case 'EncodingError':
      return '浏览器无法读取这个文件夹里的某个名称或路径（常见于双击打开的离线页面，或名称里有特殊字符）。请点下面的「改用兼容方式选择文件夹」重试。';
    case 'SecurityError':
    case 'NotAllowedError':
    case 'NotReadableError':
      return '浏览器没有权限读取这个文件夹。请选解压好的模型文件夹本身（不要选桌面、下载这类系统文件夹），或点下面的「改用兼容方式选择文件夹」重试。';
    default:
      return error.message;
  }
}

/** 支持目录选择 API 的浏览器直接选择（file:// 除外），否则使用 webkitdirectory（包括 Safari）。 */
export async function pickFolder(onProgress?: OnImportProgress, signal?: AbortSignal, options: { compat?: boolean } = {}): Promise<ModelSource | null> {
  onProgress?.({ phase: 'selecting', discovered: 0, completed: 0, failed: 0,
    message: '请选择文件夹。浏览器返回目录后，开始统计文件数量。' });
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> };
  if (w.showDirectoryPicker && !options.compat && !isFileProtocol()) {
    const dir = await waitForFileAPI(w.showDirectoryPicker({ id: 'vault-models', mode: 'read' }), signal, '选择文件夹', 120_000);
    const scan = scanner(onProgress, signal);
    await scan.visit(dir.name);
    await walk(dir, dir.name, scan);
    if (!scan.pending.length && scan.errors.length) throw scan.errors[0].error; // 根目录就读不了：报真实原因，不说成「没有 STL」
    return readFiles(scan.pending, dir.name, onProgress, signal, scan.errors.map((e) => e.path));
  }
  const list = await new Promise<File[] | null>((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', webkitdirectory: true, multiple: true });
    input.hidden = true;
    let settled = false;
    const finish = (files: File[] | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      input.remove();
      if (error) reject(error);
      else resolve(files);
    };
    const abort = () => finish(null);
    const timer = setTimeout(() => finish(null, new Error('浏览器未返回文件夹，请改用粘贴本地路径或直接拖入文件夹')), 120_000);
    input.onchange = () => finish([...(input.files ?? [])]);
    input.oncancel = () => finish(null);
    signal?.addEventListener('abort', abort, { once: true });
    // Safari / 内嵌 WebView 中，脱离 DOM 的 input 可能不派发 change / cancel。
    document.body.append(input);
    if (signal?.aborted) finish(null);
    else {
      try { input.click(); } catch { finish(null); }
    }
  });
  checkAbort(signal);
  if (!list) throw new DOMException('已取消选择', 'AbortError');
  return fromFileList(list, onProgress, signal);
}

export async function fromFileList(list: File[], onProgress?: OnImportProgress, signal?: AbortSignal): Promise<ModelSource | null> {
  const pending = list.filter((f) => isStl(f.name)).map((f) => ({ path: f.webkitRelativePath || f.name, read: async () => f }));
  const name = list[0]?.webkitRelativePath.split('/')[0] || '本地文件';
  return readFiles(pending, name, onProgress, signal);
}

async function walkEntry(entry: FileSystemEntry, scan: Scanner): Promise<void> {
  if (entry.name.startsWith('.')) return;
  const path = entry.fullPath.replace(/^\//, '');
  if (entry.isDirectory) {
    await scan.visit(path);
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    while (true) {
      let entries: FileSystemEntry[];
      try { entries = await waitForFileAPI(new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject)), scan.signal, `扫描 ${path} `); } catch (error) { return scan.fail(path, error); }
      if (!entries.length) break;
      for (const child of entries) await walkEntry(child, scan);
    }
  } else if (isStl(entry.name)) {
    await scan.visit(path, () => new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
  }
}

/** 在 drop 事件内立即保存所有入口：DataTransfer 在首次 await 后可能失效。 */
export async function fromDrop(dt: DataTransfer, onProgress?: OnImportProgress, signal?: AbortSignal): Promise<ModelSource | null> {
  onProgress?.({ phase: 'scanning', discovered: 0, completed: 0, failed: 0, message: '正在打开拖入的文件夹…' });
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const entries = items.map((item) => {
    const withHandle = item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
    const entry = item.webkitGetAsEntry?.();
    // 优先使用同步取得的目录入口，避免等一个在内嵌浏览器中可能永不返回的 handle。
    return { handle: entry ? undefined : withHandle.getAsFileSystemHandle?.().catch(() => null), entry, file: entry ? null : item.getAsFile() };
  });
  const fallback = [...dt.files];
  if (!entries.length) return fromFileList(fallback, onProgress, signal);
  const scan = scanner(onProgress, signal);
  const names: string[] = [];
  for (const item of entries) {
    checkAbort(signal);
    const h = item.handle ? await waitForFileAPI(item.handle, signal, '打开拖入的文件夹') : null;
    if (h?.kind === 'directory') { names.push(h.name); await scan.visit(h.name); await walk(h as DirHandle, h.name, scan); }
    else if (h?.kind === 'file') { names.push(h.name); if (isStl(h.name)) await scan.visit(h.name, () => (h as FileSystemFileHandle).getFile()); }
    else if (item.entry) { names.push(item.entry.name); await walkEntry(item.entry, scan); }
    else if (item.file && isStl(item.file.name)) { const file = item.file; names.push(file.name); await scan.visit(file.name, async () => file); }
  }
  if (!scan.pending.length && scan.errors.length) throw scan.errors[0].error;
  return readFiles(scan.pending, names.length === 1 ? names[0] : `${names.length} 个文件 / 文件夹`, onProgress, signal, scan.errors.map((e) => e.path));
}
