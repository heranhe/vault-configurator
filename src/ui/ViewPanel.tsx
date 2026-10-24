import { t } from '../i18n';
import { VIEW_PRESETS } from '../scene/Scene';
import { useStore } from '../store';

/** 右侧视角面板：预设视角 + 占满画面 */
export function ViewPanel() {
  const preset = (name: string) => {
    useStore.setState({ viewAngle: VIEW_PRESETS[name] });
    useStore.getState().fitView();
  };

  return (
    <section>
      <div className="fig">{t("FIG. 04 · 视角")}</div>
      <div className="view-presets">
        {Object.keys(VIEW_PRESETS).map((k) => (
          <button key={k} className="pill" onClick={() => preset(k)}>{t(k)}</button>
        ))}
        <button className="pill pill-dark" onClick={() => useStore.getState().fitView()}>{t("占满画面")}</button>
      </div>
    </section>
  );
}
