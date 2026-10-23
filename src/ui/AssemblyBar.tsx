// 安装流程控制条：3D 区下方。当前步骤说明 + 每一步的重播按钮 + 上一步 / 下一步
import { useEffect, useMemo } from 'react';
import { assemblyOf } from '../core/assembly';
import { specName } from '../core/dims';
import { useStore } from '../store';

export function AssemblyBar() {
  const a = useStore((s) => s.assembly);
  const spec = useStore((s) => s.placements.find((p) => p.id === s.assembly?.unitId)?.spec);
  const steps = useMemo(() => (spec ? assemblyOf(spec) : []), [spec]);
  const { playStep, stopAssembly } = useStore.getState();

  useEffect(() => {
    if (!a) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      const cur = useStore.getState().assembly;
      if (!cur) return;
      if (e.key === 'ArrowRight' && cur.step < steps.length - 1) playStep(cur.step + 1);
      else if (e.key === 'ArrowLeft' && cur.step > 0) playStep(cur.step - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!a, steps.length]);

  if (!a || !spec || !steps.length) return null;
  const s = steps[Math.min(a.step, steps.length - 1)];
  const progress = Math.min(1, a.t);
  return (
    <div className="asm">
      <div className="asm-card">
        <div className="asm-head">
          <span className="asm-no">第 {a.step + 1} / {steps.length} 步</span>
          <span className="asm-title">{s.title}</span>
          <span className="asm-ref">{specName(spec)} · {s.ref}</span>
        </div>
        <p className="asm-note">{s.note}</p>
      </div>
      <div className="asm-bar">
        <div className="asm-steps">
          {steps.map((x, i) => (
            <button
              key={i}
              className={`asm-step ${i === a.step ? 'on' : ''} ${i < a.step ? 'done' : ''}`}
              title={`${x.title}（点击重播这一步）`}
              onClick={() => playStep(i)}
            >
              第{i + 1}步 <span className="asm-play">{i === a.step && a.playing ? '❚❚' : '▶'}</span>
              {i === a.step && <span className="asm-progress" style={{ transform: `scaleX(${progress})` }} />}
            </button>
          ))}
        </div>
      </div>
      {/* 上一步 / 下一步：竖排在 3D 区右上角，方便连续快速点击 */}
      <div className="asm-nav">
        <button className="pill" disabled={a.step === 0} onClick={() => playStep(a.step - 1)}>▲ 上一步</button>
        <button className="pill pill-dark" disabled={a.step >= steps.length - 1} onClick={() => playStep(a.step + 1)}>▼ 下一步</button>
        <button className="pill" title="从第 1 步连续播放" onClick={() => useStore.getState().startAssembly(a.unitId)}>⟲ 全部重播</button>
        <button className="pill" title="Esc" onClick={stopAssembly}>✕ 退出</button>
      </div>
    </div>
  );
}
