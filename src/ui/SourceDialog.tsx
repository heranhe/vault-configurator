import { t, tf } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { catalogSize, resolveFile } from '../core/catalog';
import { clearMeshCache, onLoadProgress } from '../models/loader';
import { connectPath, disconnectPath, fromDrop, importErrorMessage, isFileProtocol, pickFolder, type ImportProgress, type ModelSource, type OnImportProgress } from '../models/source';
import { sourceIndex } from '../models/source-index';
import { requiredPaths } from '../core/required';
import { useStore } from '../store';

const EXAMPLE = '~/Downloads/0974-VAULT模块化收纳系统';

/** 启动时恢复上次连接；不覆盖用户随后导入或断开的状态。 */
export function useSourceInit() {
  useEffect(() => {
    const controller = new AbortController();
    void useStore.getState().restoreSource(controller.signal);
    return () => controller.abort();
  }, []);
}

/** 顶栏里的模型状态按钮 */
export function SourceChip() {
  const source = useStore((s) => s.source);
  const [prog, setProg] = useState<{ active: number; current?: string }>({ active: 0 });
  useEffect(() => onLoadProgress(setProg), []);
  return (
    <button className={`pill ${source ? '' : 'pill-warn'}`} title={t(source ? `${source.name} · ${source.files.size} 个 STL` : undefined)} onClick={() => useStore.setState({ sourceDialog: true })}>
      {source ? (
        <>
          <span className="dot ok" /> {t(" 已连接本地模型文件")}{prog.active > 0 && <span className="muted"> {t(" · 处理 ")}{prog.current}…</span>}
        </>
      ) : (
        <>
          <span className="dot bad" /> {t(" 未连接打印文件夹")}{prog.active > 0 && <span className="muted"> {t(" · 加载预览 ")}{prog.current}…</span>}
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
  const running = useRef<AbortController | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [compatHint, setCompatHint] = useState(false); // 选择文件夹失败后，提示改用兼容方式

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => () => running.current?.abort(), []);

  if (!open) return null;
  const close = () => { if (!running.current) useStore.setState({ sourceDialog: false }); };
  const run = async (fn: (onProgress: OnImportProgress, signal: AbortSignal) => Promise<ModelSource | null>, selecting = false) => {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    // 在打开原生选择窗口前提交进度 UI，同时保留本次点击的用户激活权限。
    flushSync(() => {
      setBusy(true);
      setElapsed(0);
      setProgress({ phase: selecting ? 'selecting' : 'scanning', discovered: 0, completed: 0, failed: 0 });
      setError(null);
      setCompatHint(false);
    });
    try {
      const next = await fn((p) => {
        // 文件读取完成还不等于连接成功，提交模型来源后再显示完成状态。
        if (!controller.signal.aborted && p.phase !== 'done') setProgress(p);
      }, controller.signal);
      if (controller.signal.aborted) return;
      if (!next) throw new Error('这个文件夹里没有找到 STL 文件');
      const report = sourceIndex(next).report;
      const total = next.files.size + report.failed.length;
      // 顶栏、零件库和导入结果在同一次提交中切换，弹窗保留匹配报告。
      flushSync(() => {
        useStore.getState().setSource(next);
        setProgress({ phase: 'done', discovered: total, completed: total, total, failed: report.failed.length });
      });
      useStore.getState().notify(report.missing.length
        ? tf('已连接「{0}」：需要的 {1} 个模型识别了 {2} 个，缺少 {3} 个', [next.name, report.required, report.found, report.missing.length])
        : tf('已连接「{0}」：需要的 {1} 个模型文件齐全', [next.name, report.required]), report.missing.length ? 'error' : 'info');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(importErrorMessage(e as Error));
        setCompatHint(true);
      }
      setProgress(null);
    } finally {
      running.current = null;
      setBusy(false);
    }
  };
  const report = source ? sourceIndex(source).report : null;

  return (
    <div className="modal-mask" onClick={close}>
      <div
        className={`modal card ${over ? 'drop-over' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!running.current) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dt = e.dataTransfer;
          void run((onProgress, signal) => fromDrop(dt, onProgress, signal));
        }}
      >
        <div className="fig">{t("FIG. 00 · 模型文件")}</div>
        <h2>{t("导入下载好的 VAULT 模型文件夹")}</h2>
        <p className="muted">
          {t("未导入时显示 4 款基础单元，导入后显示全部规格。请选择下载并解压好的整个模型文件夹，完整 3D 预览和打印打包会读取其中的模型，")}<b>{t("不会上传你的文件")}</b>{t("。打印模型包需要先在")}{' '}
          <a href="https://www.ussadesign.com/products/vault" target="_blank" rel="noreferrer">{t("USSA 官网")}</a> {t(" 购买下载。")}</p>
        <p className="source-expect">{tf('完整模型包约 {0} 个 STL（不同批次略有差别），本工具用到其中 {1} 个。导入后会逐个核对，缺少的会列出来。', [catalogSize, requiredPaths().length])}</p>

        {pathSupported && (
          <div className="step-block">
            <div className="step-title"><span className="step-num">1</span> {t(" 粘贴本地路径")}</div>
            <div className="path-row">
              <input
                className="path-input"
                placeholder={t(EXAMPLE)}
                value={path}
                disabled={busy}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && path.trim() && run((onProgress, signal) => connectPath(path, onProgress, signal))}
                autoFocus
              />
              <button className="pill pill-dark" disabled={!path.trim() || busy} onClick={() => run((onProgress, signal) => connectPath(path, onProgress, signal))}>{t("连接")}</button>
            </div>
            <div className="muted small">{t("在访达里选中文件夹，按 ⌥⌘C 复制路径后粘贴。支持外层目录、模型根目录和子文件夹。")}</div>
          </div>
        )}

        <div className="step-block">
          <div className="step-title"><span className="step-num">{pathSupported ? 2 : 1}</span> {t(" 或者选择 / 拖入文件夹")}</div>
          <button type="button" className="drop-zone" disabled={busy} onClick={() => run(pickFolder, true)}>
            {t(busy ? progress?.phase === 'selecting' ? '等待选择文件夹…' : '正在读取，请稍候…' : '把整个模型文件夹拖到这里，或点击选择文件夹')}
          </button>
          <div className="muted small source-hint">{t("保留原有目录结构即可，会自动读取所有子文件夹，无需逐个选择模型文件。")}</div>
          {isFileProtocol() && <div className="muted small source-hint">{t("浏览器可能弹出「要上传 N 个文件吗？」，点「上传」即可：这只是让网页读取文件，文件不会离开你的电脑。")}</div>}
        </div>

        {progress && (
          <div className="source-progress" aria-live="polite" aria-busy={busy}>
            <div className="source-progress-label">
              <b>{t(progress.phase === 'selecting' ? '等待文件夹选择' : progress.phase === 'scanning' ? '扫描文件夹' : progress.phase === 'done' ? '读取完成' : '读取文件信息')}</b>
              <span>{t(progress.phase === 'selecting' ? '尚未开始读取' : progress.phase === 'scanning' ? `已发现 ${progress.discovered} 个 STL` : `${progress.completed} / ${progress.total} 个文件`)}</span>
            </div>
            <progress aria-label={t("模型文件读取进度")} max={progress.total || 1} value={progress.phase === 'scanning' || progress.phase === 'selecting' ? undefined : progress.total ? progress.completed : 0} />
            {progress.message && <div className="muted small">{t(progress.message)}</div>}
            {progress.current && <div className="source-current muted small" title={progress.current}>{progress.current}</div>}
            {busy && <div className="muted small source-hint">{t("已等待 ")}{elapsed} {t(" 秒")}</div>}
            {busy && progress.phase === 'selecting' && elapsed >= 10 && (
              <div className="muted small source-hint">{t("如果没有出现选择窗口，或选完后一直没有响应，请取消并改用上方本地路径或直接拖入文件夹。")}</div>
            )}
            {progress.failed > 0 && <div className="bad-text small">{progress.failed} {t(" 个文件读取失败")}</div>}
          </div>
        )}

        {error && <div className="bad-text">{t(error)}</div>}
        {error && compatHint && (
          <button type="button" className="pill pill-yellow compat-retry" disabled={busy} onClick={() => run((onProgress, signal) => pickFolder(onProgress, signal, { compat: true }), true)}>
            {t("改用兼容方式选择文件夹")}
          </button>
        )}

        {report && (
          <div className={`source-summary ${report.missing.length ? 'warn' : 'ok'}`} role="status">
            <b>{tf('需要 {0} 个模型文件 · 已识别 {1} 个', [report.required, report.found])}{report.missing.length ? '' : ' ✓'}</b>
            {report.missing.length > 0 ? (
              <>
                <div>{tf('缺少 {0} 个文件。可以继续使用：缺少的零件显示为灰色方块，打包下载时会跳过。', [report.missing.length])}</div>
                <details open={report.missing.length <= 10}>
                  <summary>{tf('缺少的文件（{0}）', [report.missing.length])}</summary>
                  <ul className="source-issues">
                    {report.missing.map((p) => <li key={p}>{resolveFile(p)?.p ?? p}</li>)}
                  </ul>
                </details>
              </>
            ) : <div>{t('文件齐全，所有规格和打印导出都可以使用。')}</div>}
            {report.duplicates.length > 0 && <div className="muted">{tf('另有 {0} 个重复副本，已自动使用与官方文件一致的那份。', [report.duplicates.length])}</div>}
            {report.renamed.length > 0 && (
              <details className="source-renamed">
                <summary>{tf('{0} 个文件名与本工具对照的版本不同，已按相近名称匹配', [report.renamed.length])}</summary>
                <div className="muted">{t('你的模型包可能是另一批次（例如 Runner Slide / Runner Slides）。3D 显示和打包可以正常使用；如果新版文件里的零件数量有变化，打印份数请以说明书为准。')}</div>
                <ul className="source-issues">{report.renamed.map((p) => <li key={p}>{p}</li>)}</ul>
              </details>
            )}
          </div>
        )}
        {report && (
          <div className="source-report small">
            {t("已读取 ")}{source!.files.size} {t(" 个 STL · 已匹配 ")}{report.matched} / {catalogSize} {t(" 个模型")}{(report.unmatched.length > 0 || report.ambiguous.length > 0 || report.failed.length > 0 || report.duplicates.length > 0) && (
              <details>
                <summary>{t("未匹配 ")}{report.unmatched.length} {t(" · 同名待确认 ")}{report.ambiguous.length} {t(" · 读取失败 ")}{report.failed.length}</summary>
                <p className="muted">{t("同名文件需保留可区分的上级目录；同一模型有多份副本时，请选择其中一份所在的文件夹。")}</p>
                <ul className="source-issues">
                  {report.ambiguous.map((p, i) => <li key={`a${i}`}>{t("同名待确认：")}{p}</li>)}
                  {report.duplicates.map((p, i) => <li key={`d${i}`}>{t("重复副本（未使用）：")}{p}</li>)}
                  {report.unmatched.map((p, i) => <li key={`u${i}`}>{t("未匹配：")}{p}</li>)}
                  {report.failed.map((p, i) => <li key={`f${i}`}>{t("读取失败：")}{p}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="modal-foot">
          {source ? (
            <span className="muted small">
              {t("当前：")}{source.root ?? source.name}
            </span>
          ) : (
            <span className="muted small">{t("未导入时只显示 4 款基础单元，导入后显示全部规格。")}</span>
          )}
          <span className="spacer" />
          {busy && <button className="pill" onClick={() => running.current?.abort()}>{t("取消读取")}</button>}
          {source && (
            <button
              className="pill"
              disabled={busy}
              onClick={async () => {
                await clearMeshCache();
                if (source.kind === 'path') await disconnectPath();
                useStore.getState().setSource(null);
                setProgress(null);
              }}
            >
              {t("断开并清除缓存")}</button>
          )}
          <button className="pill" disabled={busy} onClick={close}>{t(source ? '完成' : '稍后再说')}</button>
        </div>
      </div>
    </div>
  );
}
