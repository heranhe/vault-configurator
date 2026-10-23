import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeMesh, encodeMesh } from './mesh-codec';

const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), angleZ: 0.5 };
const file = `${'a'.repeat(64)}.mesh.gz`;
const dataResponse = () => new Response(new Blob([encodeMesh(mesh)]).stream().pipeThrough(new CompressionStream('gzip')));

beforeEach(() => { vi.resetModules(); vi.stubGlobal('navigator', { hardwareConcurrency: 4 }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('基础体验预览', () => {
  it('校验预览文件，拒绝损坏的索引', () => {
    const encoded = encodeMesh(mesh);
    expect(decodeMesh(encoded.buffer).positions).toEqual(mesh.positions);
    new Uint32Array(encoded.buffer, 24 + mesh.positions.byteLength)[0] = 99;
    expect(() => decodeMesh(encoded.buffer)).toThrow('索引越界');
  });

  it('不预取未使用零件；相同零件合并请求，无本地来源也能显示', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? Response.json({ version: 1, files: { 'used.stl': { file }, 'unused.stl': { file: `${'b'.repeat(64)}.mesh.gz` } } })
      : dataResponse());
    vi.stubGlobal('fetch', fetcher);
    const { loadMesh } = await import('./loader');
    expect(fetcher).not.toHaveBeenCalled();
    const a = loadMesh(null, 'used.stl', true);
    const b = loadMesh(null, 'used.stl', true);
    expect(a).toBe(b);
    expect((await a)?.angleZ).toBe(mesh.angleZ);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/demo-models/manifest.json', `/demo-models/${file}`]);
    await loadMesh(null, 'used.stl', true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('网络模型最多同时下载三个', async () => {
    const releases: (() => void)[] = [];
    let active = 0, peak = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('manifest.json')) return Response.json({ version: 1, files: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`${i}.stl`, { file }])) });
      active++; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return dataResponse();
    }));
    const { previewEntry } = await import('./preview-source');
    const jobs = await Promise.all(Array.from({ length: 6 }, (_, i) => previewEntry(`${i}.stl`)));
    const downloads = jobs.map((entry) => entry!.read());
    await vi.waitFor(() => expect(releases.length).toBe(3));
    for (let i = 0; i < 6; i++) {
      await vi.waitFor(() => expect(releases[i]).toBeTypeOf('function'));
      releases[i]();
    }
    await Promise.all(downloads);
    expect(peak).toBe(3);
  });

  it('服务器用 Content-Encoding 解压过的网格不再解压第二次', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('manifest.json')
      ? Response.json({ version: 1, files: { 'decoded.stl': { file } } })
      : new Response(encodeMesh(mesh), { headers: { 'Content-Encoding': 'gzip' } })));
    const { loadMesh } = await import('./loader');
    expect((await loadMesh(null, 'decoded.stl', true))?.positions).toEqual(mesh.positions);
  });

  it('OPFS 缓存命中后不再下载模型', async () => {
    const packed = encodeMesh(mesh);
    vi.stubGlobal('navigator', { hardwareConcurrency: 4, storage: { getDirectory: async () => ({
      removeEntry: async () => {},
      getDirectoryHandle: async () => ({ getFileHandle: async () => ({ getFile: async () => new Blob([packed]) }) }),
    }) } });
    const fetcher = vi.fn(async () => Response.json({ version: 1, files: { 'cached.stl': { file } } }));
    vi.stubGlobal('fetch', fetcher);
    const { loadMesh } = await import('./loader');
    expect((await loadMesh(null, 'cached.stl', true))?.angleZ).toBe(mesh.angleZ);
    expect(fetcher).toHaveBeenCalledTimes(1); // 只读目录，不读网格
  });

  it('在线目录未部署时保持代理模型，且不重复请求目录', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    const { loadMesh } = await import('./loader');
    expect(await loadMesh(null, 'missing.stl', true)).toBeNull();
    expect(await loadMesh(null, 'other.stl', true)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it('非体验单元没有本地模型时不请求在线资源', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { loadMesh } = await import('./loader');
  expect(loadMesh(null, 'other.stl', true, false)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
