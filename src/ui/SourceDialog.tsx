import { useEffect, useState } from 'react';
import { catalogSize } from '../core/catalog';
import { clearMeshCache, onLoadProgress } from '../models/loader';
import { connectPath, disconnectPath, fromDrop, pickFolder, serverSource, type ModelSource } from '../models/source';
import { useStore } from '../store';

const EXAMPLE = '~/Downloads/0974-VAULT模块化收纳系统';

/** 启动时：本地服务器记得上次的路径就直接连上；否则弹出连接窗口 */
export function useSourceInit() {
  useEffect(() => {
    serverSource().then(({ available, source }) => {
      useStore.setState({ pathSupported: available, source }); // 未连接时由开始面板引导，不再自动弹窗
    });
  }, []);
}

/** 顶栏里的模型状态按钮 */
export function SourceChip() {
  const source = useStore((s) => s.source);
  const [prog, setProg] = useState<{ active: number; current?: string }>({ active: 0 });
  useEffect(() => onLoadProgress(setProg), []);
  return (
    <button className={`pill ${source ? '' : 'pill-warn'}`} onClick={() => useStore.setState({ sourceDialog: true })}>
      {source ? (
        <>
          <span className="dot ok" /> {source.name} · {source.files.size}
          {prog.active > 0 && <span className="muted"> · 处理 {prog.current}…</span>}
        </>
      ) : (
        <>
          <span className="dot bad" /> 未连接模型文件夹
        </>
      )}
    </button>
  );
}

export function SourceDialog() {
  const open = useStore((s) => s.sourceDialog);
  const source = useStore((s) => s.source);
  const pathSupported = useStore((s) => s.pathSupported);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  if (!open) return null;
  const close = () => useStore.setState({ sourceDialog: false });
  const done = (s: ModelSource | null) => {
    if (!s) return setError('这个文件夹里没有找到 STL 文件');
    useStore.getState().setSource(s);
    useStore.getState().notify(`已连接「${s.name}」：${s.files.size} 个 STL`, 'info');
  };
  const run = async (fn: () => Promise<ModelSource | null>) => {
    setBusy(true);
    setError(null);
    try {
      done(await fn());
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={close}>
      <div
        className={`modal card ${over ? 'drop-over' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dt = e.dataTransfer;
          void run(() => fromDrop(dt));
        }}
      >
        <div className="fig">FIG. 00 · 模型文件</div>
        <h2>连接你下载好的 VAULT 模型</h2>
        <p className="muted">
          3D 预览和打包下载都直接读取你电脑上的 STL，<b>不会上传到任何服务器</b>。模型包需要先在{' '}
          <a href="https://www.ussadesign.com/products/vault" target="_blank" rel="noreferrer">USSA 官网</a> 购买下载。
        </p>

        {pathSupported && (
          <div className="step-block">
            <div className="step-title"><span className="step-num">1</span> 粘贴本地路径</div>
            <div className="path-row">
              <input
                className="path-input"
                placeholder={EXAMPLE}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && path && run(() => connectPath(path))}
                autoFocus
              />
              <button className="pill pill-dark" disabled={!path || busy} onClick={() => run(() => connectPath(path))}>连接</button>
            </div>
            <div className="muted small">在访达里选中文件夹，按 ⌥⌘C 复制路径后粘贴。外层或内层文件夹都可以。</div>
          </div>
        )}

        <div className="step-block">
          <div className="step-title"><span className="step-num">{pathSupported ? 2 : 1}</span> 或者选择 / 拖入文件夹</div>
          <div className="drop-zone" onClick={() => run(pickFolder)}>
            {busy ? '读取中…' : '把模型文件夹拖到这里，或点击选择'}
          </div>
        </div>

        {error && <div className="bad-text">{error}</div>}

        <div className="modal-foot">
          {source ? (
            <span className="muted small">
              当前：{source.root ?? source.name} · {source.files.size} / {catalogSize} 个文件
            </span>
          ) : (
            <span className="muted small">不连接也能先摆方案，3D 用简化方块显示。</span>
          )}
          <span className="spacer" />
          {source && (
            <button
              className="pill"
              onClick={async () => {
                await clearMeshCache();
                if (source.kind === 'path') await disconnectPath();
                useStore.setState({ source: null });
              }}
            >
              断开并清除缓存
            </button>
          )}
          <button className="pill" onClick={close}>{source ? '完成' : '稍后再说'}</button>
        </div>
      </div>
    </div>
  );
}
