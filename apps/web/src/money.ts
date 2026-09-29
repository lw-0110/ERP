import { locale } from './i18n.js';
export function formatMoney(amountMinor: number, currency: string): string {
  const amount = (amountMinor / 100).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'MYR' ? `RM${amount}` : `${currency} ${amount}`;
}
