import { useEffect, useState } from 'react';
import { useStore } from '../store';

/** 手机布局的断点，和 styles.css 里的 @media (max-width: 720px) 保持一致 */
export const MOBILE_QUERY = '(max-width: 720px)';

export function useMobile() {
  const [mobile, setMobile] = useState(() => matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

/** 手机底部抽屉显示哪块面板；null = 收起，3D 区占满 */
export type Sheet = 'library' | 'unit' | 'bom';
const TABS: [Sheet, string][] = [['library', '零件库'], ['unit', '单元'], ['bom', '清单']];

export function MobileTabs({ sheet, onChange }: { sheet: Sheet | null; onChange: (s: Sheet | null) => void }) {
  const count = useStore((s) => s.placements.length);
  const selected = useStore((s) => !!s.selectedId);
  const badge: Record<Sheet, string | null> = { library: null, unit: selected ? '●' : null, bom: count ? String(count) : null };
  return (
    <nav className="mobile-tabs" aria-label="面板">
      {TABS.map(([k, label]) => (
        <button key={k} className={sheet === k ? 'on' : ''} aria-pressed={sheet === k} onClick={() => onChange(sheet === k ? null : k)}>
          {label}
          {badge[k] && <span className="mobile-badge">{badge[k]}</span>}
        </button>
      ))}
      <button className="mobile-collapse" disabled={!sheet} aria-label="收起面板" onClick={() => onChange(null)}>▾</button>
    </nav>
  );
}
