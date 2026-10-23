import { useMemo, useState } from 'react';
import { bomCsv, buildBom, type BomRow } from '../core/bom';
import { colorById } from '../data/colors';
import { packZip } from '../export/pack';
import { lookup } from '../models/source';
import { useStore } from '../store';

const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);
/** 展示用短文件名：去掉「(Turn On Supports)」和扩展名 */
const shortName = (f: string) => f.replace(/\s*\(Turn On Supports\)/i, '').replace(/\s*\.stl$/i, '');

/** 五金件采购建议：按 10 颗一包向上取整，并多备 10% */
const buyQty = (n: number) => Math.ceil((n * 1.1) / 10) * 10;

export function BomPanel() {
  const placements = useStore((s) => s.placements);
  const palette = useStore((s) => s.palette);
  const source = useStore((s) => s.source);
  const { notify } = useStore.getState();
  const [open, setOpen] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);

  const { rows, hardware } = useMemo(() => buildBom(placements, palette), [placements, palette]);
  const groups = useMemo(() => {
    const m = new Map<string, BomRow[]>();
    for (const r of rows) m.set(r.colorId, [...(m.get(r.colorId) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);
  const totalParts = rows.reduce((n, r) => n + r.qty, 0);
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
      {open && (
        <div className="bom-body">
          <div className="bom-groups">
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
                    <span className="slot-code">{list.reduce((n, r) => n + r.qty, 0)} 件</span>
                  </header>
                  <ul>
                    {list.map((r) => {
                      const local = source ? !!lookup(source, r.path) : null;
                      return (
                        <li key={r.key} title={`${r.path}\n${r.partName}`}>
                          <span className="qty">×{r.qty}{r.uncertain && <sup title="数量待确认">*</sup>}</span>
                          <span className="fname">{shortName(r.fileName)}</span>
                          {r.supports && <span className="tag warn" title="切片时必须开支撑">支撑</span>}
                          {local === false && <span className="tag bad">缺</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside className="bom-hw">
            <h4>紧固件采购清单</h4>
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
                      <td className="r"><b>{buyQty(v)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small">建议买 = 用量 ×1.1，按 10 颗取整</p>
          </aside>
        </div>
      )}
    </footer>
  );
}
