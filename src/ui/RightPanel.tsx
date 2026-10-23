import { useState } from 'react';
import { colorOf } from '../core/bom';
import { dimsOf, specName, susInteriorName } from '../core/dims';
import { partsOf } from '../core/parts';
import { COLOR_SLOTS, type ColorSlot } from '../core/types';
import { colorById, PLA_BASIC } from '../data/colors';
import { useStore } from '../store';
import { ViewPanel } from './ViewPanel';

export function RightPanel() {
  const placements = useStore((s) => s.placements);
  const selectedId = useStore((s) => s.selectedId);
  const explodeId = useStore((s) => s.explodeId);
  const explodeT = useStore((s) => s.explodeT);
  const palette = useStore((s) => s.palette);
  const scope = useStore((s) => s.colorScope);
  const assemblyId = useStore((s) => s.assembly?.unitId ?? null);
  const { setExplode, setExplodeT, setColor, setColorScope, removeSelected, updateSpec, startAssembly, stopAssembly } = useStore.getState();
  const [openSlot, setOpenSlot] = useState<ColorSlot | null>('结构');

  const sel = placements.find((p) => p.id === selectedId);
  const unitScope = scope === 'unit' && !!sel;
  const slotColor = (slot: ColorSlot) => (unitScope ? colorOf(sel!, slot, palette) : palette[slot]);
  const usedSlots = sel ? new Set(partsOf(sel.spec).map((p) => p.slot)) : null;

  return (
    <aside className="right">
      <ViewPanel />
      <section>
        <div className="fig">FIG. 02 · 选中单元</div>
        {sel ? (
          <>
            <div className="sel-name">{specName(sel.spec)}</div>
            <div className="muted">
              {(() => {
                const { w, h, d } = dimsOf(sel.spec);
                return `${Math.round(w)} × ${Math.round(d)} × ${Math.round(h)} mm · ${partsOf(sel.spec).filter((p) => !p.tooling).length} 类零件`;
              })()}
            </div>
            {sel.spec.type === 'drawer' && (
              <>
              <label className="field">
                内部
                <select value={sel.spec.interior} onChange={(e) => updateSpec(sel.id, { ...sel.spec, interior: e.target.value as 'empty' } as typeof sel.spec)}>
                  <option value="empty">空抽屉</option>
                  <option value="baseplate">Gridfinity 底板</option>
                </select>
              </label>
              <label className="field">
                齿轮导轨（可选）
                <input type="checkbox" checked={sel.spec.gearedRails !== false} onChange={(e) => updateSpec(sel.id, { ...sel.spec, gearedRails: e.target.checked } as typeof sel.spec)} />
              </label>
              <p className="muted small">增强锁紧力；同一 2F / 4F 模组装多个盒体时需要安装。</p>
              </>
            )}
            {sel.spec.type === 'sustainer' && (sel.spec.width === 'L' || sel.spec.width === 'XL') && (
              <>
              <label className="field">
                内部
                <select value={sel.spec.interior} onChange={(e) => updateSpec(sel.id, { ...sel.spec, interior: e.target.value as 'flat' } as typeof sel.spec)}>
                  {(['flat', 'dividers', 'sealed'] as const).map((i) => (
                    <option key={i} value={i}>{susInteriorName(i)}</option>
                  ))}
                </select>
              </label>
              {sel.spec.interior !== 'flat' && (() => {
                const spec = sel.spec;
                const rows = spec.interior === 'sealed' && spec.width === 'L' ? spec.depth - 1 : spec.depth === 3 ? 3 : spec.depth - 1;
                return <>
                  <label className="field">
                    横向分隔排数
                    <select value={Math.min(spec.dividerCount ?? rows, rows)} onChange={(e) => updateSpec(sel.id, { ...spec, dividerCount: +e.target.value })}>
                      {Array.from({ length: rows + 1 }, (_, n) => <option key={n} value={n}>{n} 排</option>)}
                    </select>
                  </label>
                  {spec.interior === 'dividers' && <label className="field">
                    纵向分隔片
                    <select value={Math.min(spec.depthDividerCount ?? 2, 2)} onChange={(e) => updateSpec(sel.id, { ...spec, depthDividerCount: +e.target.value })}>
                      {[0, 1, 2].map((n) => <option key={n} value={n}>{n} 片</option>)}
                    </select>
                  </label>}
                  <p className="muted small">分隔片可按需减少，打印清单随选择更新。</p>
                </>;
              })()}
              </>
            )}
            {assemblyId === sel.id ? (
              <div className="explode-box">
                <p className="muted small">正在播放安装流程，3D 区下方可以逐步重播。</p>
                <button className="pill pill-dark wide" onClick={stopAssembly}>退出安装流程（Esc）</button>
              </div>
            ) : explodeId === sel.id ? (
              <div className="explode-box">
                <div className="row">
                  <span>爆炸程度</span>
                  <input type="range" min={0} max={1} step={0.01} value={explodeT} onChange={(e) => setExplodeT(+e.target.value)} />
                </div>
                <div className="btn-row">
                  <button className="pill pill-dark" onClick={() => setExplode(null)}>完成（Esc）</button>
                  <button className="pill" onClick={() => startAssembly(sel.id)}>安装流程 ▶</button>
                </div>
              </div>
            ) : (
              <div className="btn-row">
                <button className="pill pill-yellow" onClick={() => setExplode(sel.id)}>爆炸查看 ↗</button>
                <button className="pill pill-dark" onClick={() => startAssembly(sel.id)}>安装流程 ▶</button>
                <button className="pill pill-danger" onClick={removeSelected}>删除</button>
              </div>
            )}
          </>
        ) : (
          <p className="muted small">点选台面上的单元；双击直接爆炸查看。</p>
        )}
      </section>

      <section>
        <div className="h3-row">
          <div className="fig">FIG. 03 · 配色</div>
          <div className="seg small">
            <button className={!unitScope ? 'on' : ''} onClick={() => setColorScope('all')}>全部</button>
            <button className={unitScope ? 'on' : ''} disabled={!sel} onClick={() => setColorScope('unit')}>仅选中</button>
          </div>
        </div>
        <p className="muted small">拓竹 PLA Basic 色号（HEX 待对照官网）</p>
        {COLOR_SLOTS.map((slot) => {
          const c = colorById(slotColor(slot));
          const inactive = usedSlots && !usedSlots.has(slot);
          return (
            <div key={slot} className={`slot ${inactive ? 'inactive' : ''}`}>
              <button className="slot-head" onClick={() => setOpenSlot(openSlot === slot ? null : slot)}>
                <span className="swatch" style={{ background: c.hex }} />
                <span className="slot-name">{slot}</span>
                <span className="slot-code">{c.nameZh} {c.id}</span>
              </button>
              {openSlot === slot && (
                <div className="palette">
                  {PLA_BASIC.map((pc) => (
                    <button
                      key={pc.id}
                      className={`swatch-btn ${pc.id === c.id ? 'on' : ''}`}
                      style={{ background: pc.hex }}
                      title={`${pc.nameZh} ${pc.nameEn} ${pc.id}`}
                      onClick={() => setColor(slot, pc.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </aside>
  );
}
