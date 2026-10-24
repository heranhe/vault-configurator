import { t } from '../i18n';
import { useEffect, useRef } from 'react';

/** 使用原生模态对话框管理焦点，关闭后焦点回到零件库的入口按钮。 */
export function StackingGuide({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current!;
    // StrictMode 会重放 effect；此处不在清理阶段 close，避免排队的 close 事件误关刚打开的弹窗。
    if (!el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="stacking-guide card"
      aria-labelledby="stacking-guide-title"
      aria-describedby="stacking-guide-tip"
      onClose={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) e.currentTarget.close();
      }}
    >
      <div className="stacking-guide-heading">
        <div>
          <div className="fig">{t("VAULT · 说明书第 8 页")}</div>
          <h2 id="stacking-guide-title">{t("叠加组合方式")}</h2>
        </div>
        <button type="button" className="pill" autoFocus onClick={() => dialog.current?.close()} aria-label={t("关闭组合方式")}>{t("关闭 ×")}</button>
      </div>
      <img
        className="stacking-guide-image"
        src={`${import.meta.env.BASE_URL}guides/stacking-options-zh.webp`}
        width={1060}
        height={410}
        alt={t("说明书叠加示意图：不同高度的模组可以叠放，收纳箱和抽屉可以混搭，XL 宽度对应 S 加 M，L 宽度对应两个 S。")}
      />
      <ol className="stacking-guide-rules">
        <li><b>{t("不同高度，自由叠放")}</b><span>{t("1F、2F、4F 模组可以上下组合。")}</span></li>
        <li><b>{t("收纳箱与抽屉可以混搭")}</b><span>{t("按收纳需求组合不同类型的单元。")}</span></li>
        <li><b>XL = S + M</b><span>{t("XL 顶面可以并排放一个 S 和一个 M。")}</span></li>
        <li><b>L = S + S</b><span>{t("L 顶面可以并排放两个 S。")}</span></li>
      </ol>
      <p id="stacking-guide-tip" className="stacking-guide-tip">{t("同一列保持相同深度。将单元拖到顶面，绿色吸附提示表示可以放置。")}</p>
    </dialog>
  );
}
