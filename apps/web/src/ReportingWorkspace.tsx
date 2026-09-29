import { apiFetch } from './api-fetch.js';
import { t, language, translateStatus } from './i18n.js';
import { useEffect, useState } from 'react';
import { hasPermission, type PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Report = Record<string, unknown> & { rows?: Record<string, unknown>[] };
type Settings = {
  name: string;
  timezone: string;
  defaultCurrency: string;
  bookingNumberPrefix: string;
};
type BookingPolicy = {
  customerCancellationEnabled: boolean;
  customerRescheduleEnabled: boolean;
  cancellationCutoffMinutes: number | null;
  rescheduleCutoffMinutes: number | null;
  maxCustomerReschedules: number | null;
};
type Section =
  | 'Dashboard'
  | 'Sales'
  | 'Bookings'
  | 'Payments'
  | 'Commissions'
  | 'Attendance'
  | 'Leave'
  | 'Staff detail'
  | 'My commission'
  | 'Settings';
const paths: Partial<Record<Section, string>> = {
  Dashboard: '/reports/dashboard',
  Sales: '/reports/payments',
  Bookings: '/reports/bookings',
  Payments: '/reports/payments',
  Commissions: '/reports/commissions',
  Attendance: '/reports/attendance',
  Leave: '/reports/leave',
  'My commission': '/reports/commissions/my',
};
const exports: Partial<Record<Section, string>> = {
  Bookings: 'bookings',
  Payments: 'payments',
  Commissions: 'commissions',
  Attendance: 'attendance',
  Leave: 'leave',
};
function label(value: string) {
  return t(value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()));
}
function dayInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function previousDays(day: string, count: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}
function display(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.map(display).join(' · ');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${label(key)}: ${display(item)}`).join(' · ');
  if (typeof value === 'string' && /^[A-Z_]+$/.test(value)) return translateStatus(value);
  return String(value);
}

export function ReportingWorkspace({ identity, section }: { identity: PermissionContext; section: Section }) {
  const organizationTimeZone =
    (identity as PermissionContext & { organization?: { timezone?: string } }).organization
      ?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = dayInZone(new Date(), organizationTimeZone);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({
    from: today,
    to: today,
    status: '',
    staffId: '',
    serviceId: '',
    leaveTypeId: '',
    currency: '',
  });
  const [status, setStatus] = useState('');
  const [staffId, setStaffId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [currency, setCurrency] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bookingPolicy, setBookingPolicy] = useState<BookingPolicy | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const query = new URLSearchParams(
    Object.entries(applied).filter(([, value]) => Boolean(value)),
  ).toString();

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await apiFetch(`${api}${path}`, { credentials: 'include', ...init });
    if (!response.ok)
      throw new Error(getUserFriendlyError(await readApiError(response)));
    return response.json() as Promise<T>;
  }
  useEffect(() => {
    setLoading(true);
    setError('');
    setReport(null);
    const path =
      section === 'Staff detail' ? (staffId ? `/reports/staff/${staffId}` : '') : paths[section];
    const task =
      section === 'Settings'
        ? Promise.all([
            request<Settings>('/settings/organization').then(setSettings),
            request<BookingPolicy>('/settings/booking-policy').then(setBookingPolicy),
          ])
        : path
          ? request<Report>(`${path}?${query}`).then(setReport)
          : Promise.resolve();
    void task.catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false));
  }, [section, applied]);
  function apply() {
    setApplied({ from, to, status, staffId, serviceId, leaveTypeId, currency });
  }
  function preset(kind: 'today' | 'week' | 'month') {
    const end = dayInZone(new Date(), organizationTimeZone);
    const start =
      kind === 'today'
        ? end
        : kind === 'week'
          ? previousDays(end, (new Date(`${end}T00:00:00Z`).getUTCDay() + 6) % 7)
          : `${end.slice(0, 7)}-01`;
    setFrom(start);
    setTo(end);
    setApplied({ from: start, to: end, status, staffId, serviceId, leaveTypeId, currency });
  }
  async function download(name: string) {
    setError('');
    try {
      const response = await apiFetch(`${api}/exports/${name}.csv?${query}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(t('Export failed ({{status}}).', { status: response.status }));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = language() === 'zh' ? `${({ bookings: '预约', payments: '付款', commissions: '佣金', attendance: '考勤', leave: '请假' } as Record<string, string>)[name] ?? name}.csv` : `${name}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setError('');
    setMessage('');
    try {
      const updated = await request<Settings>('/settings/organization', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setMessage('Settings saved. Booking and leave history was not changed.');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function saveBookingPolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bookingPolicy) return;
    setError('');
    setMessage('');
    try {
      const updated = await request<BookingPolicy>('/settings/booking-policy', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bookingPolicy),
      });
      setBookingPolicy(updated);
      setMessage('Booking policy saved. Existing bookings were not changed.');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const rows = report?.rows ?? [];
  const metrics = report ? Object.entries(report).filter(([key, value]) => key !== 'range' && key !== 'rows' && (typeof value === 'number' || Array.isArray(value))) : [];
  const summaryKeys = new Set(['todayBookings', 'activeStaff', 'pendingLeaveRequests', 'recordedPaymentsByCurrency']);
  const metricValue = (value: unknown) => Array.isArray(value) ? value.length ? value.map((item) => display(item)).join(' · ') : t('No data') : display(value);
  return (
    <section className={`panel report-workspace${section === 'Dashboard' ? ' dashboard-page' : ''}`}>
      <h2>{t(section)}</h2>
      {section === 'Dashboard' && <p className="page-description">{t("A focused view of your organization’s current activity.")}</p>}
      {error && (
        <p role="alert" className="error">
          {t(error)}
        </p>
      )}
      {message && <p role="status">{t(message)}</p>}
      {loading && <p>{t("Loading…")}</p>}
      {section !== 'Settings' && (
        <>
          <form
            className="report-filters"
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <label>
              {t("From")}
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                required
              />
            </label>
            <label>
              {t("To")}
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                required
              />
            </label>
            {section === 'Sales' && <label>
              {t("Status")}
              <input
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                placeholder={t("Optional status")}
              />
            </label>}
            {section === 'Staff detail' && <label>
              {t("Staff UUID")}
              <input
                value={staffId}
                onChange={(event) => setStaffId(event.target.value)}
                placeholder={t("Optional staff ID")}
              />
            </label>}
            {section === 'Bookings' && <label>
              {t("Service UUID")}
              <input
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                placeholder={t("Optional service ID")}
              />
            </label>}
            {section === 'Leave' && <label>
              {t("Leave type UUID")}
              <input
                value={leaveTypeId}
                onChange={(event) => setLeaveTypeId(event.target.value)}
                placeholder={t("Optional type ID")}
              />
            </label>}
            {section === 'Sales' && <label>
              {t("Currency")}
              <input
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                placeholder={t("Optional ISO code")}
              />
            </label>}
            <button>{t("Apply filters")}</button>
          </form>
          <div className="inline">
            <button onClick={() => preset('today')}>{t("Today")}</button>
            <button onClick={() => preset('week')}>{t("This week")}</button>
            <button onClick={() => preset('month')}>{t("This month")}</button>
          </div>
          <p>{t("Dates use")} {organizationTimeZone}{t("; the end date is included.")}</p>
          {exports[section] && hasPermission(identity, 'report.export') && (
            <button
              onClick={() => {
                void download(exports[section]!);
              }}
            >
              {t("Export filtered CSV")}
            </button>
          )}
        </>
      )}
      {section === 'Settings' && settings && (
        <>
          <form
            className="stack"
            onSubmit={(event) => {
              void saveSettings(event);
            }}
          >
            <fieldset className="settings-group"><legend>{t("Organization")}</legend>
            <label>
              {t("Organization name")}
              <input
                value={settings.name}
                onChange={(event) => setSettings({ ...settings, name: event.target.value })}
                required
                disabled={!hasPermission(identity, 'organization.settings.manage')}
              />
            </label>
            <label>
              {t("IANA timezone")}
              <input
                value={settings.timezone}
                onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
                required
                disabled={!hasPermission(identity, 'organization.settings.manage')}
              />
            </label>
            <label>
              {t("Default ISO currency")}
              <input
                value={settings.defaultCurrency}
                maxLength={3}
                onChange={(event) =>
                  setSettings({ ...settings, defaultCurrency: event.target.value.toUpperCase() })
                }
                required
                disabled={!hasPermission(identity, 'organization.settings.manage')}
              />
            </label>
            </fieldset>
            <fieldset className="settings-group"><legend>{t("Booking number")}</legend>
            <label>
              {t("Booking number prefix")}
              <input
                value={settings.bookingNumberPrefix}
                maxLength={16}
                pattern="[A-Za-z0-9][A-Za-z0-9-]{0,15}"
                onChange={(event) =>
                  setSettings({ ...settings, bookingNumberPrefix: event.target.value })
                }
                required
                disabled={!hasPermission(identity, 'organization.settings.manage')}
              />
            </label>
            <p>{t("Changing the prefix affects future booking numbers only.")}</p>
            </fieldset>
            {hasPermission(identity, 'organization.settings.manage') && (
              <button>{t("Save organization settings")}</button>
            )}
          </form>
          {bookingPolicy && (
            <form
              className="stack"
              onSubmit={(event) => {
                void saveBookingPolicy(event);
              }}
            >
              <h3>{t("Booking policy")}</h3>
              <label>
                <input
                  type="checkbox"
                  checked={bookingPolicy.customerCancellationEnabled}
                  onChange={(event) =>
                    setBookingPolicy({
                      ...bookingPolicy,
                      customerCancellationEnabled: event.target.checked,
                    })
                  }
                  disabled={!hasPermission(identity, 'organization.settings.manage')}
                />{' '}
                {t("Allow customer cancellation")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={bookingPolicy.customerRescheduleEnabled}
                  onChange={(event) =>
                    setBookingPolicy({
                      ...bookingPolicy,
                      customerRescheduleEnabled: event.target.checked,
                    })
                  }
                  disabled={!hasPermission(identity, 'organization.settings.manage')}
                />{' '}
                {t("Allow customer rescheduling")}
              </label>
              <label>
                {t("Cancellation cutoff minutes (blank means no cutoff)")}
                <input
                  type="number"
                  min="0"
                  value={bookingPolicy.cancellationCutoffMinutes ?? ''}
                  onChange={(event) =>
                    setBookingPolicy({
                      ...bookingPolicy,
                      cancellationCutoffMinutes:
                        event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  disabled={!hasPermission(identity, 'organization.settings.manage')}
                />
              </label>
              <label>
                {t("Reschedule cutoff minutes (blank means no cutoff)")}
                <input
                  type="number"
                  min="0"
                  value={bookingPolicy.rescheduleCutoffMinutes ?? ''}
                  onChange={(event) =>
                    setBookingPolicy({
                      ...bookingPolicy,
                      rescheduleCutoffMinutes:
                        event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  disabled={!hasPermission(identity, 'organization.settings.manage')}
                />
              </label>
              <label>
                {t("Maximum customer reschedules (blank means unlimited)")}
                <input
                  type="number"
                  min="0"
                  value={bookingPolicy.maxCustomerReschedules ?? ''}
                  onChange={(event) =>
                    setBookingPolicy({
                      ...bookingPolicy,
                      maxCustomerReschedules:
                        event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                  disabled={!hasPermission(identity, 'organization.settings.manage')}
                />
              </label>
              {hasPermission(identity, 'organization.settings.manage') && (
                <button>{t("Save booking policy")}</button>
              )}
            </form>
          )}
        </>
      )}
      {report && (
        <>
          {section === 'Staff detail' && (
            <h3>
              {(report.staff as { displayName?: string } | undefined)?.displayName ??
                t('Staff operational detail')}
            </h3>
          )}
          <div className="report-grid">
            {(section === 'Dashboard' ? metrics.filter(([key]) => summaryKeys.has(key)) : metrics)
              .map(([key, value]) => (
                <article className="report-card" key={key}>
                  <h3>{label(key)}</h3>
                  <p>{metricValue(value)}</p>
                </article>
              ))}
          </div>
          {section === 'Dashboard' && metrics.some(([key]) => !summaryKeys.has(key)) && <section className="dashboard-overview"><h3>{t("Operational overview")}</h3><dl>{metrics.filter(([key]) => !summaryKeys.has(key)).map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{metricValue(value)}</dd></div>)}</dl></section>}
          {rows.length ? (
            <div className="report-table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(rows[0]).map((key) => (
                      <th key={key}>{label(key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index}>
                      {Object.keys(rows[0]).map((key) => (
                        <td key={key}>{display(row[key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            section !== 'Dashboard' &&
            section !== 'Staff detail' && <p>{t("No records in this date range.")}</p>
          )}
        </>
      )}
    </section>
  );
}
