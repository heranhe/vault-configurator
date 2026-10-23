import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelSource } from './models/source';
import { useStore } from './store';

const imported: ModelSource = { kind: 'folder', name: '用户模型', files: new Map() };
const saved = { root: '/saved/models', name: 'saved', files: [{ p: 'S5 Box 1F.stl', size: 1, mtime: 1 }] };

beforeEach(() => useStore.setState({ source: null, sourceRevision: 0, pathSupported: false, sourceDialog: true }));
afterEach(() => vi.unstubAllGlobals());

function delayedRestore() {
  let respond!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; })));
  const controller = new AbortController();
  const pending = useStore.getState().restoreSource(controller.signal);
  return { controller, pending, respond };
}

describe('模型连接状态同步', () => {
  it('启动请求迟到时不会清除刚导入的文件夹，保留结果弹窗', async () => {
    const { pending, respond } = delayedRestore();
    useStore.getState().setSource(imported);
    respond(Response.json({ root: null }));
    await pending;
    expect(useStore.getState().source).toBe(imported);
    expect(useStore.getState().sourceDialog).toBe(true);
    expect(useStore.getState().pathSupported).toBe(true);
  });

  it('用户连接后又断开时，旧请求不能重新连接上次目录', async () => {
    const { pending, respond } = delayedRestore();
    useStore.getState().setSource(imported);
    useStore.getState().setSource(null);
    respond(Response.json(saved));
    await pending;
    expect(useStore.getState().source).toBeNull();
  });

  it('没有用户操作时正常恢复服务器目录', async () => {
    const { pending, respond } = delayedRestore();
    respond(Response.json(saved));
    await pending;
    expect(useStore.getState().source).toMatchObject({ kind: 'path', name: 'saved' });
    expect(useStore.getState().source?.files.size).toBe(1);
  });

  it('已清理的初始化请求不再提交状态', async () => {
    const { controller, pending, respond } = delayedRestore();
    controller.abort();
    respond(Response.json(saved));
    await pending;
    expect(useStore.getState().source).toBeNull();
    expect(useStore.getState().pathSupported).toBe(false);
  });
});
