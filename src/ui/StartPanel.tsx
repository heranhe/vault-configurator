import { useEffect, useState } from 'react';
import { EXAMPLES } from '../data/examples';
import { useStore } from '../store';

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
  return failed ? <div className="ex-img ex-img-empty">预览图生成中</div> : <img className="ex-img" src={`/examples/${id}.webp`} alt="" onError={() => setFailed(true)} />;
}

export function StartPanel() {
  const open = useStore((s) => s.startOpen);
  const source = useStore((s) => s.source);
  const hasUnits = useStore((s) => s.placements.length > 0);
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
        <div className="fig">FIG. 00 · 开始</div>
        <h2>拼一套你的 VAULT 收纳系统</h2>

        <ol className="steps">
          <li>
            <span className="step-num">1</span>
            <div>
              <b>连接模型文件夹</b>
              <div className="muted small">读取你本地下载好的 STL，用来显示真实模型和打包下载</div>
              <button className={`pill ${source ? '' : 'pill-yellow'}`} onClick={() => useStore.setState({ sourceDialog: true })}>
                {source ? `● 已连接 ${source.files.size} 个文件` : '连接文件夹'}
              </button>
            </div>
          </li>
          <li>
            <span className="step-num">2</span>
            <div>
              <b>选一个示例，或从空白开始</b>
              <div className="muted small">从左侧零件库拖单元上台面，靠近顶面自动吸附，放不下会提示原因</div>
            </div>
          </li>
          <li>
            <span className="step-num">3</span>
            <div>
              <b>配色 · 看爆炸图 · 打包下载</b>
              <div className="muted small">右侧选拓竹 PLA 色号；双击单元看爆炸图；底部一键打包所需文件和紧固件清单</div>
            </div>
          </li>
        </ol>

        <div className="ex-grid">
          <button className="ex-card ex-new" onClick={() => start(() => useStore.getState().clearAll())}>
            <div className="ex-img ex-plus">＋</div>
            <b>空白方案</b>
            <span className="muted small">{hasUnits ? '清空当前台面（可撤销）' : '从零开始自己拼'}</span>
          </button>
          {EXAMPLES.map((ex) => (
            <button key={ex.id} className="ex-card" onClick={() => start(() => useStore.getState().loadExample(ex.build()))}>
              <ExampleImage id={ex.id} />
              <b>{ex.name}</b>
              <span className="muted small">{ex.desc}</span>
            </button>
          ))}
        </div>

        <div className="modal-foot">
          <span className="muted small">方案自动保存在本机浏览器里；载入示例会替换当前台面，可以撤销。</span>
          <span className="spacer" />
          <button className="pill" onClick={close}>{hasUnits ? '继续当前方案' : '先随便看看'}</button>
        </div>
      </div>
    </div>
  );
}
