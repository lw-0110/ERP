import { apiFetch } from './api-fetch.js';
import { t, locale, translateStatus } from './i18n.js';
import { type FormEvent, useEffect, useState } from 'react';
import { hasPermission, type PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { DataTable, FormDialog, RecordDrawer, RecordField, RecordSection } from './ui.js';
import { formatMoney } from './money.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export type BookingSection = 'profile' | 'book' | 'mine' | 'assigned' | 'admin' | 'resources' | 'hours' | 'schedules';
type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
};
type ResourceType = { id: string; name: string; status?: string };
type Resource = {
  id: string;
  name: string;
  resourceTypeId: string;
  capacity: number;
  status: string;
};
type Staff = { id: string; displayName: string; recommended?: boolean };
type BookingLine = {
  id: string;
  serviceId?: string;
  sortOrder: number;
  durationMinutesSnapshot?: number;
  lineTotalMinor?: number;
  currencySnapshot?: string;
  staffAssignments?: { staffId: string; status?: string; staff?: { displayName: string } }[];
  resourceAssignments?: { resourceId: string; status?: string }[];
};
type Booking = {
  id: string;
  bookingNumber: string;
  startDateTime: string;
  endDateTime: string;
  status: string;
  paymentStatus: string;
  customer?: { displayName: string; phone?: string; email?: string };
  customerNote?: string | null;
  internalNote?: string | null;
  services: BookingLine[];
};
type Hour = {
  dayOfWeek: number;
  openTime?: string;
  closeTime?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
};
type Eligibility = {
  cancel: { allowed: boolean; reason: string | null };
  reschedule: {
    allowed: boolean;
    reason: string | null;
    customerRescheduleCount: number;
    maxCustomerReschedules: number | null;
  };
};
type PaymentSummary = {
  totalsByCurrency: { currency: string; bookedMinor: number; paidMinor: number }[];
};
const activeStaffAssignments = (line: BookingLine) => (line.staffAssignments ?? []).filter((assignment) => !assignment.status || assignment.status === 'ACTIVE');
const assignedStaffSelections = (booking: Booking) => Object.fromEntries(booking.services.map((line) => [line.id, activeStaffAssignments(line)[0]?.staffId ?? '']));

