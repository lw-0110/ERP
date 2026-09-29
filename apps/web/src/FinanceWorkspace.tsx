import { apiFetch } from './api-fetch.js';
import { t, locale, translateStatus, commissionExplanation } from './i18n.js';
import { formatMoney } from './money.js';
import { useEffect, useState } from 'react';
import { hasPermission, type PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { DataTable, FormDialog, RecordDrawer, RecordField, RecordSection } from './ui.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export type FinanceSection = 'my-payments' | 'payments' | 'my-commission' | 'commissions' | 'commission-rules';
type Line = { id: string; currencySnapshot: string; serviceId: string; sortOrder: number; staffAssignments?: { staffId: string; staff?: { displayName: string } }[] };
type Booking = { id: string; bookingNumber: string; status: string; paymentStatus: string; services: Line[]; customer?: { displayName: string } };
type Payment = { id: string; amountMinor: number; currency: string; paymentMethod: string; paidAt: string };
type Summary = { paymentStatus: string; totalsByCurrency: { currency: string; bookedMinor: number; paidMinor: number }[]; payments: Payment[] };
type Commission = { id: string; amountMinor: number; currency: string; sourceSnapshot: { explanation?: string }; booking?: { bookingNumber: string }; staff?: { displayName: string } };
type Rule = { id: string; version: number; status: string; serviceId: string | null; configuration: unknown };

export function FinanceWorkspace({ identity, section }: { identity: PermissionContext; section: FinanceSection }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedCommission, setSelectedCommission] = useState<Commission | null>(null);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [paymentAction, setPaymentAction] = useState<'record' | 'status' | null>(null);
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await apiFetch(`${api}${path}`, { credentials: 'include', ...init });
    if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
    return response.json() as Promise<T>;
  }
  const json = (method: string, body: object): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  async function load() {
    setLoading(true); setError('');
    try {
      if (section === 'my-payments') { const next = await request<Booking[]>('/bookings/my'); setBookings(next); setSelected((previous) => next.find((row) => row.id === previous?.id) ?? null); }
      if (section === 'payments') { const next = await request<Booking[]>('/bookings'); setBookings(next); setSelected((previous) => next.find((row) => row.id === previous?.id) ?? null); }
      if (section === 'my-commission') setCommissions(await request<Commission[]>('/commissions/my'));
      if (section === 'commissions') setCommissions(await request<Commission[]>('/commissions'));
      if (section === 'commission-rules') setRules(await request<Rule[]>('/commission-rules'));
      if (selected && (section === 'my-payments' || section === 'payments')) setSummary(await request<Summary>(section === 'my-payments' ? `/bookings/my/${selected.id}/payment-summary` : `/bookings/${selected.id}/payment-summary`));
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [section]);
  async function act(action: () => Promise<unknown>) {
    setError(''); setMessage('');
    try { await action(); setPaymentAction(null); setRuleFormOpen(false); setMessage('Saved.'); await load(); }
    catch (cause) { setError((cause as Error).message); }
  }
  async function choose(booking: Booking) {
    setSelected(booking); setSummary(null); setError('');
    if (section === 'my-payments' || section === 'payments') {
      try { setSummary(await request<Summary>(section === 'my-payments' ? `/bookings/my/${booking.id}/payment-summary` : `/bookings/${booking.id}/payment-summary`)); }
      catch (cause) { setError((cause as Error).message); }
    }
  }
  return <section className="panel finance-page">
    <h2>{section === 'my-payments' ? t('My Payments') : section === 'payments' ? t('Payments') : section === 'my-commission' ? t('My Commission') : section === 'commissions' ? t('Commission Records') : t('Commission Rules')}</h2>
    {error && <p role="alert" className="error">{t(error)}</p>}{message && <p role="status">{t(message)}</p>}
    {(section === 'my-payments' || section === 'payments') && <>
      <DataTable rows={bookings} loading={loading} selectedId={selected?.id} onSelect={(booking) => void choose(booking)} mobileSummary={(row, index) => <><small>#{index + 1}</small><strong>{row.customer?.displayName ?? t('Booking')}</strong><span>{translateStatus(row.status)} · {translateStatus(row.paymentStatus)}</span></>} empty={t("No bookings.")} columns={[{ label: 'No.', render: (row) => bookings.findIndex((item) => item.id === row.id) + 1 }, { label: 'Customer', render: (row) => row.customer?.displayName ?? '—' }, { label: 'Booking status', render: (row) => row.status }, { label: 'Payment status', render: (row) => row.paymentStatus }]} />
      <RecordDrawer title={t("Payment Details")} open={Boolean(selected && summary)} onClose={() => { setSelected(null); setSummary(null); }} actions={section === 'payments' && selected && <>{hasPermission(identity, 'payment.record') && <button type="button" onClick={() => setPaymentAction('record')}>{t("Record Payment")}</button>}{hasPermission(identity, 'payment.status.manage') && <button type="button" className="secondary" onClick={() => setPaymentAction('status')}>{t("Update Status")}</button>}</>}>{selected && summary && <><RecordSection title={t("Booking")}><RecordField label={t("Customer")}>{selected.customer?.displayName ?? t('Booking')}</RecordField><RecordField label={t("Status")}>{translateStatus(selected.status)}</RecordField><RecordField label={t("Payment status")}>{translateStatus(summary.paymentStatus)}</RecordField></RecordSection><RecordSection title={t("Totals")}>{summary.totalsByCurrency.map((total) => <RecordField key={total.currency} label={total.currency}>{t("Booked")} {formatMoney(total.bookedMinor, total.currency)} {t("· Paid")} {formatMoney(total.paidMinor, total.currency)}</RecordField>)}</RecordSection><RecordSection title={t("Payment history")}>{summary.payments.length ? summary.payments.map((payment) => <div key={payment.id} className="record-payment"><RecordField label={t("Amount")}>{formatMoney(payment.amountMinor, payment.currency)}</RecordField><RecordField label={t("Method")}>{payment.paymentMethod}</RecordField><RecordField label={t("Paid at")}>{new Date(payment.paidAt).toLocaleString(locale())}</RecordField></div>) : <p>{t("No payments recorded.")}</p>}</RecordSection></>}</RecordDrawer>
      <FormDialog title={paymentAction === 'record' ? t('Record Payment') : t('Update Payment Status')} open={Boolean(paymentAction)} onClose={() => setPaymentAction(null)}>{selected && summary && paymentAction === 'record' && <form className="stack" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(() => request(`/bookings/${selected.id}/payments`, json('POST', { amountMinor: Number(data.get('amount')), currency: data.get('currency'), paymentMethod: data.get('method'), paidAt: new Date(String(data.get('paidAt'))).toISOString(), reference: data.get('reference') || undefined }))); }}><label>{t("Amount in minor units")}<input name="amount" type="number" min="1" step="1" required /></label><label>{t("Currency")}<input name="currency" maxLength={3} required /></label><label>{t("Payment method")}<input name="method" required /></label><label>{t("Paid at")}<input name="paidAt" type="datetime-local" required /></label><label>{t("Reference")}<input name="reference" /></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setPaymentAction(null)}>{t("Cancel")}</button><button>{t("Record payment")}</button></div></form>}{selected && summary && paymentAction === 'status' && <form className="stack" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(() => request(`/bookings/${selected.id}/payment-status`, json('PATCH', { status: data.get('status') }))); }}><label>{t("Payment status")}<select name="status" defaultValue={summary.paymentStatus}>{['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUND_PENDING', 'REFUNDED'].map((status) => <option key={status} value={status}>{translateStatus(status)}</option>)}</select></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setPaymentAction(null)}>{t("Cancel")}</button><button>{t("Update status manually")}</button></div></form>}</FormDialog>
    </>}
    {(section === 'my-commission' || section === 'commissions') && <>
      <p>{t("Commission is calculated automatically when an assigned booking is completed.")}</p>
      <DataTable rows={commissions} loading={loading} selectedId={selectedCommission?.id} onSelect={setSelectedCommission} mobileSummary={(row) => <><strong>{row.staff?.displayName ?? t('Commission')}</strong><span>{formatMoney(row.amountMinor, row.currency)}</span><small>{commissionExplanation(row.sourceSnapshot.explanation) || ''}</small></>} empty={t("No commission records.")} columns={[{ label: 'Staff', render: (row) => row.staff?.displayName ?? '—' }, { label: 'Amount', render: (row) => formatMoney(row.amountMinor, row.currency) }, { label: 'Explanation', render: (row) => commissionExplanation(row.sourceSnapshot.explanation) || '—' }]} />
      <RecordDrawer title={t("Commission Details")} open={Boolean(selectedCommission)} onClose={() => setSelectedCommission(null)}>{selectedCommission && <RecordSection title={t("Commission")}><RecordField label={t("Staff")}>{selectedCommission.staff?.displayName ?? '—'}</RecordField><RecordField label={t("Amount")}>{formatMoney(selectedCommission.amountMinor, selectedCommission.currency)}</RecordField><RecordField label={t("Explanation")}>{commissionExplanation(selectedCommission.sourceSnapshot.explanation) || '—'}</RecordField></RecordSection>}</RecordDrawer>
    </>}
    {section === 'commission-rules' && <><div className="page-actions">{hasPermission(identity, 'commission.rule.manage') && <button type="button" onClick={() => setRuleFormOpen(true)}>{t("New Draft Rule")}</button>}</div><DataTable rows={rules} loading={loading} selectedId={selectedRule?.id} onSelect={setSelectedRule} mobileSummary={(row) => <><strong>{row.serviceId ? t('Service rule') : t('Organization-wide rule')}</strong><span>{t("Version")} {row.version}</span><small>{translateStatus(row.status)}</small></>} empty={t("No draft rules.")} columns={[{ label: 'Scope', render: (row) => row.serviceId ? t('Service') : t('Organization-wide') }, { label: 'Version', render: (row) => row.version }, { label: 'Status', render: (row) => row.status }]} /><RecordDrawer title={t("Commission Rule Details")} open={Boolean(selectedRule)} onClose={() => setSelectedRule(null)}>{selectedRule && <RecordSection title={t("Rule")}><RecordField label={t("Scope")}>{selectedRule.serviceId ? t('Service') : t('Organization-wide')}</RecordField><RecordField label={t("Version")}>{selectedRule.version}</RecordField><RecordField label={t("Status")}>{translateStatus(selectedRule.status)}</RecordField><RecordField label={t("Configuration")}>{selectedRule.configuration && typeof selectedRule.configuration === 'object' ? Object.entries(selectedRule.configuration).map(([key, value]) => <span key={key}>{key}: {String(value)}<br /></span>) : String(selectedRule.configuration)}</RecordField></RecordSection>}</RecordDrawer><FormDialog title={t("New Draft Rule")} open={ruleFormOpen} onClose={() => setRuleFormOpen(false)}><form className="stack" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { const configuration: unknown = JSON.parse(String(data.get('configuration'))); void act(() => request('/commission-rules', json('POST', { serviceId: data.get('serviceId') || undefined, configuration }))); } catch { setError('Enter a valid JSON object.'); } }}><p>{t("Create draft (no automatic calculation).")}</p><label>{t("Optional service UUID")}<input name="serviceId" /></label><label>{t("Configuration JSON")}<textarea name="configuration" defaultValue="{}" required /></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setRuleFormOpen(false)}>{t("Cancel")}</button><button>{t("Save draft")}</button></div></form></FormDialog></>}
  </section>;
}
