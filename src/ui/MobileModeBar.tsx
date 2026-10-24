import { t, tf } from '../i18n';
// 手机端爆炸查看 / 安装流程的底部控制条：替换底部标签栏，收起面板，把屏幕留给 3D 区。
// 桌面端仍用右侧面板 + 3D 区下方的 AssemblyBar，这里的样式只在手机布局里显示。
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { assemblyOf } from '../core/assembly';
import { specName } from '../core/dims';
import { partsOf } from '../core/parts';
import { instanceFocused, partInstances, labeledParts } from '../scene/part-instances';
import { useStore } from '../store';

/** 手机端爆炸图的零件标注默认关闭（窄屏上两列标签会盖住模型），点「标注」再打开 */
export const useMobileLabels = create<{ on: boolean; set: (on: boolean) => void }>((set) => ({ on: false, set: (on) => set({ on }) }));

/** 当前高亮零件的名称：标注关闭时，点零件后在控制条里显示它是什么 */
function useFocusName() {
  const spec = useStore((s) => s.placements.find((p) => p.id === s.explodeId)?.spec);
  const focus = useStore((s) => s.focusPart);
  const showHardware = useStore((s) => s.showHardwareLabels);
  return useMemo(() => {
    if (!spec || !focus) return null;
    const hit = labeledParts(partsOf(spec), showHardware).flatMap(partInstances).find((it) => instanceFocused(focus, it));
    return hit ? t(hit.name) : null;
  }, [spec, focus, showHardware]);
}

function ExplodeControls() {
  const explodeId = useStore((s) => s.explodeId)!;
  const explodeT = useStore((s) => s.explodeT);
  const labels = useMobileLabels((s) => s.on);
  const focusName = useFocusName();
  const { setExplodeT, setExplode, startAssembly, setFocusPart } = useStore.getState();
  return (
    <>
      <div className="mm-row">
        <span className="mm-k">{t('展开')}</span>
        <input type="range" min={0} max={1} step={0.01} value={explodeT} aria-label={t('爆炸程度')} onChange={(e) => setExplodeT(+e.target.value)} />
      </div>
      {focusName && (
        <div className="mm-focus">
          <span>{focusName}</span>
          <button type="button" aria-label={t('取消高亮')} onClick={() => setFocusPart(null)}>×</button>
        </div>
      )}
      <div className="mm-row mm-actions">
        <button type="button" className={`pill ${labels ? 'pill-dark' : ''}`} aria-pressed={labels} onClick={() => useMobileLabels.getState().set(!labels)}>{t('标注')}{labels ? ' ✓' : ''}</button>
        <button type="button" className="pill" onClick={() => startAssembly(explodeId)}>{t('安装流程 ▶')}</button>
        <button type="button" className="pill pill-dark mm-done" onClick={() => setExplode(null)}>{t('完成')}</button>
      </div>
    </>
  );
}

function AssemblyControls() {
  const a = useStore((s) => s.assembly)!;
  const spec = useStore((s) => s.placements.find((p) => p.id === s.assembly?.unitId)?.spec);
  const steps = useMemo(() => (spec ? assemblyOf(spec) : []), [spec]);
  const [open, setOpen] = useState(false);
  const { playStep, stopAssembly } = useStore.getState();
  if (!spec || !steps.length) return null;
  const i = Math.min(a.step, steps.length - 1);
  const s = steps[i];
  return (
    <>
      <button type="button" className="mm-step" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="asm-no">{tf('{0} / {1}', [i + 1, steps.length])}</span>
        <span className="mm-title">{t(s.title)}</span>
        <span className="mm-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && <p className="mm-note">{t(s.note)}<span className="mm-ref">{t(specName(spec))} · {t(s.ref)}</span></p>}
      <div className="mm-progress"><span style={{ width: `${((i + Math.min(1, a.t)) / steps.length) * 100}%` }} /></div>
      <div className="mm-row mm-actions">
        <button type="button" className="pill" disabled={i === 0} onClick={() => playStep(i - 1)}>{t('◀ 上一步')}</button>
        <button type="button" className="pill" aria-label={t('重播这一步')} onClick={() => playStep(i)}>⟲</button>
        <button type="button" className="pill pill-dark" disabled={i >= steps.length - 1} onClick={() => playStep(i + 1)}>{t('下一步 ▶')}</button>
        <button type="button" className="pill" aria-label={t('退出安装流程')} onClick={stopAssembly}>✕</button>
      </div>
    </>
  );
}

export function MobileModeBar() {
  const explodeId = useStore((s) => s.explodeId);
  const asmOn = useStore((s) => !!s.assembly);
  if (!explodeId && !asmOn) return null;
  return <div className="mobile-mode" role="toolbar" aria-label={t(asmOn ? '安装流程' : '爆炸查看')}>{asmOn ? <AssemblyControls /> : <ExplodeControls />}</div>;
}
