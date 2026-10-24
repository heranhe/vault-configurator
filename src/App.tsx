import { t, syncDocumentLocale, useLocale } from './i18n';
import { LanguageSwitch } from './ui/LanguageSwitch';
import { useEffect, useMemo, useState } from 'react';
import { buildBom } from './core/bom';
import { dimsOf } from './core/dims';
import { boxOf } from './core/rules';
import { Scene } from './scene/Scene';
import { useStore } from './store';
import { AssemblyBar } from './ui/AssemblyBar';
import { BomPanel } from './ui/BomPanel';
import { Callouts } from './ui/Callouts';
import { Library } from './ui/Library';
import { RightPanel } from './ui/RightPanel';
import { SourceChip, SourceDialog, useSourceInit } from './ui/SourceDialog';
import { DEMO_SPECS } from './models/demo';
import { specName } from './core/dims';
import { StartPanel } from './ui/StartPanel';
import { LegalLink } from './ui/LegalDialog';
import { MobileTabs, useMobile, type Sheet } from './ui/MobileTabs';
import { MobileModeBar, useMobileLabels } from './ui/MobileModeBar';

function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useStore.setState({ toast: null }), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return toast ? <div className={`toast ${toast.kind}`}>{t(toast.text)}</div> : null;
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
    ['打印件', String(rows.reduce((n, r) => n + r.qty * r.piecesPerFile, 0))],
    ['颜色', String(new Set(rows.map((r) => r.colorId)).size)],
    ['螺栓', String(bolts)],
  ];
  return (
    <div className="chips">
      {chips.map(([k, v]) => (
        <span key={k} className="chip-read"><span className="k">{t(k)}</span> {v}</span>
      ))}
    </div>
  );
}

function StageCaption() {
  const [dismissed, setDismissed] = useState(false);
  const placements = useStore((s) => s.placements);
  const explodeId = useStore((s) => s.explodeId);
  const assembly = useStore((s) => !!s.assembly);
  const drag = useStore((s) => s.drag);
  const panMode = useStore((s) => s.panMode);
  const mobile = useMobile();
  let text = mobile ? '点下方零件库的卡片添加单元，连续点击一层层往上叠。' : '从左侧把单元拖到台面上，或连续点击卡片一层层往上叠。';
  if (placements.length) text = mobile ? '按住单元拖动整列 · 空白处单指旋转、双指缩放 · 点选后在「单元」里看爆炸图' : '拖动单元可以移动整列；靠近顶面会吸附，放不下的地方会变红并说明原因。双击单元查看爆炸图。';
  if (drag) text = mobile ? '松手放下 · 绿色 = 可以放 · 红色 = 放不下' : '松手放下 · 绿色 = 可以放 · 红色 = 放不下 · Esc 取消';
  if (explodeId) text = mobile ? '爆炸查看：点零件或标签高亮它，在「单元」里调展开程度。' : '爆炸查看：点零件或标签高亮它。拖右侧滑块控制展开程度，Esc 退出。';
  if (assembly) text = mobile ? '安装流程：下方每一步都可以重播。' : '安装流程：下方每一步都可以重播，← → 切换上一步 / 下一步，Esc 退出。';
  if (panMode) text = mobile ? '抓手已开启：单指拖动平移场景，双指缩放。' : '抓手已开启：按住左键拖动平移整个场景；滚轮缩放，Esc 退出抓手。';
  if (dismissed) return null;
  return (
    <div className="stage-caption">
      <span>{t(text)}</span>
      <button className="stage-caption-close" type="button" aria-label={t("关闭操作提示")} title={t("关闭操作提示")} onClick={() => setDismissed(true)}>×</button>
    </div>
  );
}

