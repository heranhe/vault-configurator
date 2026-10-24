import { create } from 'zustand';
import { en } from './en';

export type Locale = 'zh' | 'en';
export const LOCALE_KEY = 'vault-language-v1';

/** Existing users keep Chinese; an explicit choice is saved independently of project data. */
export function readLocale(storage?: Pick<Storage, 'getItem'>): Locale {
  try {
    return (storage ?? localStorage).getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

export const useLocale = create<{ locale: Locale; setLocale: (locale: Locale) => void }>((set) => ({
  locale: readLocale(),
  setLocale: (locale) => {
    if (locale !== 'zh' && locale !== 'en') return;
    set({ locale });
    try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* file:// and private browsing can restrict storage */ }
  },
}));

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Dynamic source messages retain their Chinese canonical form in state and model metadata.
// Translate at the display boundary so changing language also updates memoized data and existing errors.
const patterns = Object.entries(en)
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => Number(a.startsWith('{')) - Number(b.startsWith('{')) || b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => ({
    re: new RegExp('^' + key.trim().split(/\{\d+\}/).map(escapeRegExp).join('([\\s\\S]*?)') + '$'),
    value,
  }));

export function t(value: string | null | undefined, locale: Locale = useLocale.getState().locale): string {
  if (value == null) return '';
  if (locale === 'zh' || !/\p{Script=Han}/u.test(value)) return value;
  const trimmed = value.trim();
  if (trimmed !== value) return value.slice(0, value.indexOf(trimmed)) + t(trimmed, locale) + value.slice(value.indexOf(trimmed) + trimmed.length);
  if (Object.hasOwn(en, value)) return en[value];
  if (value.includes('；') && !/[。！？]/.test(value)) return value.split('；').map((part) => t(part, locale)).join('; ');
  for (const { re, value: translated } of patterns) {
    const match = re.exec(value);
    if (match) return translated.replace(/\{(\d+)\}/g, (_, i) => t(match[Number(i) + 1], locale));
  }
  // Unit names and individual part labels are composed from stable metadata plus size/index codes.
  const unit = /^(\S+ · )(.*)$/.exec(value);
  if (unit) return unit[1] + t(unit[2], locale);
  const instance = /^(.*?)( \d+\/\d+)$/.exec(value);
  if (instance) return t(instance[1], locale) + instance[2];
  return value;
}

/** Explicit formatted messages let translators reorder counters without fragmenting sentences. */
export function tf(key: string, values: (string | number)[], locale: Locale = useLocale.getState().locale) {
  const template = locale === 'en' ? en[key] ?? key : key;
  return template.replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ''));
}

export function syncDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  document.title = t('VAULT 配置器', locale);
}
