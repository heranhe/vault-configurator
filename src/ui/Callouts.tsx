import { t } from '../i18n';
// 爆炸 / 安装流程的零件标注：标签排在单元左右两列，引线折一下指到零件上；点标签高亮对应零件
import { useEffect, useMemo, useRef, useState } from 'react';
import { assemblyOf } from '../core/assembly';
import { partsOf } from '../core/parts';
import { instanceFocused, partInstances, labeledParts } from '../scene/part-instances';
import { screenAnchors } from '../scene/callouts';
import { calloutPage, calloutPageSize } from '../scene/callout-layout';
import { useStore } from '../store';
import { MOBILE_QUERY, useMobile } from './MobileTabs';
import { useMobileLabels } from './MobileModeBar';

const GAP = 30; // 同一列相邻标签的最小间距（px）
const REACH = 90; // 标签列离零件最外侧锚点的水平距离（px）

export function Callouts() {
  const explodeId = useStore((s) => s.explodeId);
  const spec = useStore((s) => s.placements.find((p) => p.id === s.explodeId)?.spec);
  const step = useStore((s) => (s.assembly && s.assembly.unitId === s.explodeId ? s.assembly.step : -1));
  const focus = useStore((s) => s.focusPart);
  const showHardwareLabels = useStore((s) => s.showHardwareLabels);
  // 手机端爆炸图的标注默认关闭（两列标签会盖住窄屏上的模型），由底部控制条的「标注」打开；安装流程每步只标几个零件，照常显示
  const mobile = useMobile();
  const mobileLabels = useMobileLabels((s) => s.on);
  const hidden = mobile && step < 0 && !mobileLabels;
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const lines = useRef(new Map<string, SVGPolylineElement>());
  const dots = useRef(new Map<string, SVGCircleElement>());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [pagerPosition, setPagerPosition] = useState({ left: 0, top: 0 });

  // 安装流程只标这一步动到的零件；爆炸查看标全部
  const items = useMemo(() => {
    if (!explodeId || !spec) return [];
    const parts = labeledParts(partsOf(spec), showHardwareLabels);
    const instances = parts.flatMap(partInstances);
    if (step < 0) return instances.map((p) => ({ ...p, key: `${explodeId}/${p.id}` }));
    const s = assemblyOf(spec)[step];
    const ids = new Set([...Object.keys(s?.place ?? {}), ...(s?.focus ?? [])]);
    return instances.filter((p) => ids.has(p.parentId)).map((p) => ({ ...p, key: `${explodeId}/${p.id}` }));
  }, [explodeId, spec, step, showHardwareLabels]);

  const paged = useMemo(() => calloutPage(items, page, pageSize), [items, page, pageSize]);
  const visibleItems = paged.items;
  useEffect(() => { setPage(0); }, [explodeId, spec, step, showHardwareLabels]);
  useEffect(() => {
    const index = items.findIndex((it) => instanceFocused(focus, it));
    if (index >= 0) setPage(Math.floor(index / pageSize));
  }, [focus, items, pageSize]);
  useEffect(() => {
    const stage = document.querySelector('.stage-overlay');
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      setPageSize(calloutPageSize(rect.height));
      setPagerPosition({ left: rect.left + rect.width / 2, top: rect.top + 48 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [explodeId]);

  useEffect(() => {
    if (!items.length) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const st = useStore.getState();
      // 爆炸刚开始展开时零件还挤在一起，先不出标签
      const shown = st.assembly ? true : st.explodeT > 0.25;
      const free = document.querySelector('.stage-overlay')?.getBoundingClientRect();
      const pts = visibleItems
        .map((it) => ({ it, a: screenAnchors.get(it.key) }))
        .filter((p): p is { it: (typeof items)[number]; a: { x: number; y: number; visible: boolean } } => !!p.a && p.a.visible && shown);
      const hide = new Set(visibleItems.map((i) => i.key));
      if (pts.length && free) {
        const minX = Math.min(...pts.map((p) => p.a.x)), maxX = Math.max(...pts.map((p) => p.a.x));
        const top = free.top + (paged.pages > 1 ? 94 : 56), bottom = free.bottom - 70;
        const ordered = [...pts].sort((a, b) => a.a.x - b.a.x);
        const middle = Math.ceil(ordered.length / 2);
        for (const side of [-1, 1] as const) {
          const col = (side < 0 ? ordered.slice(0, middle) : ordered.slice(middle)).sort((a, b) => a.a.y - b.a.y);
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
            const right = free.right - 12 - (st.assembly && !matchMedia(MOBILE_QUERY).matches ? 124 : 0);
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
  }, [visibleItems, paged.pages]);

  if (!items.length || hidden) return null;
  return (
    <div className="callouts">
      {paged.pages > 1 && <div className="callout-pager" style={{ position: 'fixed', ...pagerPosition, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
        <button className="pill" disabled={paged.current === 0} onClick={() => setPage(paged.current - 1)}>{t("← 上一页")}</button>
        <span className="chip-read" aria-live="polite">{t("标注 ")}{paged.current + 1}/{paged.pages} {t(" · 共 ")}{items.length} {t(" 件")}</span>
        <button className="pill" disabled={paged.current === paged.pages - 1} onClick={() => setPage(paged.current + 1)}>{t("下一页 →")}</button>
      </div>}
      <svg className="callout-lines">
        {visibleItems.map((it) => (
          <g key={it.key} className={instanceFocused(focus, it) ? 'on' : ''}>
            <polyline ref={(el) => void (el ? lines.current.set(it.key, el) : lines.current.delete(it.key))} style={{ display: 'none' }} />
            <circle r={3.2} ref={(el) => void (el ? dots.current.set(it.key, el) : dots.current.delete(it.key))} style={{ display: 'none' }} />
          </g>
        ))}
      </svg>
      {visibleItems.map((it) => (
        <button
          key={it.key}
          className={`part-label ${instanceFocused(focus, it) ? 'on' : ''}`}
          aria-pressed={instanceFocused(focus, it)}
          style={{ display: 'none' }}
          ref={(el) => void (el ? labels.current.set(it.key, el) : labels.current.delete(it.key))}
          onClick={() => useStore.getState().setFocusPart(focus === it.id ? null : it.id)}
        >
          {t(it.name)}
        </button>
      ))}
    </div>
  );
}
