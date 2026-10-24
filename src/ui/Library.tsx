import { t } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { DEPTHS, dimsOf, heightsFor, ROOF_TYPES, specName, WIDTHS } from '../core/dims';
import { dropOnUnit, unitsOn } from '../core/rules';
import type { Depth, UnitSpec, Width } from '../core/types';
import { DEMO_SPECS } from '../models/demo';
import { useStore } from '../store';
import { MOBILE_QUERY, useMobile } from './MobileTabs';
import { StackingGuide } from './StackingGuide';

type Tab = 'drawer' | 'sustainer' | 'roof' | 'base';
const TABS: [Tab, string][] = [['drawer', '抽屉'], ['sustainer', '收纳箱'], ['roof', '顶盖'], ['base', '底座']];

function specsFor(tab: Tab, widths: Width[], depth: Depth): UnitSpec[] {
  const out: UnitSpec[] = [];
  for (const width of widths) {
    if (tab === 'roof') {
      for (const roof of ROOF_TYPES) if (roof !== 'heavyweight' || width === 'L' || width === 'XL') out.push({ type: 'roof', width, depth, roof });
    } else if (tab === 'base') {
      for (const mode of ['wheels', 'feet'] as const) out.push({ type: 'base', width, depth, mode });
    } else {
      for (const height of heightsFor(width))
        out.push(tab === 'drawer' ? { type: 'drawer', width, depth, height, interior: 'empty' } : { type: 'sustainer', width, depth, height, interior: 'flat' });
    }
  }
  return out;
}

/** 预渲染缩略图的文件名：与深度无关，统一用 5 格深的模型渲染 */
export function thumbKey(spec: UnitSpec) {
  if (spec.type === 'roof') return `roof-${spec.width}-${spec.roof}`;
  if (spec.type === 'base') return `base-${spec.width}-${spec.mode}`;
  return `${spec.type}-${spec.width}-${spec.height}F`;
}

/** 缩略图：优先用随网站发布的预渲染图，没有时退回按比例画的正视简图 */
function Thumb({ spec }: { spec: UnitSpec }) {
  const [failed, setFailed] = useState(false);
  if (!failed) return <img className="thumb" src={`${import.meta.env.BASE_URL}thumbs/${thumbKey(spec)}.webp`} alt="" draggable={false} onError={() => setFailed(true)} />;
  return <ThumbSvg spec={spec} />;
}

function ThumbSvg({ spec }: { spec: UnitSpec }) {
  const { w, h } = dimsOf(spec);
  const scale = Math.min(84 / 418.7, 52 / 201);
  const W = Math.max(w * scale, 14), H = Math.max(h * scale, 4);
  const x = (92 - W) / 2, y = 56 - H;
  return (
    <svg viewBox="0 0 92 60" className="thumb">
      <rect x={x} y={y} width={W} height={H} rx={2} className="thumb-shell" />
      {spec.type !== 'roof' && <rect x={x + 3} y={y + 3} width={W - 6} height={H - 6} rx={1.5} className="thumb-face" />}
      {spec.type === 'drawer' && <circle cx={46} cy={y + H / 2} r={Math.min(4, H / 4)} className="thumb-key" />}
      {spec.type === 'sustainer' && <rect x={44} y={y + 4} width={4} height={Math.min(6, H / 3)} className="thumb-key" />}
    </svg>
  );
}

