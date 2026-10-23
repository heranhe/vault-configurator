// 真实模型加载：读本地 STL → Worker 简化 → 内存缓存 + OPFS 持久缓存（第二次打开秒开）
import type { SimplifyRequest, SimplifyResult } from './stl.worker';
import { lookup, type ModelSource } from './source';

export type MeshData = { positions: Float32Array; indices: Uint32Array; angleZ: number };

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
    const head = new Float64Array(buf, 0, 3); // [顶点数, 索引数, angleZ]
    const nv = head[0], ni = head[1];
    return {
      positions: new Float32Array(buf, 24, nv * 3),
      indices: new Uint32Array(buf, 24 + nv * 12, ni),
      angleZ: head[2],
    };
  } catch {
    return null;
  }
}

async function writeCache(key: string, m: MeshData) {
  try {
    const dir = await cacheDir();
    if (!dir) return;
    const nv = m.positions.length / 3;
    const out = new Uint8Array(24 + m.positions.byteLength + m.indices.byteLength);
    new Float64Array(out.buffer, 0, 3).set([nv, m.indices.length, m.angleZ]);
    out.set(new Uint8Array(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength), 24);
    out.set(new Uint8Array(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength), 24 + m.positions.byteLength);
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

/** 加载并简化一个零件。找不到本地文件时返回 null（界面退回代理模型） */
export function loadMesh(src: ModelSource | null, logicalPath: string, autoZ: boolean): Promise<MeshData> | null {
  const f = lookup(src, logicalPath);
  if (!f) return null;
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
