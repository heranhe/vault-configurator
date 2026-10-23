import { useEffect, useMemo, useRef, useState } from 'react';
import { bomCsv, buildBom, type BomRow } from '../core/bom';
import { colorById } from '../data/colors';
import { packZip } from '../export/pack';
import { lookup } from '../models/source';
import { useStore } from '../store';
import { bomFocus } from './bom-focus';

const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);
/** 展示用短文件名：去掉「(Turn On Supports)」和扩展名 */
const shortName = (f: string) => f.replace(/\s*\(Turn On Supports\)/i, '').replace(/\s*\.stl$/i, '');

/** 五金件采购建议：按 10 颗一包向上取整，并多备 10% */
const buyQty = (name: string, n: number) => /螺栓|螺钉/.test(name) ? Math.ceil((n * 1.1) / 10) * 10 : n;

export function BomPanel() {
  const placements = useStore((s) => s.placements);
  const palette = useStore((s) => s.palette);
  const source = useStore((s) => s.source);
  const explodeId = useStore((s) => s.explodeId);
  const focusPart = useStore((s) => s.focusPart);
  const showHardwareLabels = useStore((s) => s.showHardwareLabels);
  const { notify } = useStore.getState();
  const [open, setOpen] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const groupStrip = useRef<HTMLDivElement>(null);

  const { rows, hardware } = useMemo(() => buildBom(placements, palette), [placements, palette]);
  const focused = useMemo(() => bomFocus(placements, rows, explodeId, focusPart), [placements, rows, explodeId, focusPart]);
  const focusedKeys = useMemo(() => new Set(focused?.rows.map((r) => r.key)), [focused]);

  useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);

  useEffect(() => {
    if (!open || !focused?.rows.length) return;
    const button = rowButtons.current.get(focused.rows[0].key);
    const list = button?.closest('ul');
    const group = button?.closest('.bom-group');
    const strip = groupStrip.current;
    if (!button || !list || !group || !strip) return;
    // 只滚动清单内的两层容器，避免带动整页、移动爆炸图。
    const itemRect = button.getBoundingClientRect(), listRect = list.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop += itemRect.top - listRect.top;
    else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
    const groupRect = group.getBoundingClientRect(), stripRect = strip.getBoundingClientRect();
    if (groupRect.left < stripRect.left) strip.scrollLeft += groupRect.left - stripRect.left;
    else if (groupRect.right > stripRect.right) strip.scrollLeft += groupRect.right - stripRect.right;
  }, [focused, open]);
  const groups = useMemo(() => {
    const m = new Map<string, BomRow[]>();
    for (const r of rows) m.set(r.colorId, [...(m.get(r.colorId) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);
  const totalParts = rows.reduce((n, r) => n + r.qty * r.piecesPerFile, 0);
  const totalSize = rows.reduce((n, r) => n + r.size, 0);
  const missingLocal = source ? rows.filter((r) => !lookup(source, r.path)).length : 0;
  const hw = Object.entries(hardware);

  const downloadCsv = () => {
    const blob = new Blob([bomCsv(rows, hardware)], { type: 'text/csv;charset=utf-8' });
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'VAULT_打印清单.csv' }).click();
  };

  const pack = async () => {
    if (!source) return useStore.setState({ sourceDialog: true });
    if (missingLocal) notify(`本地缺少 ${missingLocal} 个文件，打包时会跳过`, 'error');
    try {
      setProgress('准备中…');
      await packZip(rows, hardware, source, JSON.stringify({ placements, palette }, null, 2), (n, t) => setProgress(`打包中 ${n}/${t}`));
      notify('打包完成', 'info');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify(`打包失败：${(e as Error).message}`, 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <footer className={`bom card ${open ? 'open' : ''}`}>
      <div className="bom-bar">
        <button className="bom-title" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} 打印清单：</button>
        <span className="muted">
          {rows.length} 个文件 · {totalParts} 件 · {groups.length} 色 · 约 {fmtSize(totalSize)}
          {source && missingLocal > 0 && <span className="bad-text"> · 本地缺 {missingLocal} 个</span>}
        </span>
        {!open && hw.length > 0 && <span className="muted"> · 紧固件 {hw.map(([k, v]) => `${k.replace(' 螺栓', '')}×${v}`).join('，')}</span>}
        <span className="spacer" />
        <button className="pill" onClick={downloadCsv} disabled={!rows.length}>清单 CSV</button>
        <button className="pill pill-yellow" onClick={pack} disabled={!rows.length || !!progress}>{progress ?? '⬇ 打包下载'}</button>
      </div>
      {focused && <div className="bom-focus" role="status">
        <b>当前零件：{focused.name}</b>
        <span>{focused.rows.length ? focused.rows.map((r) => shortName(r.fileName)).join(' · ') : '外购五金（见采购清单）'}</span>
      </div>}
      {open && rows.length > 0 && (
        <div className="bom-body">
          <div className="bom-groups" ref={groupStrip}>
            {groups.length === 0 && <p className="muted empty">台面上还没有单元。从左侧拖一个进来。</p>}
            {groups.map(([colorId, list]) => {
              const c = colorById(colorId);
              return (
                <section key={colorId} className="bom-group">
                  <header>
                    <span className="swatch sm" style={{ background: c.hex }} />
                    <b>{c.nameZh}</b>
                    <span className="slot-code">{c.id}</span>
                    <span className="spacer" />
                    <span className="slot-code">{list.reduce((n, r) => n + r.qty * r.piecesPerFile, 0)} 件</span>
                  </header>
                  <ul>
                    {list.map((r) => {
                      const local = source ? !!lookup(source, r.path) : null;
                      const active = focusedKeys.has(r.key);
                      return (
                        <li key={r.key}>
                          <button
                            type="button"
                            ref={(el) => void (el ? rowButtons.current.set(r.key, el) : rowButtons.current.delete(r.key))}
                            className={`bom-part ${active ? 'on' : ''}`}
                            title={`点击在所属单元的爆炸图中高亮：${r.partName}\n${r.path}`}
                            aria-label={`查看 ${shortName(r.fileName)}：${r.partName}`}
                            aria-pressed={active}
                            disabled={r.tooling}
                            onClick={() => useStore.getState().focusBomPart(r.key)}
                          >
                            <span className="qty">×{r.qty}{r.uncertain && <sup title="数量待确认">*</sup>}</span>
                            <span className="bom-part-text">
                              <span className="fname">{shortName(r.fileName)}</span>
                              {active && <span className="bom-part-name">{focused?.name}</span>}
                            </span>
                            {r.piecesPerFile > 1 && <span className="tag" title="一份 STL 中的独立打印件数">{r.piecesPerFile} 件/份</span>}
                            {r.supports && <span className="tag warn" title="切片时必须开支撑">支撑</span>}
                            {r.tooling && <span className="tag" title="整套方案共用，装配后取下">工装</span>}
                            {local === false && <span className="tag bad">缺</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside className="bom-hw">
            <div className="bom-hw-heading">
              <h4>紧固件采购清单</h4>
              <label className="hardware-toggle" title="仅切换紧固件名称和引线，模型始终显示，采购数量不变">
                <input type="checkbox" role="switch" checked={showHardwareLabels} onChange={(e) => useStore.getState().setShowHardwareLabels(e.target.checked)} />
                <span>显示紧固件名称</span>
              </label>
            </div>
            {hw.length === 0 ? (
              <p className="muted small">暂无</p>
            ) : (
              <table>
                <thead>
                  <tr><th>型号</th><th className="r">用量</th><th className="r">建议买</th></tr>
                </thead>
                <tbody>
                  {hw.map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="r">{v}</td>
                      <td className="r"><b>{buyQty(k, v)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">螺栓 / 螺钉多备 10%，按 10 颗取整；其余五金按实际用量。</p>
          </aside>
        </div>
      )}
    </footer>
  );
}
