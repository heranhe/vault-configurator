// 模型来源：①本地运行时粘贴路径（Node 读取）②浏览器选择 / 拖入文件夹。两者对上层提供同一接口
import { normPath, stripToRoot } from '../core/catalog';

export type SourceFile = { path: string; size: number; version: string; read: () => Promise<Blob> };
export type ModelSource = {
  kind: 'path' | 'folder';
  name: string;
  root?: string;
  files: Map<string, SourceFile>; // 键 = normPath(从 01./02./03. 开始的相对路径)
};

export const lookup = (src: ModelSource | null, logical: string) => src?.files.get(normPath(logical));

type ServerInfo = { root: string | null; name?: string; files?: { p: string; key: string; size: number; mtime: number }[]; error?: string };

function fromServer(info: ServerInfo): ModelSource | null {
  if (!info.root || !info.files) return null;
  const files = new Map<string, SourceFile>();
  for (const f of info.files) {
    files.set(normPath(f.key), {
      path: f.key,
      size: f.size,
      version: String(f.mtime),
      read: () => fetch(`/api/file?p=${encodeURIComponent(f.p)}`).then((r) => {
        if (!r.ok) throw new Error(`读取失败：${f.p}`);
        return r.blob();
      }),
    });
  }
  return { kind: 'path', name: info.name ?? info.root, root: info.root, files };
}

/** 本地服务器是否可用（npm run dev 时可用；部署成静态网站时不可用） */
export async function serverSource(): Promise<{ available: boolean; source: ModelSource | null }> {
  try {
    const r = await fetch('/api/source');
    if (!r.ok || !r.headers.get('content-type')?.includes('json')) return { available: false, source: null };
    return { available: true, source: fromServer(await r.json()) };
  } catch {
    return { available: false, source: null };
  }
}

export async function connectPath(path: string): Promise<ModelSource> {
  const r = await fetch('/api/source', { method: 'POST', body: JSON.stringify({ path }) });
  const info: ServerInfo = await r.json();
  if (!r.ok) throw new Error(info.error ?? '连接失败');
  return fromServer(info)!;
}

export async function disconnectPath() {
  await fetch('/api/source', { method: 'DELETE' }).catch(() => {});
}

type DirHandle = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };

async function walk(dir: DirHandle, prefix: string, out: Map<string, SourceFile>) {
  for await (const h of dir.values()) {
    const rel = prefix ? `${prefix}/${h.name}` : h.name;
    if (h.kind === 'directory') await walk(h as DirHandle, rel, out);
    else if (h.name.toLowerCase().endsWith('.stl')) {
      const file = await (h as FileSystemFileHandle).getFile();
      const key = stripToRoot(rel);
      out.set(normPath(key), { path: key, size: file.size, version: String(file.lastModified), read: async () => file });
    }
  }
}

/** Chrome / Edge：showDirectoryPicker；其他浏览器：<input webkitdirectory> */
export async function pickFolder(): Promise<ModelSource | null> {
  const w = window as unknown as { showDirectoryPicker?: (o?: object) => Promise<DirHandle> };
  if (w.showDirectoryPicker) {
    const dir = await w.showDirectoryPicker({ id: 'vault-models', mode: 'read' });
    return fromHandle(dir);
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', webkitdirectory: true });
    input.onchange = () => resolve(fromFileList([...(input.files ?? [])]));
    input.click();
  });
}

async function fromHandle(dir: DirHandle): Promise<ModelSource | null> {
  const files = new Map<string, SourceFile>();
  await walk(dir, '', files);
  return files.size ? { kind: 'folder', name: dir.name, files } : null;
}

function fromFileList(list: File[]): ModelSource | null {
  const stl = list.filter((f) => f.name.toLowerCase().endsWith('.stl'));
  if (!stl.length) return null;
  const files = new Map<string, SourceFile>();
  for (const f of stl) {
    const key = stripToRoot(f.webkitRelativePath || f.name);
    files.set(normPath(key), { path: key, size: f.size, version: String(f.lastModified), read: async () => f });
  }
  return { kind: 'folder', name: (stl[0].webkitRelativePath || '').split('/')[0] || '本地文件夹', files };
}

/** 把文件夹直接拖进网页（Chrome / Edge / Safari 支持 getAsFileSystemHandle 或 webkitGetAsEntry） */
export async function fromDrop(dt: DataTransfer): Promise<ModelSource | null> {
  const item = [...dt.items].find((i) => i.kind === 'file');
  if (!item) return null;
  const withHandle = item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
  if (withHandle.getAsFileSystemHandle) {
    const h = await withHandle.getAsFileSystemHandle();
    if (h?.kind === 'directory') return fromHandle(h as DirHandle);
  }
  const entry = item.webkitGetAsEntry?.();
  if (!entry?.isDirectory) return null;
  const files: File[] = [];
  const readDir = (dir: FileSystemDirectoryEntry): Promise<void> =>
    new Promise((resolve) => {
      const reader = dir.createReader();
      const batch = () =>
        reader.readEntries(async (entries) => {
          if (!entries.length) return resolve();
          for (const en of entries) {
            if (en.isDirectory) await readDir(en as FileSystemDirectoryEntry);
            else if (en.name.toLowerCase().endsWith('.stl'))
              files.push(await new Promise<File>((r) => (en as FileSystemFileEntry).file((f) => r(Object.defineProperty(f, 'webkitRelativePath', { value: en.fullPath.slice(1) })))));
          }
          batch();
        });
      batch();
    });
  await readDir(entry as FileSystemDirectoryEntry);
  return fromFileList(files);
}
