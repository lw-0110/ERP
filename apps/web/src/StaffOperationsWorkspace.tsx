import { useEffect, useState } from 'react';
import { hasPermission, type PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { DataTable, FormDialog, RecordDrawer, RecordField, RecordSection } from './ui.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export type StaffSection = 'my-attendance' | 'my-leave' | 'attendance' | 'leave-review' | 'leave-types';
type Attendance = { id: string; workDate: string; clockInAt: string; clockOutAt: string | null; status: string; staff?: { displayName: string } };
type LeaveType = { id: string; name: string; status: string };
type Leave = { id: string; status: string; startDateTime: string; endDateTime: string; reason: string | null; adminNote: string | null; leaveType?: { name: string }; staff?: { displayName: string }; conflicts?: { bookingNumber: string }[] };
const date = (value: string) => new Date(value).toLocaleString();

export function StaffOperationsWorkspace({ identity, section }: { identity: PermissionContext; section: StaffSection }) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attendanceFilter, setAttendanceFilter] = useState('');
  const [selectedAttendance, setSelectedAttendance] = useState<Attendance | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaveFormOpen, setLeaveFormOpen] = useState(false);
  const [leaveTypeFormOpen, setLeaveTypeFormOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<LeaveType | null>(null);
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${api}${path}`, { credentials: 'include', ...init });
    if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
    return response.json() as Promise<T>;
  }
  const json = (method: string, body: object): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  async function load() {
    setLoading(true); setError('');
    try {
      if (section === 'my-attendance') setAttendance(await request<Attendance[]>('/attendance/my'));
      if (section === 'attendance') setAttendance(await request<Attendance[]>('/attendance'));
      if (section === 'my-leave') { const next = await request<Leave[]>('/leave-requests/my'); setLeaves(next); setSelectedLeave((previous) => next.find((row) => row.id === previous?.id) ?? null); setTypes(await request<LeaveType[]>('/leave-types')); }
      if (section === 'leave-review') { const next = await request<Leave[]>('/leave-requests'); setLeaves(next); setSelectedLeave((previous) => next.find((row) => row.id === previous?.id) ?? null); }
      if (section === 'leave-types') setTypes(await request<LeaveType[]>('/leave-types'));
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [section]);
  async function act(action: () => Promise<unknown>) {
    setError(''); setMessage('');
    try { const result = await action(); const conflicts = (result as Leave)?.conflicts; setMessage(conflicts?.length ? `Saved. Warning: ${conflicts.length} existing assigned booking conflict(s); no booking or assignment was changed.` : 'Saved.'); await load(); }
    catch (cause) { setError((cause as Error).message); }
  }
  const attendanceRows = attendance.filter((row) => `${row.staff?.displayName ?? ''} ${row.workDate.slice(0, 10)}`.toLowerCase().includes(attendanceFilter.toLowerCase()));
  return <section className="panel staff-operations">
    <h2>{section === 'leave-types' ? 'Leave Types' : section === 'leave-review' ? 'Leave Requests' : section === 'attendance' ? 'Attendance' : section === 'my-leave' ? 'My Leave' : 'My Attendance'}</h2>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status">{message}</p>}
    {(section === 'my-attendance' || section === 'attendance') && <>
      {section === 'my-attendance' && hasPermission(identity, 'attendance.clock.own') && <div className="inline"><button onClick={() => void act(() => request('/attendance/clock-in', json('POST', {})))}>Clock in</button><button onClick={() => void act(() => request('/attendance/clock-out', { method: 'POST' }))}>Clock out</button></div>}
      {section === 'attendance' && <label className="filter-field">Filter by staff or date<input value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value)} placeholder="Staff name or YYYY-MM-DD" /></label>}
      <DataTable rows={attendanceRows} loading={loading} selectedId={selectedAttendance?.id} onSelect={(row) => { setSelectedAttendance(row); if (section === 'attendance') void request<Attendance>(`/attendance/${row.id}`).then(setSelectedAttendance).catch((cause: Error) => setError(cause.message)); }} empty="No attendance records." columns={[{ label: 'Staff', render: (row) => row.staff?.displayName ?? 'Me' }, { label: 'Work date', render: (row) => row.workDate.slice(0, 10) }, { label: 'Clock in', render: (row) => date(row.clockInAt) }, { label: 'Clock out', render: (row) => row.clockOutAt ? date(row.clockOutAt) : 'Clocked in' }, { label: 'Status', render: (row) => row.status }]} />
      <RecordDrawer title="Attendance Details" open={Boolean(selectedAttendance)} onClose={() => setSelectedAttendance(null)}>{selectedAttendance && <RecordSection title="Attendance"><RecordField label="Staff">{selectedAttendance.staff?.displayName ?? 'Me'}</RecordField><RecordField label="Work date">{selectedAttendance.workDate.slice(0, 10)}</RecordField><RecordField label="Clock in">{date(selectedAttendance.clockInAt)}</RecordField><RecordField label="Clock out">{selectedAttendance.clockOutAt ? date(selectedAttendance.clockOutAt) : 'Not clocked out'}</RecordField><RecordField label="Status">{selectedAttendance.status}</RecordField></RecordSection>}</RecordDrawer>
    </>}
    {section === 'my-leave' && hasPermission(identity, 'leave.create.own') && <><button type="button" onClick={() => setLeaveFormOpen(true)} disabled={!types.some((type) => type.status === 'ACTIVE')}>New leave request</button><FormDialog title="Apply for leave" open={leaveFormOpen} onClose={() => setLeaveFormOpen(false)}><form className="stack" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(async () => { const result = await request('/leave-requests', json('POST', { leaveTypeId: data.get('leaveTypeId'), startDateTime: new Date(String(data.get('start'))).toISOString(), endDateTime: new Date(String(data.get('end'))).toISOString(), reason: data.get('reason') || undefined })); setLeaveFormOpen(false); return result; }); }}><label>Leave type<select name="leaveTypeId" required>{types.filter((type) => type.status === 'ACTIVE').map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Start<input name="start" type="datetime-local" required /></label><label>End<input name="end" type="datetime-local" required /></label><label>Reason<textarea name="reason" /></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setLeaveFormOpen(false)}>Cancel</button><button>Submit leave</button></div></form></FormDialog>{!types.some((type) => type.status === 'ACTIVE') && <p>Ask an administrator to configure a leave type.</p>}</>}
    {(section === 'my-leave' || section === 'leave-review') && <><h3>{section === 'my-leave' ? 'My leave requests' : 'Leave requests'}</h3><DataTable rows={leaves} loading={loading} selectedId={selectedLeave?.id} onSelect={setSelectedLeave} mobileSummary={(row) => <><strong>{row.staff?.displayName ?? 'My leave'}</strong><span>{row.leaveType?.name ?? 'Leave'} · {row.status}</span><small>{date(row.startDateTime)} – {date(row.endDateTime)}</small></>} empty="No leave requests." columns={[{ label: 'Staff', render: (row) => row.staff?.displayName ?? 'Me' }, { label: 'Type', render: (row) => row.leaveType?.name ?? '—' }, { label: 'Start', render: (row) => date(row.startDateTime) }, { label: 'End', render: (row) => date(row.endDateTime) }, { label: 'Status', render: (row) => row.status }]} /><RecordDrawer title="Leave Details" open={Boolean(selectedLeave)} onClose={() => setSelectedLeave(null)} actions={selectedLeave && section === 'leave-review' && selectedLeave.status === 'PENDING' && hasPermission(identity, 'leave.review') && <><button type="button" onClick={() => void act(() => request(`/leave-requests/${selectedLeave.id}/approve`, json('PATCH', {})))}>Approve</button><button type="button" className="secondary" onClick={() => void act(() => request(`/leave-requests/${selectedLeave.id}/reject`, json('PATCH', {})))}>Reject</button></>}>{selectedLeave && <><RecordSection title="Request"><RecordField label="Staff">{selectedLeave.staff?.displayName ?? 'Me'}</RecordField><RecordField label="Leave type">{selectedLeave.leaveType?.name}</RecordField><RecordField label="Start">{date(selectedLeave.startDateTime)}</RecordField><RecordField label="End">{date(selectedLeave.endDateTime)}</RecordField><RecordField label="Status">{selectedLeave.status}</RecordField></RecordSection><RecordSection title="Notes">{selectedLeave.reason && <RecordField label="Reason">{selectedLeave.reason}</RecordField>}{selectedLeave.adminNote && <RecordField label="Review note">{selectedLeave.adminNote}</RecordField>}{Boolean(selectedLeave.conflicts?.length) && <p role="alert">Assigned booking conflict. Existing bookings remain unchanged.</p>}</RecordSection></>}</RecordDrawer></>}
    {section === 'leave-types' && <><div className="page-actions">{hasPermission(identity, 'leave.type.manage') && <button type="button" onClick={() => setLeaveTypeFormOpen(true)}>New Leave Type</button>}</div><DataTable rows={types} loading={loading} selectedId={selectedType?.id} onSelect={setSelectedType} mobileSummary={(row) => <><strong>{row.name}</strong><small>{row.status}</small></>} empty="No leave types." columns={[{ label: 'Name', render: (row) => row.name }, { label: 'Status', render: (row) => row.status }]} /><RecordDrawer title="Leave Type Details" open={Boolean(selectedType)} onClose={() => setSelectedType(null)}>{selectedType && <RecordSection title="Leave type"><RecordField label="Name">{selectedType.name}</RecordField><RecordField label="Status">{selectedType.status}</RecordField></RecordSection>}</RecordDrawer><FormDialog title="New Leave Type" open={leaveTypeFormOpen} onClose={() => setLeaveTypeFormOpen(false)}><form className="stack" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(async () => { const result = await request('/leave-types', json('POST', { name: data.get('name') })); setLeaveTypeFormOpen(false); return result; }); }}><label>Name<input name="name" required /></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setLeaveTypeFormOpen(false)}>Cancel</button><button>Add leave type</button></div></form></FormDialog></>}
  </section>;
}
