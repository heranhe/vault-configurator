import { useLocale } from '../i18n';

export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="language-switch seg" role="group" aria-label={locale === 'zh' ? '界面语言 / Language' : 'Language / 界面语言'}>
      <button type="button" lang="zh-CN" aria-pressed={locale === 'zh'} className={locale === 'zh' ? 'on' : ''} onClick={() => setLocale('zh')}>中文</button>
      <button type="button" lang="en" aria-pressed={locale === 'en'} className={locale === 'en' ? 'on' : ''} onClick={() => setLocale('en')}>EN</button>
    </div>
  );
}