function ModelWelcome() {
  const pathSupported = useStore((s) => s.pathSupported);
  return (
    <div className="model-welcome-wrap">
      <div className="model-welcome card">
        <div className="welcome-copy">
          <div className="fig">YOUR MODELS · YOUR WORKSPACE</div>
          <h1>{t("导入你自己的模型")}</h1>
          <p>{t("连接已下载的 VAULT 文件夹，开始搭建完整方案。")}</p>
          <button className="pill pill-dark import-primary" onClick={() => useStore.setState({ sourceDialog: true })}>
            ＋ {t(pathSupported ? '填写模型文件夹路径' : '选择模型文件夹')}
          </button>
          <div className="muted small import-note">{t("支持递归识别子文件夹。文件留在你的电脑，不会上传。")}</div>
        </div>
        <div className="welcome-demos">
          <div className="demo-divider"><span>{t("从这 4 款开始搭建")}</span></div>
          <div className="demo-grid">
            {DEMO_SPECS.map((spec, i) => (
              <button key={i} className="demo-choice" onClick={() => useStore.getState().clickAdd(spec)}>
                <img src={`${import.meta.env.BASE_URL}thumbs/${spec.type}-S-${'height' in spec ? spec.height : 1}F.webp`} alt="" />
                <span>{t(specName(spec))}</span><small>{t("＋ 添加")}</small>
              </button>
            ))}
          </div>
          <div className="muted small welcome-model-note">{t("其余规格需导入本地模型，打印导出需原始 STL。")}</div>
          <div className="muted small welcome-legal">{t("非官方辅助工具，不提供 VAULT 图纸。使用即表示同意")}<LegalLink /></div>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const locale = useLocale((s) => s.locale);
  useEffect(() => syncDocumentLocale(locale), [locale]);
  useSourceInit();
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const xray = useStore((s) => s.xray);
  const panMode = useStore((s) => s.panMode);
  const placements = useStore((s) => s.placements.length);
  const source = useStore((s) => s.source);
  const welcoming = !source && !placements;
  const asmOn = useStore((s) => !!s.assembly);
  const explodeId = useStore((s) => s.explodeId);
  const selectedId = useStore((s) => s.selectedId);
  const mobile = useMobile();
  const [sheet, setSheet] = useState<Sheet | null>('library');
  // 进入爆炸 / 安装流程：桌面切到「单元」面板；手机收起面板，改用底部控制条（MobileModeBar），退出后回到「单元」
  const inMode = !!explodeId || asmOn;
  useEffect(() => {
    if (inMode) setSheet(mobile ? null : 'unit');
    else if (mobile) setSheet((s) => s ?? 'unit');
  }, [inMode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    useMobileLabels.getState().set(false); // 每次进入爆炸图，手机端标注都从关闭开始
  }, [explodeId]);
  // 抽屉收起时点选单元也展开它（爆炸 / 安装流程中除外）
  useEffect(() => {
    if (selectedId && !inMode) setSheet((s) => s ?? 'unit');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
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
        else if (st.panMode) useStore.setState({ panMode: false });
        else if (st.assembly) st.stopAssembly();
        else if (st.explodeId) st.setExplode(null);
        else st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app sheet-${sheet ?? 'none'} ${welcoming ? 'app-welcome' : ''} ${asmOn ? 'mode-asm' : explodeId ? 'mode-explode' : ''}`}>
      {/* 3D 场景铺满整个窗口，所有面板半透明浮在场景上 */}
      <div
        className={`canvas-layer ${panMode ? 'pan-mode' : ''}`}
        onPointerDownCapture={(e) => { if (e.button === 1) e.preventDefault(); }}
      >
        <Scene />
      </div>
      <Callouts />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand">{t("VAULT 配置器")}</div>
          <div className="brand-author">{t("工具作者：迷途醉猫")}</div>
          <LegalLink />
        </div>
        <LanguageSwitch />
        <a className="pill pill-xhs" href="https://www.xiaohongshu.com/user/profile/56587f61b8ce1a583ad11678" target="_blank" rel="noreferrer" title={t("迷途醉猫的小红书")}>{t("小红书 ↗")}</a>
        <div className="top-mid">
          <button className="pill pill-dark" onClick={() => useStore.setState({ startOpen: true })}>{t("＋ 新建 / 示例")}</button>
          <button className="pill" onClick={undo} disabled={!past} title={t("撤销 Ctrl+Z")}>{t("↶ 撤销")}</button>
          <button className="pill" onClick={redo} disabled={!future} title={t("重做 Ctrl+Shift+Z")}>↷</button>
          <button className={`pill ${xray ? 'pill-dark' : ''}`} onClick={() => setXray(!xray)}>{t("X 光")}</button>
          <button className="pill" onClick={() => { useStore.setState({ viewAngle: null }); fitView(); }}>{t("重置视角")}</button>
          <button className="pill" disabled={!placements} onClick={() => confirm(t('清空台面？可撤销')) && clearAll()}>{t("清空")}</button>
        </div>
        <div className="top-right">
          <SourceChip />
          <a className="pill pill-yellow" href="https://www.ussadesign.com/products/vault" target="_blank" rel="noreferrer">{t("购买模型 ↗")}</a>
        </div>
      </header>

      <main className={`frame ${welcoming ? 'frame-welcome' : ''}`}>
        <Library />
        <section className="stage-overlay">
          <div className="scene-tools" role="toolbar" aria-label={t("场景操作")}>
            <button
              className={`pill ${panMode ? 'pill-dark' : ''}`}
              aria-label={t("抓手平移")}
              aria-pressed={panMode}
              title={t("开启后按住左键拖动平移；中键始终可平移，滚轮缩放")}
              onClick={() => useStore.setState({ panMode: !panMode })}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 13V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7h-1c-2 0-3.5-1-4.5-2.5L4 13a1.5 1.5 0 0 1 2.5-1.5L8 13Z" />
              </svg>
              {t("平移")}{t(panMode ? ' · 已开启' : '')}
            </button>
          </div>
          {!welcoming && <div className="stage-caption-slot"><StageCaption /></div>}
          {welcoming && <ModelWelcome />}
          {!source && !!placements && (
            <div className="import-reminder">
              <span>{t(mobile ? '当前仅 4 款体验单元' : '当前显示 4 款基础单元 · 导入模型文件夹后显示全部规格')}</span>
              <button className="pill pill-yellow" onClick={() => useStore.setState({ sourceDialog: true })}>{t("导入我的模型")}</button>
            </div>
          )}
          {source && !placements && (
            <div className="empty-hint">
              <div className="big">{t("模型已连接，开始搭建")}</div>
              <div>{t(mobile ? '点下方零件库的卡片添加一个单元' : '从左侧拖一个单元进来')}</div>
              <button className="pill pill-yellow" onClick={() => useStore.setState({ startOpen: true })}>{t("看看示例方案")}</button>
            </div>
          )}
          {!welcoming && (asmOn ? <AssemblyBar /> : <Readouts />)}
        </section>
        <RightPanel />
      </main>

      <BomPanel />
      <MobileTabs sheet={sheet} onChange={setSheet} />
      <MobileModeBar />
      <StartPanel />
      <SourceDialog />
      <Toast />
    </div>
  );
}
