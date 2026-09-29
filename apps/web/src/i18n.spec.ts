import { afterEach, describe, expect, it } from 'vitest';
import { commissionExplanation, i18n, setLanguage, translateStatus } from './i18n.js';

afterEach(async () => { await setLanguage('zh'); });

describe('language selection', () => {
  it('starts in Chinese and switches interface text to English', async () => {
    expect(i18n.t('Sign in')).toBe('登录');
    await setLanguage('en');
    expect(i18n.t('Sign in')).toBe('Sign in');
  });

  it('translates business statuses without changing their codes', () => {
    expect(translateStatus('PARTIALLY_PAID')).toBe('部分付款');
    expect(translateStatus('ACTIVE')).toBe('启用');
  });
  it('translates generated commission explanations and leaves custom text intact', () => {
    expect(commissionExplanation('Automatic service commission (30%).')).toBe('自动服务佣金（30%）。');
    expect(commissionExplanation('Manager note')).toBe('Manager note');
  });
});