export function Library() {
  const source = useStore((s) => s.source);
  const mobile = useMobile();
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('drawer');
  const [widths, setWidths] = useState<Width[]>(['S', 'M']);
  const [depth, setDepth] = useState<Depth>(5);
  const startDrag = useStore((s) => s.startDrag);
  const clickAdd = useStore((s) => s.clickAdd);
  const placements = useStore((s) => s.placements);
  const selectedId = useStore((s) => s.selectedId);
  const specs = useMemo(() => source ? specsFor(tab, widths, depth) : DEMO_SPECS, [source, tab, widths, depth]);

  // 选中单元后，零件库自动切到它的深度并包含它的宽度：同一座塔深度必须一致，少点几下
  useEffect(() => {
    const sel = placements.find((p) => p.id === selectedId);
    if (!sel) return;
    setDepth(sel.spec.depth);
    setWidths((ws) => (ws.includes(sel.spec.width) ? ws : WIDTHS.filter((x) => ws.includes(x) || x === sel.spec.width)));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 选中单元后，标出能直接叠在它上面的规格
  const selected = placements.find((p) => p.id === selectedId);
  const stackable = (spec: UnitSpec) => {
    if (!selected) return null;
    let top = selected;
    for (let up = unitsOn(top, placements)[0]; up; up = unitsOn(top, placements)[0]) top = up;
    return dropOnUnit(spec, top, top.pos[0] + dimsOf(top.spec).w / 2, placements).ok;
  };

  const onCardDown = (e: React.PointerEvent, spec: UnitSpec) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    // 触屏时卡片列表要能滑动：桌面版列表竖向滚、手机版横向滚，只有朝另一个方向拖才拿起单元
    const touch = e.pointerType !== 'mouse';
    const listAxisX = matchMedia(MOBILE_QUERY).matches;
    let started = false;
    const move = (ev: PointerEvent) => {
      const dx = Math.abs(ev.clientX - sx), dy = Math.abs(ev.clientY - sy);
      if (started || Math.hypot(dx, dy) <= (touch ? 8 : 5)) return;
      if (touch && (listAxisX ? dx > dy : dy > dx)) return; // 交给浏览器滚动，随后会收到 pointercancel
      started = true;
      startDrag({ spec, groupIds: [] });
    };
    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', done);
    };
    const up = () => {
      done();
      if (!started) clickAdd(spec);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', done);
  };

  const toggleWidth = (w: Width) => setWidths((ws) => (ws.includes(w) ? (ws.length > 1 ? ws.filter((x) => x !== w) : ws) : WIDTHS.filter((x) => ws.includes(x) || x === w)));

  return (
    <aside className="library">
      <div className="fig">{t("FIG. 01 · 零件库")}</div>
      <div className="library-heading">
        <h2>{t("选一个单元")}</h2>
        <button type="button" className="pill library-guide" aria-haspopup="dialog" onClick={() => setGuideOpen(true)}>{t("组合方式")}</button>
      </div>
      {guideOpen && <StackingGuide onClose={() => setGuideOpen(false)} />}
      {source && <>
      <div className="seg">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(label)}</button>
        ))}
      </div>
      <div className="filters">
        <div className="filter-row">
          <span>{t("宽")}</span>
          {WIDTHS.map((w) => (
            <button key={w} className={`chip ${widths.includes(w) ? 'on' : ''}`} onClick={() => toggleWidth(w)}>{w}</button>
          ))}
        </div>
        <div className="filter-row">
          <span>{t("深")}</span>
          {DEPTHS.map((d) => (
            <button key={d} className={`chip ${depth === d ? 'on' : ''}`} onClick={() => setDepth(d)}>{d}</button>
          ))}
        </div>
      </div>
      </>}
      <p className="lib-tip">{t(source ? (mobile ? '点卡片添加，连续点一层层往上叠；按住往上拖可放到指定位置。' : '拖到台面上；或连续点击，一层层往上叠。') : '可直接使用这 4 款。导入模型文件夹后显示全部规格。')}</p>
      <div className="cards">
        {specs.map((spec) => {
          const { w, h, d } = dimsOf(spec);
          const st = stackable(spec);
          return (
            <div
              key={specName(spec)}
              className="lib-card"
              onPointerDown={(e) => onCardDown(e, spec)}
              title={t("拖进 3D 场景，或单击自动放置")}
            >
              {st && <span className="badge">{t("可叠放")}</span>}
              <Thumb spec={spec} />
              <div className="card-name">{t(specName(spec))}</div>
              <div className="card-dims">{Math.round(w)}×{Math.round(d)}×{Math.round(h)}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
