// 爆炸 / 安装流程的零件标注：标签排在单元左右两列，引线折一下指到零件上；点标签高亮对应零件
import { useEffect, useMemo, useRef } from 'react';
import { assemblyOf } from '../core/assembly';
import { partsOf } from '../core/parts';
import { screenAnchors } from '../scene/callouts';
import { useStore } from '../store';

const GAP = 30; // 同一列相邻标签的最小间距（px）
const REACH = 90; // 标签列离零件最外侧锚点的水平距离（px）

export function Callouts() {
  const explodeId = useStore((s) => s.explodeId);
  const spec = useStore((s) => s.placements.find((p) => p.id === s.explodeId)?.spec);
  const step = useStore((s) => (s.assembly && s.assembly.unitId === s.explodeId ? s.assembly.step : -1));
  const focus = useStore((s) => s.focusPart);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const lines = useRef(new Map<string, SVGPolylineElement>());
  const dots = useRef(new Map<string, SVGCircleElement>());

  // 安装流程只标这一步动到的零件；爆炸查看标全部
  const items = useMemo(() => {
    if (!explodeId || !spec) return [];
    const parts = partsOf(spec);
    if (step < 0) return parts.map((p) => ({ key: `${explodeId}/${p.id}`, id: p.id, name: p.name }));
    const s = assemblyOf(spec)[step];
    const ids = new Set([...Object.keys(s?.place ?? {}), ...(s?.focus ?? [])]);
    return parts.filter((p) => ids.has(p.id)).map((p) => ({ key: `${explodeId}/${p.id}`, id: p.id, name: p.name }));
  }, [explodeId, spec, step]);

  useEffect(() => {
    if (!items.length) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const st = useStore.getState();
      // 爆炸刚开始展开时零件还挤在一起，先不出标签
      const shown = st.assembly ? true : st.explodeT > 0.25;
      const free = document.querySelector('.stage-overlay')?.getBoundingClientRect();
      const pts = items
        .map((it) => ({ it, a: screenAnchors.get(it.key) }))
        .filter((p): p is { it: (typeof items)[number]; a: { x: number; y: number; visible: boolean } } => !!p.a && p.a.visible && shown);
      const hide = new Set(items.map((i) => i.key));
      if (pts.length && free) {
        const cx = pts.reduce((s, p) => s + p.a.x, 0) / pts.length;
        const minX = Math.min(...pts.map((p) => p.a.x)), maxX = Math.max(...pts.map((p) => p.a.x));
        const top = free.top + 56, bottom = free.bottom - 70;
        for (const side of [-1, 1] as const) {
          const col = pts.filter((p) => (side < 0 ? p.a.x < cx : p.a.x >= cx)).sort((a, b) => a.a.y - b.a.y);
          // 先往下推开重叠，再从底往上收回超出可视区的部分
          const ys = col.map((p) => Math.min(bottom, Math.max(top, p.a.y)));
          for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + GAP);
          for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i], i === ys.length - 1 ? bottom : ys[i + 1] - GAP);
          col.forEach((p, i) => {
            const el = labels.current.get(p.it.key);
            const line = lines.current.get(p.it.key);
            const dot = dots.current.get(p.it.key);
            if (!el || !line || !dot) return;
            hide.delete(p.it.key);
            const wEl = el.offsetWidth;
            const y = ys[i];
            // 标签贴着自己那一侧的引线端点，不超出面板之间的空白区
            let edge = side < 0 ? minX - REACH : maxX + REACH;
            // 安装流程时右上角竖排着上一步 / 下一步，右列再让出按钮宽度
            const right = free.right - 12 - (st.assembly ? 124 : 0);
            edge = side < 0 ? Math.max(free.left + 12 + wEl, edge) : Math.min(right - wEl, edge);
            el.style.display = '';
            el.style.transform = `translate(${side < 0 ? edge - wEl : edge}px, ${y - el.offsetHeight / 2}px)`;
            // 引线：从标签先朝零件方向水平走一小段，再斜着指到锚点
            line.setAttribute('points', `${edge},${y} ${edge - side * 18},${y} ${p.a.x},${p.a.y}`);
            line.style.display = '';
            dot.setAttribute('cx', String(p.a.x));
            dot.setAttribute('cy', String(p.a.y));
            dot.style.display = '';
          });
        }
      }
      for (const key of hide) {
        const el = labels.current.get(key);
        if (el) el.style.display = 'none';
        const line = lines.current.get(key);
        if (line) line.style.display = 'none';
        const dot = dots.current.get(key);
        if (dot) dot.style.display = 'none';
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [items]);

  if (!items.length) return null;
  return (
    <div className="callouts">
      <svg className="callout-lines">
        {items.map((it) => (
          <g key={it.key} className={focus === it.id ? 'on' : ''}>
            <polyline ref={(el) => void (el ? lines.current.set(it.key, el) : lines.current.delete(it.key))} style={{ display: 'none' }} />
            <circle r={3.2} ref={(el) => void (el ? dots.current.set(it.key, el) : dots.current.delete(it.key))} style={{ display: 'none' }} />
          </g>
        ))}
      </svg>
      {items.map((it) => (
        <button
          key={it.key}
          className={`part-label ${focus === it.id ? 'on' : ''}`}
          style={{ display: 'none' }}
          ref={(el) => void (el ? labels.current.set(it.key, el) : labels.current.delete(it.key))}
          onClick={() => useStore.getState().setFocusPart(focus === it.id ? null : it.id)}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
}
