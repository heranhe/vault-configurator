import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { EXAMPLES } from '../data/examples';
import { useStore } from '../store';
import { useMobile } from './MobileTabs';

const WELCOMED = 'vault-welcomed-v1';

/** 首次进入自动打开；之后从顶栏「新建 / 示例」打开 */
export function useStartPanelInit() {
  useEffect(() => {
    let seen = false;
    try {
      seen = !!localStorage.getItem(WELCOMED);
    } catch {
      /* 隐私模式：每次都显示 */
    }
    if (!seen) useStore.setState({ startOpen: true });
  }, []);
}

function ExampleImage({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="ex-img ex-img-empty">{t("预览图生成中")}</div> : <img className="ex-img" src={`${import.meta.env.BASE_URL}examples/${id}.webp`} alt="" onError={() => setFailed(true)} />;
}

export function StartPanel() {
  const open = useStore((s) => s.startOpen);
  const source = useStore((s) => s.source);
  const hasUnits = useStore((s) => s.placements.length > 0);
  const mobile = useMobile();
  if (!open) return null;

  const close = () => {
    try {
      localStorage.setItem(WELCOMED, '1');
    } catch {
      /* 忽略 */
    }
    useStore.setState({ startOpen: false });
  };
  const start = (fn: () => void) => {
    fn();
    close();
  };

  return (
    <div className="modal-mask" onClick={close}>
      <div className="start card" onClick={(e) => e.stopPropagation()}>
        {/* 手机上「先随便看看」在示例卡片下方很远，顶部再放一个关闭按钮（桌面隐藏） */}
        <button type="button" className="pill start-close" aria-label={t("关闭")} onClick={close}>✕</button>
        <div className="fig">{t("FIG. 00 · 开始")}</div>
        <h2>{t("拼一套你的 VAULT 收纳系统")}</h2>

        <ol className="steps">
          <li>
            <span className="step-num">1</span>
            <div>
              <b>{t("导入自己的模型文件夹")}</b>
              <div className="muted small">{t("未导入时显示 4 款基础单元，导入后显示全部规格并支持打印打包")}</div>
              <button className={`pill ${source ? '' : 'pill-yellow'}`} onClick={() => useStore.setState({ sourceDialog: true })}>
                {t(source ? `● 已连接 ${source.files.size} 个文件` : '连接文件夹')}
              </button>
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <b>{t("选一个示例，或从空白开始")}</b>
              <div className="muted small">{t(mobile ? '点下方零件库的卡片添加单元，连续点击往上叠，放不下会提示原因' : '从左侧零件库拖单元上台面，靠近顶面自动吸附，放不下会提示原因')}</div>
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <b>{t("配色 · 看爆炸图 · 打包下载")}</b>
              <div className="muted small">{t(mobile ? '在「单元」里选拓竹 PLA 色号、看爆炸图；在「清单」里一键打包所需文件和紧固件清单' : '右侧选拓竹 PLA 色号；双击单元看爆炸图；底部一键打包所需文件和紧固件清单')}</div>
            </div>
          </li>
        </ol>

        <div className="ex-grid">
          <button className="ex-card ex-new" onClick={() => start(() => useStore.getState().clearAll())}>
            <div className="ex-img ex-plus">＋</div>
            <b>{t("空白方案")}</b>
            <span className="muted small">{t(hasUnits ? '清空当前台面（可撤销）' : '从零开始自己拼')}</span>
          </button>
          {EXAMPLES.map((ex) => (
            <button key={ex.id} className="ex-card" onClick={() => start(() => useStore.getState().loadExample(ex.build()))}>
              <ExampleImage id={ex.id} />
              <b>{t(ex.name)}</b>
              <span className="muted small">{t(ex.desc)}</span>
            </button>
          ))}
        </div>

        <div className="modal-foot">
          <span className="muted small">{t("方案自动保存在本机浏览器里；载入示例会替换当前台面，可以撤销。")}</span>
          <span className="spacer" />
          <button className="pill" onClick={close}>{t(hasUnits ? '继续当前方案' : '先随便看看')}</button>
        </div>
      </div>
    </div>
  );
}
