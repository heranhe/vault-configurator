import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';

const UPDATED = '2026-10-23';

/** 免责声明与隐私说明。在线版和离线版共用；内容改动时同步更新 UPDATED。 */
function LegalDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current!;
    // StrictMode 会重放 effect；不在清理阶段 close，避免误关刚打开的弹窗（同 StackingGuide）。
    if (!el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="stacking-guide legal card"
      aria-labelledby="legal-title"
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
          <div className="fig">{t("最后更新 ")}{UPDATED}</div>
          <h2 id="legal-title">{t("免责声明与隐私说明")}</h2>
        </div>
        <button type="button" className="pill" onClick={() => dialog.current?.close()}>{t("关闭")}</button>
      </div>

      <section>
        <h3>{t("免责声明")}</h3>
        <ol>
          <li><b>{t("非官方工具。")}</b>{t("本工具由个人（迷途醉猫）开发，是 VAULT 模块化收纳系统的非官方辅助工具，与原设计者 USSA Design 没有隶属、合作或授权关系。「VAULT」名称、产品设计、说明书内容及图片的权利归原作者所有。")}</li>
          <li><b>{t("不提供图纸。")}</b>{t("本工具不提供、不出售、不分发 VAULT 的可打印模型文件（STL）。打印文件请通过原作者的官方渠道购买，并遵守其授权条款。站内的体验预览是降低精度的显示网格，仅用于展示，不能用于打印。")}</li>
          <li><b>{t("结果仅供参考。")}</b>{t("打印清单、打印份数、颜色、紧固件数量、尺寸和安装步骤由程序根据模型文件和说明书整理，可能存在遗漏或错误。打印、采购和装配前，请以原作者的说明书和模型文件为准。")}</li>
          <li><b>{t("风险自负。")}</b>{t("因使用本工具（包括依据其结果进行打印、采购、装配、改装或承重使用）造成的耗材、时间、财产损失或人身伤害，作者不承担责任。收纳单元的承重、稳定性和使用安全请自行评估。")}</li>
          <li><b>{t("按现状提供。")}</b>{t("本工具按现状提供，不保证持续可用、没有错误或适合特定用途，功能可能随时调整。")}</li>
          <li><b>{t("第三方链接。")}</b>{t("「购买模型」「小红书」等链接指向第三方网站，其内容、交易和服务由第三方负责。")}</li>
        </ol>
      </section>

      <section>
        <h3>{t("隐私说明")}</h3>
        <ul>
          <li><b>{t("不收集个人信息。")}</b>{t("无需注册账号，不收集姓名、联系方式等个人信息；没有广告和第三方统计代码。")}</li>
          <li><b>{t("模型文件不上传。")}</b>{t("你选择的模型文件夹只在你的浏览器里读取，不会上传到任何服务器。为加快下次显示，简化后的预览网格会缓存在本机浏览器的存储空间里。")}</li>
          <li><b>{t("方案保存在本机。")}</b>{t("搭建方案和配色自动保存在当前浏览器里，不会上传；清除该网站的浏览器数据即可删除。导出的 CSV 和打包文件直接保存到你的电脑。")}</li>
          <li><b>{t("网站托管。")}</b>{t("在线版托管在 Cloudflare Pages，访问时 Cloudflare 作为托管服务商会按其隐私政策处理 IP 地址、浏览器类型等必要的访问日志。本工具本身不会向任何服务器发送你的方案或模型数据。离线版不联网，不涉及此项。")}</li>
        </ul>
      </section>

      <p className="stacking-guide-tip">{t("使用本工具即表示你已阅读并同意以上内容。如有疑问，可通过小红书「迷途醉猫」联系作者。")}</p>
    </dialog>
  );
}

/** 打开免责声明与隐私说明的文字按钮 */
export function LegalLink({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`legal-link ${className}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>{t("免责声明 · 隐私")}</button>
      {open && <LegalDialog onClose={() => setOpen(false)} />}
    </>
  );
}
