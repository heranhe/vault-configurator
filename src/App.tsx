import { useEffect, useMemo } from 'react';
import { buildBom } from './core/bom';
import { dimsOf } from './core/dims';
import { boxOf } from './core/rules';
import { Scene } from './scene/Scene';
import { useStore } from './store';
import { BomPanel } from './ui/BomPanel';
import { Library } from './ui/Library';
import { RightPanel } from './ui/RightPanel';
import { SourceChip, SourceDialog, useSourceInit } from './ui/SourceDialog';
import { StartPanel, useStartPanelInit } from './ui/StartPanel';

function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useStore.setState({ toast: null }), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return toast ? <div className={`toast ${toast.kind}`}>{toast.text}</div> : null;
}

/** 场景底部的读数条（参考 visual-learning 的 chips） */
function Readouts() {
  const placements = useStore((s) => s.placements);
  const palette = useStore((s) => s.palette);
  const { rows, hardware } = useMemo(() => buildBom(placements, palette), [placements, palette]);
  const size = useMemo(() => {
    if (!placements.length) return '—';
    const bs = placements.map(boxOf);
    const w = Math.max(...bs.map((b) => b.x + b.w)) - Math.min(...bs.map((b) => b.x));
    const d = Math.max(...bs.map((b) => b.z + b.d)) - Math.min(...bs.map((b) => b.z));
    const h = Math.max(...placements.map((p) => p.pos[1] + dimsOf(p.spec).h)); // 含顶层的嵌套凸台
    return `${Math.round(w)}×${Math.round(d)}×${Math.round(h)} mm`;
  }, [placements]);
  const bolts = Object.values(hardware).reduce((a, b) => a + b, 0);
  const chips: [string, string][] = [
    ['外形', size],
    ['单元', String(placements.length)],
    ['打印件', String(rows.reduce((n, r) => n + r.qty, 0))],
    ['颜色', String(new Set(rows.map((r) => r.colorId)).size)],
    ['螺栓', String(bolts)],
  ];
  return (
    <div className="chips">
      {chips.map(([k, v]) => (
        <span key={k} className="chip-read"><span className="k">{k}</span> {v}</span>
      ))}
    </div>
  );
}

function StageCaption() {
  const placements = useStore((s) => s.placements);
  const explodeId = useStore((s) => s.explodeId);
  const drag = useStore((s) => s.drag);
  let text = '从左侧把单元拖到台面上，或连续点击卡片一层层往上叠。';
  if (placements.length) text = '拖动单元可以移动整列；靠近顶面会吸附，放不下的地方会变红并说明原因。双击单元查看爆炸图。';
  if (drag) text = '松手放下 · 绿色 = 可以放 · 红色 = 放不下 · Esc 取消';
  if (explodeId) text = '爆炸查看：只展开这一个单元。拖右侧滑块控制展开程度，Esc 退出。';
  return <div className="stage-caption">{text}</div>;
}

export function App() {
  useSourceInit();
  useStartPanelInit();
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const xray = useStore((s) => s.xray);
  const placements = useStore((s) => s.placements.length);
  const { undo, redo, setXray, fitView, clearAll } = useStore.getState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!st.explodeId) st.removeSelected();
      } else if (e.key === 'Escape' && !st.drag) {
        if (st.sourceDialog) useStore.setState({ sourceDialog: false });
        else if (st.startOpen) useStore.setState({ startOpen: false });
        else if (st.explodeId) st.setExplode(null);
        else st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      {/* 3D 场景铺满整个窗口，所有面板半透明浮在场景上 */}
      <div className="canvas-layer">
        <Scene />
      </div>

      <header className="topbar">
        <div className="brand">VAULT 配置器</div>
        <div className="top-mid">
          <button className="pill pill-dark" onClick={() => useStore.setState({ startOpen: true })}>＋ 新建 / 示例</button>
          <button className="pill" onClick={undo} disabled={!past} title="撤销 Ctrl+Z">↶ 撤销</button>
          <button className="pill" onClick={redo} disabled={!future} title="重做 Ctrl+Shift+Z">↷</button>
          <button className={`pill ${xray ? 'pill-dark' : ''}`} onClick={() => setXray(!xray)}>X 光</button>
          <button className="pill" onClick={() => { useStore.setState({ viewAngle: null }); fitView(); }}>重置视角</button>
          <button className="pill" disabled={!placements} onClick={() => confirm('清空台面？可撤销') && clearAll()}>清空</button>
        </div>
        <div className="top-right">
          <SourceChip />
          <a className="pill pill-yellow" href="https://www.ussadesign.com/products/vault" target="_blank" rel="noreferrer">购买模型 ↗</a>
        </div>
      </header>

      <main className="frame">
        <Library />
        <section className="stage-overlay">
          <StageCaption />
          {!placements && (
            <div className="empty-hint">
              <div className="big">空白台面</div>
              <div>从左侧拖一个单元进来</div>
              <button className="pill pill-yellow" onClick={() => useStore.setState({ startOpen: true })}>看看示例方案</button>
            </div>
          )}
          <Readouts />
        </section>
        <RightPanel />
      </main>

      <BomPanel />
      <StartPanel />
      <SourceDialog />
      <Toast />
    </div>
  );
}
