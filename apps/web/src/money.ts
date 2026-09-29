export function formatMoney(amountMinor: number, currency: string): string {
  const amount = (amountMinor / 100).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'MYR' ? `RM${amount}` : `${currency} ${amount}`;
}
