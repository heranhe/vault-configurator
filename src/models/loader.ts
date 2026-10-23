// 按需预览：本地 STL 简化或在线轻量网格 → 内存缓存 + OPFS 磁盘缓存
import type { SimplifyRequest, SimplifyResult } from './stl.worker';
import { lookup, type ModelSource } from './source';
import { normPath, resolveFile } from '../core/catalog';

import { decodeMesh, encodeMesh, type MeshData } from './mesh-codec';
import { previewEntry } from './preview-source';
export type { MeshData } from './mesh-codec';

const CACHE_VERSION = 'v2';
const WORKERS = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 2));
const pool: { w: Worker; busy: boolean }[] = [];
const queue: { req: Omit<SimplifyRequest, 'id'>; resolve: (r: SimplifyResult) => void; reject: (e: Error) => void }[] = [];
const pending = new Map<number, { resolve: (r: SimplifyResult) => void; reject: (e: Error) => void; slot: (typeof pool)[number] }>();
let seq = 0;

function pump() {
  for (const slot of pool.length < WORKERS ? [...pool, newSlot()] : pool) {
    if (slot.busy || !queue.length) continue;
    const job = queue.shift()!;
    const id = ++seq;
    slot.busy = true;
    pending.set(id, { resolve: job.resolve, reject: job.reject, slot });
    slot.w.postMessage({ ...job.req, id }, [job.req.buffer]);
  }
}

function newSlot() {
  const w = new Worker(new URL('./stl.worker.ts', import.meta.url), { type: 'module' });
  const slot = { w, busy: false };
  w.onmessage = (e: MessageEvent<SimplifyResult>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    p.slot.busy = false;
    if (e.data.error) p.reject(new Error(e.data.error));
    else p.resolve(e.data);
    pump();
  };
  pool.push(slot);
  return slot;
}

const runWorker = (req: Omit<SimplifyRequest, 'id'>) =>
  new Promise<SimplifyResult>((resolve, reject) => {
    queue.push({ req, resolve, reject });
    pump();
  });

// ---------- OPFS 持久缓存 ----------
async function cacheDir() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('mesh-v1', { recursive: true }).catch(() => {}); // 清掉旧版本缓存
    return await root.getDirectoryHandle(`mesh-${CACHE_VERSION}`, { create: true });
  } catch {
    return null;
  }
}

async function hashKey(s: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readCache(key: string): Promise<MeshData | null> {
  try {
    const dir = await cacheDir();
    if (!dir) return null;
    const file = await (await dir.getFileHandle(await hashKey(key))).getFile();
    const buf = await file.arrayBuffer();
    return decodeMesh(buf);
  } catch {
    return null;
  }
}

async function writeCache(key: string, m: MeshData) {
  try {
    const dir = await cacheDir();
    if (!dir) return;
    const out = encodeMesh(m);
    const fh = await dir.getFileHandle(await hashKey(key), { create: true });
    const ws = await (fh as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
    await ws.write(out);
    await ws.close();
  } catch {
    /* 缓存失败不影响显示 */
  }
}

export async function clearMeshCache() {
  memory.clear();
  remoteMemory.clear();
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(`mesh-${CACHE_VERSION}`, { recursive: true });
  } catch {
    /* 忽略 */
  }
}

// ---------- 对外接口 ----------
const memory = new Map<string, Promise<MeshData>>();
type Progress = { active: number; done: number; current?: string };
const listeners = new Set<(p: Progress) => void>();
const progress: Progress = { active: 0, done: 0 };
const emit = () => listeners.forEach((l) => l({ ...progress }));
export const onLoadProgress = (fn: (p: Progress) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** 优先本地 STL；无本地来源时按需读取在线预览。两者均不可用时显示代理模型。 */
export function loadMesh(src: ModelSource | null, logicalPath: string, autoZ: boolean, allowDemo = true): Promise<MeshData | null> | null {
  const f = lookup(src, logicalPath);
  if (!f) return allowDemo ? loadPreview(logicalPath) : null;
  const key = `${f.path}|${f.size}|${f.version}|${autoZ ? 'z' : ''}`;
  let p = memory.get(key);
  if (!p) {
    p = (async () => {
      const cached = await readCache(key);
      if (cached) return cached;
      progress.active++;
      progress.current = f.path.split('/').pop();
      emit();
      try {
        const buffer = await (await f.read()).arrayBuffer();
        const r = await runWorker({ buffer, autoZ });
        const m = { positions: r.positions, indices: r.indices, angleZ: r.angleZ };
        await writeCache(key, m); // 先写缓存再交给渲染，避免写入被修改过的数据
        return m;
      } finally {
        progress.active--;
        progress.done++;
        emit();
      }
    })();
    p.catch(() => memory.delete(key));
    memory.set(key, p);
  }
  return p;
}

// 在线预览走独立缓存键，永远不会被当成打印 STL 导出。
function loadPreview(path: string): Promise<MeshData | null> {
  const requestKey = `preview:${normPath(resolveFile(path)?.p ?? path)}`;
  let p = remoteMemory.get(requestKey);
  if (!p) {
    p = (async () => {
      const entry = await previewEntry(path);
      if (!entry) return null;
      const cached = await readCache(entry.key);
      if (cached) return cached;
      progress.active++;
      progress.current = path.split('/').pop();
      emit();
      try {
        const mesh = await entry.read();
        await writeCache(entry.key, mesh);
        return mesh;
      } finally {
        progress.active--;
        progress.done++;
        emit();
      }
    })();
    p.catch(() => remoteMemory.delete(requestKey));
    remoteMemory.set(requestKey, p);
  }
  return p;
}
const remoteMemory = new Map<string, Promise<MeshData | null>>();
