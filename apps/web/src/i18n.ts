import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { zh } from './translations-zh.js';

export type Language = 'zh' | 'en';
const storageKey = 'booking-language';
const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
const initialLanguage: Language = stored === 'en' ? 'en' : 'zh';

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  lng: initialLanguage,
  fallbackLng: 'en',
  resources: { zh: { translation: zh }, en: { translation: {} } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function language(): Language { return i18n.language === 'en' ? 'en' : 'zh'; }
export async function setLanguage(next: Language): Promise<void> {
  await i18n.changeLanguage(next);
  if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, next);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'zh' ? 'zh-Hans' : 'en';
    document.title = t('Booking Management Platform');
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('Secure tenant-scoped booking management'));
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', next === 'zh' ? '/manifest.webmanifest' : '/manifest.en.webmanifest');
  }
}
export function t(value: string, options?: Record<string, string | number>): string {
  return i18n.t(value, options);
}
export function translateStatus(value: string | null | undefined): string {
  return value ? t(value.replaceAll('_', ' ')) : '';
}
export function locale(): string { return language() === 'zh' ? 'zh-Hans-MY' : 'en-MY'; }
export function formatDateTime(value: string | Date): string { return new Date(value).toLocaleString(locale()); }
export function formatDate(value: string | Date): string { return new Date(value).toLocaleDateString(locale()); }
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}
export function commissionExplanation(value: string | null | undefined): string {
  if (!value) return '';
  const match = /^Automatic service commission \((\d+(?:\.\d+)?)%\)\.$/.exec(value);
  return match ? t('Automatic service commission ({{percentage}}%).', { percentage: match[1] }) : value;
}
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage === 'zh' ? 'zh-Hans' : 'en';
  document.title = i18n.t('Booking Management Platform');
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('Secure tenant-scoped booking management'));
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', initialLanguage === 'zh' ? '/manifest.webmanifest' : '/manifest.en.webmanifest');
}