async function request(path: string, init?: RequestInit) {
  const response = await apiFetch(`${api}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
  return response.json();
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function BookingWorkspace({ identity, section }: { identity: PermissionContext; section: BookingSection }) {
  const [services, setServices] = useState<Service[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking>();
  const [eligibility, setEligibility] = useState<Eligibility>();
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary>();
  const [eligibleStaff, setEligibleStaff] = useState<Record<string, Staff[]>>({});
  const [staffSelections, setStaffSelections] = useState<Record<string, string>>({});
  const [staffAssignmentBusy, setStaffAssignmentBusy] = useState<string | null>(null);
  const [unassignLineId, setUnassignLineId] = useState<string | null>(null);
  const [bookingAction, setBookingAction] = useState<{ kind: 'cancel' | 'reschedule' | 'status' | 'staff' | 'resource'; lineId?: string } | null>(null);
  const [eligibleResources, setEligibleResources] = useState<Record<string, Resource[]>>({});
  const [profile, setProfile] = useState<{ firstName: string; lastName: string; phone: string }>();
  const [hours, setHours] = useState<Hour[]>([]);
  const [schedule, setSchedule] = useState<Hour[]>([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedResource, setSelectedResource] = useState<Resource>();
  const [resourceEditing, setResourceEditing] = useState<Resource | null>();
  const [resourceTypeEditing, setResourceTypeEditing] = useState<ResourceType | null>();
  const [selectedResourceType, setSelectedResourceType] = useState<ResourceType>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      if (section === 'profile' || section === 'book') {
        try {
          setProfile(await request('/customers/me'));
        } catch {
          setProfile(undefined);
        }
      }
      if (section === 'book') setServices((await request('/services')).items);
      if (['mine', 'assigned', 'admin'].includes(section) && hasPermission(identity, 'service.read')) setServices((await request('/services?pageSize=100')).items);
      if (section === 'mine' || section === 'assigned' || section === 'admin')
        setBookings(await request(section === 'mine' ? '/bookings/my' : section === 'assigned' ? '/bookings/assigned' : '/bookings'));
      if (section === 'resources' || section === 'admin') {
        setResources(await request('/resources'));
        setResourceTypes(await request('/resource-types'));
      }
      if (section === 'hours') setHours(await request('/opening-hours'));
      if (section === 'schedules' || section === 'admin') setStaff((await request('/staff')).items);
      if (section === 'schedules' && selectedStaff)
        setSchedule(await request(`/staff/${selectedStaff}/schedule`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load data.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [section, selectedStaff]);
  async function submit(event: FormEvent<HTMLFormElement>, action: () => Promise<unknown>, onSuccess?: () => void) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await action();
      const warnings =
        result && typeof result === 'object' && 'warnings' in result ? result.warnings : undefined;
      setMessage(Array.isArray(warnings) && warnings.length ? warnings.join(' ') : 'Saved.');
      await load();
      onSuccess?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save.');
    }
  }
  const form = (event: FormEvent<HTMLFormElement>) => new FormData(event.currentTarget);
  async function selectBooking(booking: Booking) {
    setBookingAction(null);
    setUnassignLineId(null);
    setSelectedBooking(booking);
    setStaffSelections(assignedStaffSelections(booking));
    setEligibility(undefined);
    setPaymentSummary(undefined);
    if (section === 'mine') {
      try {
        const [actions, payments] = await Promise.all([
          request(`/bookings/my/${booking.id}/eligibility`),
          hasPermission(identity, 'payment.read.own')
            ? request(`/bookings/my/${booking.id}/payment-summary`)
            : Promise.resolve(undefined),
        ]);
        setEligibility(actions);
        setPaymentSummary(payments);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load booking actions.');
      }
      return;
    }
    if (section !== 'admin') return;
    try {
      const staffPairs = hasPermission(identity, 'booking.assign_staff')
        ? await Promise.all(
            booking.services.map(
              async (line) =>
                [
                  line.id,
                  await request(`/bookings/${booking.id}/services/${line.id}/eligible-staff`),
                ] as const,
            ),
          )
        : [];
      const resourcePairs = hasPermission(identity, 'booking.assign_resource')
        ? await Promise.all(
            booking.services.map(
              async (line) =>
                [
                  line.id,
                  await request(`/bookings/${booking.id}/services/${line.id}/eligible-resources`),
                ] as const,
            ),
          )
        : [];
      setEligibleStaff(Object.fromEntries(staffPairs));
      setEligibleResources(Object.fromEntries(resourcePairs));
      if (hasPermission(identity, 'payment.read.all'))
        setPaymentSummary(await request(`/bookings/${booking.id}/payment-summary`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load assignment options.');
    }
  }
  async function changeStaffAssignment(line: BookingLine, ids: string[], action: 'assign' | 'change' | 'unassign') {
    if (!selectedBooking || staffAssignmentBusy) return;
    const bookingId = selectedBooking.id;
    setStaffAssignmentBusy(line.id);
    setError(''); setMessage('');
    let saved = false;
    try {
      const result = await request(`/bookings/${bookingId}/services/${line.id}/staff`, json('PUT', { ids })) as { warnings?: string[] };
      saved = true;
      const [detail, list] = await Promise.all([request(`/bookings/${bookingId}`), request('/bookings')]) as [Booking, Booking[]];
      setBookings(list);
      setSelectedBooking(detail);
      setStaffSelections(assignedStaffSelections(detail));
      setBookingAction(null);
      const base = action === 'unassign' ? 'Staff unassigned successfully.' : action === 'change' ? 'Staff assignment updated successfully.' : 'Staff assigned successfully.';
      setMessage([base, ...(result.warnings ?? [])].join(' '));
    } catch (cause) {
      setError(saved ? 'Staff assignment was saved, but the booking detail could not refresh. Reload the page to see the latest assignment.' : cause instanceof Error ? cause.message : 'Unable to assign staff.');
    } finally { setStaffAssignmentBusy(null); }
  }
  function assignedStaffName(line: BookingLine, staffId: string) {
    return activeStaffAssignments(line).find((assignment) => assignment.staffId === staffId)?.staff?.displayName
      ?? eligibleStaff[line.id]?.find((person) => person.id === staffId)?.displayName
      ?? staff.find((person) => person.id === staffId)?.displayName
      ?? `Staff ${staffId}`;
  }
  async function performBookingAction(path: string, init: RequestInit) {
    if (!selectedBooking) return;
    setError(''); setMessage('');
    try {
      await request(path, init);
      const detailPath = section === 'mine' ? `/bookings/my/${selectedBooking.id}` : `/bookings/${selectedBooking.id}`;
      const listPath = section === 'mine' ? '/bookings/my' : '/bookings';
      const [detail, list] = await Promise.all([request(detailPath), request(listPath)]) as [Booking, Booking[]];
      setSelectedBooking(detail); setBookings(list); setStaffSelections(assignedStaffSelections(detail));
      setBookingAction(null); setMessage('Saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save.'); }
  }
  const actionLine = selectedBooking?.services.find((line) => line.id === bookingAction?.lineId);
  const showMoreBookingActions = Boolean(selectedBooking && (
    (section === 'admin' && ((hasPermission(identity, 'booking.status.update') && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(selectedBooking.status)) || (selectedBooking.status === 'CONFIRMED' && (hasPermission(identity, 'booking.reschedule.all') || hasPermission(identity, 'booking.cancel.all'))))) ||
    (section === 'mine' && selectedBooking.status === 'CONFIRMED' && ((eligibility?.reschedule.allowed && hasPermission(identity, 'booking.reschedule.own')) || (eligibility?.cancel.allowed && hasPermission(identity, 'booking.cancel.own'))))
  ));
  return (
    <section className="panel">
      {error && (
        <p role="alert" className="error">
          {t(error)}
        </p>
      )}
      {message && <p role="status">{t(message)}</p>}
      {loading && <p>{t("Loading…")}</p>}
      {section === 'profile' && (
        <>
          <h2>{t("My customer profile")}</h2>
          {hasPermission(identity, 'customer.update.own') && <form
            key={profile ? `${profile.firstName}-${profile.lastName}-${profile.phone}` : 'empty-profile'}
            className="stack"
            onSubmit={(event) => {
              const data = form(event);
              void submit(event, () =>
                request(
                  '/customers/me',
                  json('POST', {
                    firstName: data.get('firstName'),
                    lastName: data.get('lastName'),
                    phone: data.get('phone'),
                  }),
                ),
              );
            }}
          >
            <label>{t("First name")}<input
              name="firstName"
              defaultValue={profile?.firstName}
              required
            /></label>
            <label>{t("Last name")}<input
              name="lastName"
              defaultValue={profile?.lastName}
              required
            /></label>
            <label>{t("Phone")}<input name="phone" defaultValue={profile?.phone} required /></label>
            <button>{t("Complete profile")}</button>
          </form>}
        </>
      )}
      {section === 'book' && (
        <>
          <h2>{t("Book appointment")}</h2>
          {!profile ? (
            <p>{t("Complete your customer profile before booking.")}</p>
          ) : (
            <form
              className="stack"
              onSubmit={(event) => {
                const data = form(event);
                void submit(event, async () => {
                  const body = {
                    startDateTime: new Date(String(data.get('start'))).toISOString(),
                    services: data
                      .getAll('serviceIds')
                      .map((serviceId) => ({ serviceId, quantity: 1 })),
                  };
                  const check = await request('/availability/check', json('POST', body));
                  if (!check.available) throw new Error('This time is unavailable.');
                  await request('/bookings', json('POST', body));
                });
              }}
            >
              <label>
                {t("Choose services (executed in the order shown)")}
                <select name="serviceIds" multiple required>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} · {service.durationMinutes} {t("min ·")} {service.priceMinor}{' '}
                      {service.currency} {t("minor units")}
                    </option>
                  ))}
                </select>
              </label>
              <label>{t("Start time")}<input type="datetime-local" name="start" required /></label>
              <button>{t("Check and book")}</button>
            </form>
          )}
        </>
      )}
      {(section === 'mine' || section === 'assigned' || section === 'admin') && (
        <>
          <h2>{section === 'mine' ? t('My bookings') : section === 'assigned' ? t('Assigned work') : t('Bookings')}</h2>
          <DataTable rows={bookings} loading={loading} selectedId={selectedBooking?.id} onSelect={(booking) => { void selectBooking(booking); }} mobileSummary={(booking, index) => <><small>#{index + 1}</small><strong>{booking.customer?.displayName ?? t('Booking')}</strong><span>{new Date(booking.startDateTime).toLocaleString(locale())}</span><small>{booking.services.map((line) => services.find((service) => service.id === line.serviceId)?.name ?? `Service ${line.sortOrder + 1}`).join(', ')}</small><span>{translateStatus(booking.status)} · {translateStatus(booking.paymentStatus)}</span><small>{t("Staff:")} {booking.services.flatMap((line) => activeStaffAssignments(line).map((assignment) => assignment.staff?.displayName ?? staff.find((person) => person.id === assignment.staffId)?.displayName ?? t('Assigned'))).join(', ') || t('Not assigned')}</small></>} empty={t("No bookings yet.")} columns={[{ label: 'No.', render: (booking) => bookings.findIndex((row) => row.id === booking.id) + 1 }, { label: 'Customer', render: (booking) => booking.customer?.displayName ?? '—' }, { label: 'Phone', render: (booking) => booking.customer?.phone ?? '—' }, { label: 'Date', render: (booking) => new Date(booking.startDateTime).toLocaleDateString(locale()) }, { label: 'Time', render: (booking) => new Date(booking.startDateTime).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }, { label: 'Status', render: (booking) => booking.status }, { label: 'Payment', render: (booking) => booking.paymentStatus }, { label: 'Assigned Staff', render: (booking) => booking.services.flatMap((line) => activeStaffAssignments(line).map((assignment) => assignment.staff?.displayName ?? staff.find((person) => person.id === assignment.staffId)?.displayName ?? t('Assigned'))).join(', ') || '—' }]} />
          {selectedBooking && (
            <RecordDrawer title={t("Booking Details")} open={Boolean(selectedBooking)} onClose={() => setSelectedBooking(undefined)} actions={<>
              {section === 'admin' && selectedBooking.services.map((line) => <div key={line.id} className="record-action-pair">{hasPermission(identity, 'booking.assign_staff') && ['CONFIRMED', 'IN_PROGRESS'].includes(selectedBooking.status) && <button type="button" onClick={() => setBookingAction({ kind: 'staff', lineId: line.id })}>{t("Assign Staff")}{selectedBooking.services.length > 1 ? ` · ${line.sortOrder + 1}` : ''}</button>}{hasPermission(identity, 'booking.assign_resource') && ['CONFIRMED', 'IN_PROGRESS'].includes(selectedBooking.status) && <button type="button" className="secondary" onClick={() => setBookingAction({ kind: 'resource', lineId: line.id })}>{t("Assign Resource")}{selectedBooking.services.length > 1 ? ` · ${line.sortOrder + 1}` : ''}</button>}{hasPermission(identity, 'booking.assign_staff') && activeStaffAssignments(line).length > 0 && ['CONFIRMED', 'IN_PROGRESS'].includes(selectedBooking.status) && <button type="button" className="secondary" onClick={() => setUnassignLineId(line.id)}>{t("Unassign Staff")}</button>}</div>)}
              {showMoreBookingActions && <details className="record-action-more"><summary>{t("More actions")}</summary><div>
              {section === 'admin' && hasPermission(identity, 'booking.status.update') && ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(selectedBooking.status) && <button type="button" className="secondary" onClick={() => setBookingAction({ kind: 'status' })}>{t("Update Status")}</button>}
              {((section === 'mine' && selectedBooking.status === 'CONFIRMED' && eligibility?.reschedule.allowed && hasPermission(identity, 'booking.reschedule.own')) || (section === 'admin' && selectedBooking.status === 'CONFIRMED' && hasPermission(identity, 'booking.reschedule.all'))) && <button type="button" className="secondary" onClick={() => setBookingAction({ kind: 'reschedule' })}>{t("Reschedule")}</button>}
              {((section === 'mine' && selectedBooking.status === 'CONFIRMED' && eligibility?.cancel.allowed && hasPermission(identity, 'booking.cancel.own')) || (section === 'admin' && selectedBooking.status === 'CONFIRMED' && hasPermission(identity, 'booking.cancel.all'))) && <button type="button" className="secondary" onClick={() => setBookingAction({ kind: 'cancel' })}>{t("Cancel Booking")}</button>}
              </div></details>}
            </>}>
              {error && <p role="alert" className="error">{t(error)}</p>}{message && <p role="status">{t(message)}</p>}
              <RecordSection title={t("Customer")}><RecordField label={t("Name")}>{selectedBooking.customer?.displayName ?? (profile ? `${profile.firstName} ${profile.lastName}` : '—')}</RecordField>{selectedBooking.customer?.phone && <RecordField label={t("Phone")}>{selectedBooking.customer.phone}</RecordField>}{selectedBooking.customer?.email && <RecordField label={t("Email")}>{selectedBooking.customer.email}</RecordField>}</RecordSection>
              <RecordSection title={t("Schedule")}><RecordField label={t("Date")}>{new Date(selectedBooking.startDateTime).toLocaleDateString(locale())}</RecordField><RecordField label={t("Time")}>{new Date(selectedBooking.startDateTime).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })} – {new Date(selectedBooking.endDateTime).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</RecordField></RecordSection>
              <RecordSection title={t("Booking")}><RecordField label={t("Status")}>{translateStatus(selectedBooking.status)}</RecordField><RecordField label={t("Payment")}>{translateStatus(selectedBooking.paymentStatus)}</RecordField>{selectedBooking.customerNote && <RecordField label={t("Customer note")}>{selectedBooking.customerNote}</RecordField>}{selectedBooking.internalNote && <RecordField label={t("Internal note")}>{selectedBooking.internalNote}</RecordField>}</RecordSection>
              <RecordSection title={t("Services & Assignments")}>{selectedBooking.services.map((line) => <div key={line.id}><h4>{services.find((service) => service.id === line.serviceId)?.name ?? `Service ${line.sortOrder + 1}`}</h4>{line.durationMinutesSnapshot && <RecordField label={t("Duration")}>{line.durationMinutesSnapshot} {t("min")}</RecordField>}{line.lineTotalMinor != null && <RecordField label={t("Price")}>{formatMoney(line.lineTotalMinor, line.currencySnapshot ?? 'MYR')}</RecordField>}<RecordField label={t("Assigned Staff")}>{activeStaffAssignments(line).map((assignment) => assignedStaffName(line, assignment.staffId)).join(', ') || t('Not assigned')}</RecordField><RecordField label={t("Resource")}>{(line.resourceAssignments ?? []).filter((assignment) => !assignment.status || assignment.status === 'ACTIVE').map((assignment) => resources.find((resource) => resource.id === assignment.resourceId)?.name ?? t('Assigned resource')).join(', ') || t('Not assigned')}</RecordField></div>)}</RecordSection>
              {paymentSummary?.totalsByCurrency.length ? <RecordSection title={t("Payment summary")}><ul>{paymentSummary.totalsByCurrency.map((total) => <li key={total.currency}>{total.currency}{t(": booked")} {total.bookedMinor} {t("minor units; recorded payments")} {total.paidMinor} {t("minor units")}</li>)}</ul></RecordSection> : null}
              <FormDialog title={bookingAction?.kind === 'staff' ? t('Assign Staff') : bookingAction?.kind === 'resource' ? t('Assign Resource') : bookingAction?.kind === 'status' ? t('Update Status') : bookingAction?.kind === 'reschedule' ? t('Reschedule Booking') : t('Cancel Booking')} open={Boolean(bookingAction)} onClose={() => setBookingAction(null)}>
              {error && <p role="alert" className="error">{t(error)}</p>}
              {section === 'mine' && eligibility && (
                <div className="stack">
                  {bookingAction?.kind === 'cancel' && !eligibility.cancel.allowed && (
                    <p>{t("Cancellation unavailable:")} {eligibility.cancel.reason}.</p>
                  )}
                  {bookingAction?.kind === 'cancel' && eligibility.cancel.allowed && hasPermission(identity, 'booking.cancel.own') && (
                    <form
                      className="inline"
                      onSubmit={(event) => {
                        if (!window.confirm(t('Cancel this booking? This does not issue a refund.'))) {
                          event.preventDefault();
                          return;
                        }
                        const data = form(event);
                        event.preventDefault();
                        void performBookingAction(`/bookings/${selectedBooking.id}/cancel`, json('PATCH', { reason: data.get('reason') || undefined }));
                      }}
                    >
                      <input name="reason" maxLength={1000} placeholder={t("Optional reason")} />
                      <button>{t("Cancel booking")}</button>
                    </form>
                  )}
                  {bookingAction?.kind === 'reschedule' && !eligibility.reschedule.allowed && (
                    <p>{t("Rescheduling unavailable:")} {eligibility.reschedule.reason}.</p>
                  )}
                  {bookingAction?.kind === 'reschedule' && eligibility.reschedule.allowed &&
                    hasPermission(identity, 'booking.reschedule.own') && (
                      <form
                        className="stack"
                        onSubmit={(event) => {
                          const data = form(event);
                          if (!window.confirm(t('Move this booking to the selected time?'))) {
                            event.preventDefault();
                            return;
                          }
                          event.preventDefault();
                          void performBookingAction(`/bookings/${selectedBooking.id}/reschedule`, json('PATCH', { newStartDateTime: new Date(String(data.get('newStartDateTime'))).toISOString(), reason: data.get('reason') || undefined }));
                        }}
                      >
                        <input name="newStartDateTime" type="datetime-local" required />
                        <input name="reason" maxLength={1000} placeholder={t("Optional reason")} />
                        <button>{t("Check availability and reschedule")}</button>
                      </form>
                    )}
                </div>
              )}
              {section === 'admin' && (
                <>
                  {bookingAction?.kind === 'cancel' && selectedBooking.status === 'CONFIRMED' &&
                    hasPermission(identity, 'booking.cancel.all') && (
                      <form
                        className="inline"
                        onSubmit={(event) => {
                          const data = form(event);
                          if (
                            !window.confirm(
                              ['PARTIALLY_PAID', 'PAID'].includes(selectedBooking.paymentStatus)
                                ? t('This booking has recorded payment status. Cancel without an automatic refund?')
                                : t('Cancel this booking?'),
                            )
                          ) {
                            event.preventDefault();
                            return;
                          }
                          event.preventDefault();
                          void performBookingAction(`/admin/bookings/${selectedBooking.id}/cancel`, json('PATCH', { reason: data.get('reason') || undefined }));
                        }}
                      >
                        <input name="reason" maxLength={1000} placeholder={t("Optional note")} />
                        <button>{t("Cancel booking")}</button>
                      </form>
                    )}
                  {bookingAction?.kind === 'reschedule' && selectedBooking.status === 'CONFIRMED' &&
                    hasPermission(identity, 'booking.reschedule.all') && (
                      <form
                        className="stack"
                        onSubmit={(event) => {
                          const data = form(event);
                          event.preventDefault();
                          void performBookingAction(`/admin/bookings/${selectedBooking.id}/reschedule`, json('PATCH', { newStartDateTime: new Date(String(data.get('newStartDateTime'))).toISOString(), reason: data.get('reason') || undefined }));
                        }}
                      >
                        <input name="newStartDateTime" type="datetime-local" required />
                        <input name="reason" maxLength={1000} placeholder={t("Optional note")} />
                        <button>{t("Check capacity and reschedule")}</button>
                      </form>
                    )}
                  {bookingAction?.kind === 'status' && hasPermission(identity, 'booking.status.update') &&
                    ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(selectedBooking.status) && (
                      <form
                        className="inline"
                        onSubmit={(event) => {
                          const data = form(event);
                          event.preventDefault();
                          void performBookingAction(`/bookings/${selectedBooking.id}/status`, json('PATCH', { status: data.get('status') }));
                        }}
                      >
                        <select name="status" defaultValue={selectedBooking.status}>
                          {(selectedBooking.status === 'CONFIRMED'
                            ? ['CHECKED_IN', 'NO_SHOW']
                            : selectedBooking.status === 'CHECKED_IN'
                              ? ['IN_PROGRESS']
                              : ['COMPLETED']
                          ).map((status) => (
                            <option key={status} value={status}>{translateStatus(status)}</option>
                          ))}
                        </select>
                        <button>{t("Update status")}</button>
                      </form>
                    )}
                  {selectedBooking.services.filter((line) => line.id === actionLine?.id).map((line) => (
                    <div key={line.id}>
                      <h4>{t("Service")} {line.sortOrder + 1}</h4>
                      {bookingAction?.kind === 'staff' && hasPermission(identity, 'booking.assign_staff') && (
                        <div className="staff-assignment-control">
                          <p><strong>{t("Current Staff")}</strong><br />{activeStaffAssignments(line).length ? activeStaffAssignments(line).map((assignment) => assignedStaffName(line, assignment.staffId)).join(', ') : t('Not assigned')}</p>
                          <form className="inline" onSubmit={(event) => { event.preventDefault(); const staffId = staffSelections[line.id] ?? ''; if (staffId) void changeStaffAssignment(line, [staffId], activeStaffAssignments(line).length ? 'change' : 'assign'); }}>
                          <label>{t("Choose staff")}<select name="staffId" value={staffSelections[line.id] ?? ''} onChange={(event) => setStaffSelections((current) => ({ ...current, [line.id]: event.target.value }))}>
                            <option value="">{t("Select staff")}</option>
                            {activeStaffAssignments(line).filter((assignment) => !(eligibleStaff[line.id] ?? []).some((person) => person.id === assignment.staffId)).map((assignment) => <option key={assignment.staffId} value={assignment.staffId}>{assignedStaffName(line, assignment.staffId)}</option>)}
                            {(eligibleStaff[line.id] ?? []).map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.displayName}
                                {person.recommended ? ' · recommended' : ' · skill warning'}
                              </option>
                            ))}
                          </select></label>
                          <button disabled={Boolean(staffAssignmentBusy) || !staffSelections[line.id] || activeStaffAssignments(line).some((assignment) => assignment.staffId === staffSelections[line.id])}>{staffAssignmentBusy === line.id ? t('Assigning…') : t('Assign staff')}</button>
                          </form>
                        </div>
                      )}
                      {bookingAction?.kind === 'resource' && hasPermission(identity, 'booking.assign_resource') && (
                        <form
                          className="inline"
                          onSubmit={(event) => {
                            const data = form(event);
                            event.preventDefault();
                            void performBookingAction(`/bookings/${selectedBooking.id}/services/${line.id}/resources`, json('PUT', { ids: data.get('resourceId') ? [data.get('resourceId')] : [] }));
                          }}
                        >
                          <select name="resourceId">
                            <option value="">{t("Unassigned")}</option>
                            {(eligibleResources[line.id] ?? []).map((resource) => (
                              <option key={resource.id} value={resource.id}>
                                {resource.name}
                              </option>
                            ))}
                          </select>
                          <button>{t("Assign resource")}</button>
                        </form>
                      )}
                    </div>
                  ))}
                </>
              )}
              </FormDialog>
            </RecordDrawer>
          )}
          <FormDialog title={t("Unassign Staff")} open={Boolean(unassignLineId)} onClose={() => setUnassignLineId(null)}>
            {selectedBooking?.services.filter((line) => line.id === unassignLineId).map((line) => <div key={line.id} className="stack">
              <p>{t("Remove")} {activeStaffAssignments(line).map((assignment) => assignedStaffName(line, assignment.staffId)).join(', ')} {t("from this booking?")}</p>
              <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setUnassignLineId(null)}>{t("Cancel")}</button><button type="button" disabled={Boolean(staffAssignmentBusy)} onClick={() => { setUnassignLineId(null); void changeStaffAssignment(line, [], 'unassign'); }}>{t("Unassign")}</button></div>
            </div>)}
          </FormDialog>
        </>
      )}
      {section === 'resources' && (
        <>
          <div className="page-header"><h2>{t("Resources")}</h2><div className="page-actions">{hasPermission(identity, 'resource.type.manage') && <button type="button" className="secondary" onClick={() => setResourceTypeEditing(null)}>{t("New resource type")}</button>}{hasPermission(identity, 'resource.create') && <button type="button" onClick={() => setResourceEditing(null)}>{t("New resource")}</button>}</div></div>
          <DataTable rows={resources} loading={loading} selectedId={selectedResource?.id} onSelect={setSelectedResource} mobileSummary={(resource) => <><strong>{resource.name}</strong><span>{t("Capacity")} {resource.capacity}</span><small>{translateStatus(resource.status)}</small></>} empty={t("No resources yet.")} columns={[{ label: 'Resource', render: (resource) => resource.name }, { label: 'Capacity', render: (resource) => resource.capacity }, { label: 'Status', render: (resource) => resource.status }]} />
          <RecordDrawer title={t("Resource Details")} open={Boolean(selectedResource)} onClose={() => setSelectedResource(undefined)} actions={selectedResource && <>{hasPermission(identity, 'resource.update') && <button type="button" onClick={() => setResourceEditing(selectedResource)}>{t("Edit")}</button>}{selectedResource.status === 'ACTIVE' && hasPermission(identity, 'resource.disable') && <button type="button" className="secondary" onClick={() => { if (!window.confirm(t('Archive {{name}}? Historical records will remain available.', { name: selectedResource.name }))) return; void request(`/resources/${selectedResource.id}/status`, json('PATCH', {})).then(() => { setSelectedResource(undefined); void load(); }).catch((cause: Error) => setError(cause.message)); }}>{t("Archive resource")}</button>}</>}>{selectedResource && <RecordSection title={t("Resource")}><RecordField label={t("Name")}>{selectedResource.name}</RecordField><RecordField label={t("Type")}>{resourceTypes.find((type) => type.id === selectedResource.resourceTypeId)?.name ?? '—'}</RecordField><RecordField label={t("Capacity")}>{selectedResource.capacity}</RecordField><RecordField label={t("Status")}>{translateStatus(selectedResource.status)}</RecordField></RecordSection>}</RecordDrawer>
          <h3>{t("Resource Types")}</h3><DataTable rows={resourceTypes} selectedId={selectedResourceType?.id} onSelect={setSelectedResourceType} mobileSummary={(type) => <strong>{type.name}</strong>} empty={t("No resource types yet.")} columns={[{ label: 'Name', render: (type) => type.name }]} />
          <RecordDrawer title={t("Resource Type Details")} open={Boolean(selectedResourceType)} onClose={() => setSelectedResourceType(undefined)} actions={selectedResourceType && hasPermission(identity, 'resource.type.manage') && <><button type="button" onClick={() => setResourceTypeEditing(selectedResourceType)}>{t("Edit")}</button>{selectedResourceType.status === 'ACTIVE' && <button type="button" className="secondary" onClick={() => { if (!window.confirm(t('Deactivate {{name}}? Historical records will remain available.', { name: selectedResourceType.name }))) return; void request(`/resource-types/${selectedResourceType.id}/status`, json('PATCH', { status: 'INACTIVE' })).then(() => { setSelectedResourceType(undefined); void load(); }).catch((cause: Error) => setError(cause.message)); }}>{t("Deactivate")}</button>}</>}>{selectedResourceType && <RecordSection title={t("Resource type")}><RecordField label={t("Name")}>{selectedResourceType.name}</RecordField><RecordField label={t("Status")}>{translateStatus(selectedResourceType.status)}</RecordField></RecordSection>}</RecordDrawer>
          <FormDialog title={resourceTypeEditing ? t('Edit Resource Type') : 'New Resource Type'} open={resourceTypeEditing !== undefined} onClose={() => setResourceTypeEditing(undefined)}><form key={resourceTypeEditing?.id ?? 'new'} className="stack" onSubmit={(event) => { const data = form(event); void submit(event, () => request(resourceTypeEditing ? `/resource-types/${resourceTypeEditing.id}` : '/resource-types', json(resourceTypeEditing ? 'PATCH' : 'POST', { name: data.get('name') })).then((result: ResourceType) => { setSelectedResourceType(result); return result; }), () => setResourceTypeEditing(undefined)); }}><label>{t("Name")}<input name="name" defaultValue={resourceTypeEditing?.name ?? ''} required /></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setResourceTypeEditing(undefined)}>{t("Cancel")}</button><button>{t("Save type")}</button></div></form></FormDialog>
          {(hasPermission(identity, 'resource.create') || hasPermission(identity, 'resource.update')) && <FormDialog title={t('{{action}} resource', { action: t(resourceEditing ? 'Edit' : 'New') })} open={resourceEditing !== undefined} onClose={() => setResourceEditing(undefined)}>
            <form
              key={resourceEditing?.id ?? 'new'}
              className="stack"
              onSubmit={(event) => {
                const data = form(event);
                void submit(event, () =>
                  request(
                    resourceEditing ? `/resources/${resourceEditing.id}` : '/resources',
                    json(resourceEditing ? 'PATCH' : 'POST', {
                      name: data.get('name'),
                      resourceTypeId: data.get('resourceTypeId'),
                      capacity: Number(data.get('capacity')),
                    }),
                  ).then((result: Resource) => { setSelectedResource(result); return result; }), () => setResourceEditing(undefined),
                );
              }}
            >
              <label>{t("Resource name")}<input
                name="name"
                placeholder={t("Name")}
                defaultValue={resourceEditing?.name}
                required
              /></label>
              <label>{t("Resource type")}<select name="resourceTypeId" defaultValue={resourceEditing?.resourceTypeId}>
                {resourceTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select></label>
              <label>{t("Capacity")}<input
                name="capacity"
                type="number"
                min="1"
                defaultValue={resourceEditing?.capacity ?? 1}
                required
              /></label>
              <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setResourceEditing(undefined)}>{t("Cancel")}</button><button>{t("Save resource")}</button></div>
            </form>
          </FormDialog>}
        </>
      )}
      {section === 'hours' && (
        <>
          <h2>{t("Organization opening hours")}</h2>
          {hours.length ? (
            <ul>
              {hours.map((hour) => (
                <li key={hour.dayOfWeek}>
                  {t(weekday[hour.dayOfWeek])}: {hour.openTime}–{hour.closeTime} ({translateStatus(hour.status)}){' '}
                  {hasPermission(identity, 'organization.settings.manage') && <button
                    onClick={() => {
                      void request(`/opening-hours/${hour.dayOfWeek}/disable`, json('PATCH', {}))
                        .then(() => load())
                        .catch((cause: Error) => setError(cause.message));
                    }}
                  >
                    {t("Disable")}
                  </button>}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("No opening hours configured.")}</p>
          )}
          {hasPermission(identity, 'organization.settings.manage') && <form
            className="inline"
            onSubmit={(event) => {
              const data = form(event);
              void submit(event, () =>
                request(
                  '/opening-hours',
                  json('PUT', {
                    dayOfWeek: Number(data.get('day')),
                    openTime: data.get('open'),
                    closeTime: data.get('close'),
                  }),
                ),
              );
            }}
          >
            <select name="day">
              {weekday.map((day, index) => (
                <option key={day} value={index}>
                  {t(day)}
                </option>
              ))}
            </select>
            <input name="open" type="time" required />
            <input name="close" type="time" required />
            <button>{t("Save hours")}</button>
          </form>}
        </>
      )}
      {section === 'schedules' && (
        <>
          <h2>{t("Staff working schedules")}</h2>
          <select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)}>
            <option value="">{t("Select staff")}</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
          {selectedStaff && (
            <>
              {schedule.length ? (
                <ul>
                  {schedule.map((hour) => (
                    <li key={hour.dayOfWeek}>
                      {t(weekday[hour.dayOfWeek])}: {hour.startTime}–{hour.endTime} ({translateStatus(hour.status)}){' '}
                      {hasPermission(identity, 'staff.schedule.manage') && <button
                        onClick={() => {
                          void request(
                            `/staff/${selectedStaff}/schedule/${hour.dayOfWeek}/disable`,
                            json('PATCH', {}),
                          )
                            .then(() => load())
                            .catch((cause: Error) => setError(cause.message));
                        }}
                      >
                        {t("Disable")}
                      </button>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("No schedule configured.")}</p>
              )}
              {hasPermission(identity, 'staff.schedule.manage') && <form
                className="inline"
                onSubmit={(event) => {
                  const data = form(event);
                  void submit(event, () =>
                    request(
                      `/staff/${selectedStaff}/schedule`,
                      json('PUT', {
                        dayOfWeek: Number(data.get('day')),
                        startTime: data.get('start'),
                        endTime: data.get('end'),
                      }),
                    ),
                  );
                }}
              >
                <select name="day">
                  {weekday.map((day, index) => (
                    <option key={day} value={index}>
                      {t(day)}
                    </option>
                  ))}
                </select>
                <input name="start" type="time" required />
                <input name="end" type="time" required />
                <button>{t("Save schedule")}</button>
              </form>}
            </>
          )}
        </>
      )}
    </section>
  );
}
