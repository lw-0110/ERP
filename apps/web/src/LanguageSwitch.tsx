import { language, setLanguage } from './i18n.js';

export function LanguageSwitch() {
  return <button type="button" className="language-switch" aria-label={language() === 'zh' ? 'Switch to English' : '切换为中文'} onClick={() => void setLanguage(language() === 'zh' ? 'en' : 'zh')}>
    {language() === 'zh' ? 'English' : '中文'}
  </button>;
}
