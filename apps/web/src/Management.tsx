import { type FormEvent, useEffect, useState } from 'react';
import { hasPermission, type PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { DataTable, FormDialog, PageHeader, RecordDrawer, RecordField, RecordSection } from './ui.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Section = 'customers' | 'staff' | 'services';
type Item = { id: string; userId?: string | null; membershipId?: string | null; roleId?: string | null; roleName?: string | null; accountStatus?: string; firstName?: string; lastName?: string; displayName?: string; name?: string; employeeCode?: string; email?: string; phone?: string; status?: string; currency?: string; requiredStaffCount?: number; priceMinor?: number; durationMinutes?: number; bufferBeforeMinutes?: number; bufferAfterMinutes?: number; categoryId?: string | null; category?: { name: string } | null; description?: string | null; requiredSkills?: { skillId: string; requiredCount: number }[]; requiredResourceTypes?: { resourceTypeId: string; requiredCount: number }[] };
type Invitation = { id: string; roleId: string | null; role?: { name: string } | null; status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED'; expiresAt: string };
type InvitationResult = { staffName: string; roleName: string; invitationUrl: string; expiresAt: string; newStaff: boolean };
type Role = { id: string; name: string; status: string };
const config: Record<Section, { title: string; read: string; create: string; update: string }> = {
  customers: { title: 'Customers', read: 'customer.read.all', create: 'customer.create', update: 'customer.update.all' },
  staff: { title: 'Staff', read: 'staff.read.all', create: 'staff.create', update: 'staff.update.all' },
  services: { title: 'Services', read: 'service.read', create: 'service.create', update: 'service.update' },
};

export function Management({ identity, section }: { identity: PermissionContext; section: Section }) {
  const current = config[section];
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Item>();
  const [editing, setEditing] = useState<Item | null>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationResult, setInvitationResult] = useState<InvitationResult>();
  const [copyFeedback, setCopyFeedback] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [inviteFormOpen, setInviteFormOpen] = useState(false);

  async function load(requestedPage = page, requestedSearch = staffSearch) {
    if (!hasPermission(identity, current.read)) return;
    setLoading(true);
    try {
      const search = section === 'staff' && requestedSearch.trim() ? `&search=${encodeURIComponent(requestedSearch.trim())}` : '';
      const response = await fetch(`${api}/${section}?page=${requestedPage}${search}`, { credentials: 'include' });
      if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
      const result = await response.json();
      setItems(result.items ?? []);
      setSelected((previous) => previous ? (result.items as Item[]).find((item) => item.id === previous.id) ?? previous : undefined);
      setTotal(result.total ?? 0);
      setPageSize(result.pageSize ?? 20);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [section, page, staffSearch]);
  useEffect(() => { if (section !== 'staff' || !hasPermission(identity, 'role.read')) return; void fetch(`${api}/roles`, { credentials: 'include' }).then(async (response) => { if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response))); setRoles((await response.json() as Role[]).filter((role) => role.status === 'ACTIVE')); }).catch((cause: Error) => setError(cause.message)); }, [section, identity]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setMessage('');
    const data = new FormData(event.currentTarget);
    const roleId = String(data.get('roleId') ?? '');
    const inviteAfterSave = section === 'staff' && !editing && (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-invite') === 'true';
    if (section === 'staff' && inviteAfterSave && !roleId) { setError('Select a role before creating the staff account invitation.'); setSaving(false); return; }
    const body = section === 'customers'
      ? { firstName: data.get('firstName'), lastName: data.get('lastName'), displayName: data.get('displayName'), email: data.get('email'), phone: data.get('phone') }
      : section === 'staff'
        ? { employeeCode: data.get('employeeCode'), displayName: data.get('displayName'), email: data.get('email'), phone: data.get('phone') }
        : { name: data.get('name'), durationMinutes: Number(data.get('durationMinutes')), priceMinor: Number(data.get('priceMinor')), currency: String(data.get('currency')).toUpperCase(), requiredStaffCount: Number(data.get('requiredStaffCount')), bufferBeforeMinutes: editing?.bufferBeforeMinutes ?? 0, bufferAfterMinutes: editing?.bufferAfterMinutes ?? 0, ...(editing ? { categoryId: editing.categoryId ?? undefined, description: editing.description ?? undefined, requiredSkills: editing.requiredSkills?.map((item) => ({ id: item.skillId, requiredCount: item.requiredCount })), requiredResourceTypes: editing.requiredResourceTypes?.map((item) => ({ id: item.resourceTypeId, requiredCount: item.requiredCount })) } : {}) };
    try {
      const path = inviteAfterSave ? 'staff/create-and-invite' : `${section}${editing ? `/${editing.id}` : ''}`;
      const response = await fetch(`${api}/${path}`, { method: editing ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(inviteAfterSave ? { ...body, roleId } : body) });
      if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
      const result = await response.json() as Item & { staff?: Item; invitation?: Invitation; invitationUrl?: string };
      if (inviteAfterSave && (!result.staff || !result.invitation?.expiresAt || !result.invitationUrl)) throw new Error('Invitation was created, but its one-time link was not returned. Contact your administrator before retrying.');
      const saved = inviteAfterSave ? result.staff! : result;
      if (section === 'staff') {
        if (!editing) { setStaffSearch(saved.employeeCode ?? ''); setPage(1); }
        setSelectedRoleId(!editing && !inviteAfterSave ? '' : roleId);
        setSelected(saved);
        setEditing(undefined);
        if (editing?.userId && editing.membershipId && roleId && roleId !== editing.roleId) {
          const changed = await fetch(`${api}/memberships/${editing.membershipId}/role`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleId }) });
          if (!changed.ok) throw new Error(getUserFriendlyError(await readApiError(changed)));
        }
        if (inviteAfterSave && result.invitationUrl && result.invitation) { setCopyFeedback(''); setInvitationResult({ staffName: saved.displayName ?? '', roleName: roles.find((role) => role.id === roleId)?.name ?? 'Selected role', invitationUrl: result.invitationUrl, expiresAt: result.invitation.expiresAt, newStaff: true }); }
      }
      setEditing(undefined);
      if (!inviteAfterSave) setMessage(section === 'staff' && !editing ? 'Staff profile saved. No login account has been created.' : `${section === 'customers' ? 'Customer' : section === 'staff' ? 'Staff member' : 'Service'} saved.`);
      await load(section === 'staff' && !editing ? 1 : page, section === 'staff' && !editing ? saved.employeeCode ?? '' : staffSearch);
    } catch (cause) { setError((cause as Error).message); if (section === 'staff') await load(); }
    finally { setSaving(false); }
  }
  async function loadInvitations(staffId: string) {
    const response = await fetch(`${api}/staff/${staffId}/invitations`, { credentials: 'include' });
    if (response.ok) setInvitations(await response.json());
  }
  async function createInvitation(staffId = selected?.id, roleId = selectedRoleId) {
    if (!staffId || !roleId) { setError('Select a role before creating the staff account invitation.'); return; }
    setError('');
    const response = await fetch(`${api}/staff/${staffId}/invitations`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleId }) });
    if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
    const result = await response.json();
    if (!result.invitationUrl || !result.invitation?.expiresAt) throw new Error('Invitation was created, but its one-time link was not returned. Contact your administrator before retrying.');
    setCopyFeedback('');
    setInvitationResult({ staffName: selected?.displayName ?? '', roleName: roles.find((role) => role.id === roleId)?.name ?? 'Selected role', invitationUrl: result.invitationUrl, expiresAt: result.invitation.expiresAt, newStaff: false });
    await loadInvitations(staffId);
  }
  async function revokeInvitation(id: string) {
    if (!selected || !window.confirm('Revoke this unused invitation?')) return;
    const response = await fetch(`${api}/staff/${selected.id}/invitations/${id}/revoke`, { method: 'PATCH', credentials: 'include' });
    if (!response.ok) { setError('Unable to revoke invitation.'); return; }
    await loadInvitations(selected.id);
    await load();
  }
  async function changeStatus() {
    if (!selected) return;
    const nextStatus = selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!window.confirm(`${nextStatus === 'INACTIVE' ? 'Deactivate' : 'Reactivate'} ${selected.displayName ?? selected.name ?? 'this record'}? Historical records will remain available.`)) return;
    setError('');
    try {
      const response = await fetch(`${api}/${section}/${selected.id}/status`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) });
      if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
      setSelected(await response.json());
      setMessage(`${current.title.slice(0, -1)} ${nextStatus === 'INACTIVE' ? 'deactivated' : 'reactivated'}.`);
      await load();
    } catch (cause) { setError((cause as Error).message); }
  }
  if (!hasPermission(identity, current.read)) return null;
  const rowNumber = (item: Item) => (page - 1) * pageSize + items.findIndex((row) => row.id === item.id) + 1;
  const columns = section === 'customers' ? [
    { label: 'No.', render: rowNumber },
    { label: 'Name', render: (item: Item) => item.displayName ?? `${item.firstName ?? ''} ${item.lastName ?? ''}` },
    { label: 'Email', render: (item: Item) => item.email ?? '—' },
    { label: 'Phone', render: (item: Item) => item.phone ?? '—' },
    { label: 'Status', render: (item: Item) => item.status ?? '—' },
  ] : section === 'staff' ? [
    { label: 'No.', render: rowNumber },
    { label: 'Name', render: (item: Item) => item.displayName ?? '—' },
    { label: 'Email', render: (item: Item) => item.email ?? '—' },
    { label: 'Role', render: (item: Item) => item.roleName ?? 'Not assigned' },
    { label: 'Account Status', render: (item: Item) => item.accountStatus ?? 'No Account' },
    { label: 'Staff Status', render: (item: Item) => item.status ?? '—' },
  ] : [
    { label: 'No.', render: rowNumber },
    { label: 'Service', render: (item: Item) => item.name ?? '—' },
    { label: 'Category', render: (item: Item) => item.category?.name ?? '—' },
    { label: 'Duration', render: (item: Item) => `${item.durationMinutes ?? 0} min` },
    { label: 'Price', render: (item: Item) => `${item.priceMinor ?? 0} ${item.currency ?? ''} minor units` },
    { label: 'Status', render: (item: Item) => item.status ?? '—' },
  ];
  return <section className="panel management-page">
    <PageHeader title={current.title} actions={hasPermission(identity, current.create) && <button type="button" onClick={() => { setError(''); setSelectedRoleId(''); setEditing(null); }}>New</button>} />
    {error && editing === undefined && <p role="alert" className="error">{error}</p>}{message && <p role="status">{message}</p>}
    {section === 'staff' && <label className="filter-field">Find staff by name, email or employee code<input type="search" value={staffSearch} onChange={(event) => { setStaffSearch(event.target.value); setPage(1); }} placeholder="Search staff…" /></label>}
    <DataTable columns={columns} rows={items} loading={loading} selectedId={selected?.id} onSelect={(item) => { setSelected(item); setSelectedRoleId(item.roleId ?? ''); setInvitations([]); if (section === 'staff' && hasPermission(identity, 'staff.invite')) void loadInvitations(item.id); }} mobileSummary={(item) => <><strong>{item.displayName ?? item.name}</strong><span>{section === 'services' ? `${item.durationMinutes} min · ${item.priceMinor} ${item.currency}` : item.phone}</span><small>{item.status}</small></>} empty={`No ${current.title.toLowerCase()} yet.`} />
    {total > pageSize && <nav className="pagination" aria-label={`${current.title} pages`}><button type="button" className="secondary" disabled={page === 1} onClick={() => { setSelected(undefined); setPage(page - 1); }}>Previous</button><span>Page {page} of {Math.ceil(total / pageSize)}</span><button type="button" className="secondary" disabled={page * pageSize >= total} onClick={() => { setSelected(undefined); setPage(page + 1); }}>Next</button></nav>}
    <RecordDrawer title={section === 'customers' ? 'Customer Details' : section === 'staff' ? 'Staff Details' : 'Service Details'} open={Boolean(selected)} onClose={() => setSelected(undefined)} actions={selected && <>
      {hasPermission(identity, current.update) && <button type="button" onClick={() => { setError(''); setSelectedRoleId(selected.roleId ?? ''); setEditing(selected); }}>Edit</button>}
      {selected.status && (section === 'services' ? hasPermission(identity, 'service.disable') : hasPermission(identity, current.update)) && <button type="button" className="secondary" onClick={() => void changeStatus()}>{selected.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}</button>}
      {section === 'staff' && !selected.userId && selected.accountStatus !== 'Invitation Active' && selected.status === 'ACTIVE' && hasPermission(identity, 'staff.invite') && hasPermission(identity, 'role.read') && hasPermission(identity, 'role.update') && <button type="button" className="secondary" onClick={() => setInviteFormOpen(true)}>Create &amp; Invite Account</button>}
    </>}>
      {selected && <><RecordSection title={section === 'customers' ? 'Customer' : section === 'staff' ? 'Staff' : 'Service'}>
        <RecordField label="Name">{selected.displayName ?? selected.name}</RecordField>
        {section === 'staff' && <RecordField label="Employee code">{selected.employeeCode}</RecordField>}
        {section === 'services' ? <><RecordField label="Category">{selected.category?.name ?? '—'}</RecordField><RecordField label="Duration">{selected.durationMinutes} min</RecordField><RecordField label="Price">{selected.priceMinor} {selected.currency} minor units</RecordField><RecordField label="Required staff">{selected.requiredStaffCount}</RecordField>{selected.description && <RecordField label="Description">{selected.description}</RecordField>}</> : <><RecordField label="Phone">{selected.phone}</RecordField><RecordField label="Email">{selected.email}</RecordField></>}
        <RecordField label="Status">{selected.status}</RecordField>
      </RecordSection>{section === 'staff' && <RecordSection title="Account"><RecordField label="Account status">{selected.accountStatus ?? 'No Account'}</RecordField><RecordField label="Role">{selected.roleName ?? 'Not assigned'}</RecordField>{selected.userId ? <p>This staff profile is linked to an account. Use Edit to change its role.</p> : <><h4>Invitation history</h4>{invitations.length ? <ul>{invitations.map((invitation) => <li key={invitation.id}>{invitation.status} · {invitation.role?.name ?? 'Role unavailable'} · expires {new Date(invitation.expiresAt).toLocaleString()} {invitation.status === 'ACTIVE' && hasPermission(identity, 'staff.invite') && <button type="button" onClick={() => void revokeInvitation(invitation.id)}>Revoke</button>}</li>)}</ul> : <p>No invitations.</p>}</>}</RecordSection>}</>}
    </RecordDrawer>
    <FormDialog title="Create & Invite Account" open={inviteFormOpen} onClose={() => setInviteFormOpen(false)}><div className="stack"><p>Choose an active role for this staff account invitation.</p><label>Role<select value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}><option value="">Select an active role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setInviteFormOpen(false)}>Cancel</button><button type="button" disabled={!selectedRoleId || selected?.status !== 'ACTIVE'} onClick={() => { void createInvitation().then(() => { setInviteFormOpen(false); void load(); }).catch((cause: Error) => setError(cause.message)); }}>Create &amp; Invite Account</button></div></div></FormDialog>
    <FormDialog title={`${editing ? 'Edit' : 'New'} ${current.title === 'Staff' ? 'staff member' : current.title.slice(0, -1).toLowerCase()}`} open={editing !== undefined} onClose={() => setEditing(undefined)}>
      <form key={editing?.id ?? 'new'} className="stack" onSubmit={(event) => void save(event)} onInvalid={section === 'staff' ? () => setError('Complete Employee code, Display name, a valid Email, and Phone before saving or inviting.') : undefined}>
        {error && editing !== undefined && <p role="alert" className="error">{error}</p>}
        {section === 'customers' && <><label>First name<input name="firstName" defaultValue={editing?.firstName ?? ''} required /></label><label>Last name<input name="lastName" defaultValue={editing?.lastName ?? ''} required /></label><label>Display name<input name="displayName" defaultValue={editing?.displayName ?? ''} required /></label><label>Email<input name="email" type="email" defaultValue={editing?.email ?? ''} required /></label><label>Phone<input name="phone" defaultValue={editing?.phone ?? ''} required /></label></>}
        {section === 'staff' && <><label>Employee code<input name="employeeCode" defaultValue={editing?.employeeCode ?? ''} required /></label><label>Display name<input name="displayName" defaultValue={editing?.displayName ?? ''} required /></label><label>Email<input name="email" type="email" defaultValue={editing?.email ?? ''} required /></label><label>Phone<input name="phone" defaultValue={editing?.phone ?? ''} required /></label>{hasPermission(identity, 'role.read') && <label>Role<select name="roleId" value={selectedRoleId} disabled={Boolean(editing?.userId && !hasPermission(identity, 'role.update')) || editing?.accountStatus === 'Invitation Active'} onChange={(event) => setSelectedRoleId(event.target.value)}><option value="">Select an active role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>}{editing === null && !selectedRoleId && <p>Select a role to create a staff login invitation.</p>}</>}
        {section === 'services' && <><label>Service name<input name="name" defaultValue={editing?.name ?? ''} required /></label><label>Duration minutes<input name="durationMinutes" type="number" min="1" defaultValue={editing?.durationMinutes ?? 60} required /></label><label>Price in minor units<input name="priceMinor" type="number" min="0" defaultValue={editing?.priceMinor ?? 0} required /></label><label>Currency<input name="currency" defaultValue={editing?.currency ?? 'MYR'} minLength={3} maxLength={3} required /></label><label>Required staff<input name="requiredStaffCount" type="number" min="1" defaultValue={editing?.requiredStaffCount ?? 1} required /></label></>}
        <div className="dialog-actions staff-form-actions"><button type="button" className="secondary" onClick={() => setEditing(undefined)}>Cancel</button>{section === 'staff' && editing === null && hasPermission(identity, 'staff.invite') && hasPermission(identity, 'role.update') && hasPermission(identity, 'role.read') && <button type="submit" className="staff-create-invite" data-invite="true" disabled={saving || !selectedRoleId}>Create Staff &amp; Invite</button>}<button className={section === 'staff' && editing === null ? 'secondary staff-profile-only' : ''} disabled={saving}>{saving ? 'Saving…' : section === 'staff' && editing === null ? 'Save Profile Only' : 'Save'}</button></div>
      </form>
    </FormDialog>
    <FormDialog title={invitationResult?.newStaff ? 'Staff created and invitation generated' : 'Invitation generated'} open={Boolean(invitationResult)} onClose={() => { setInvitationResult(undefined); void load(); }}>
      {invitationResult && <div className="stack"><p><strong>Copy this link now.</strong> It is shown only once and cannot be retrieved after Done or refresh.</p><p>Staff: {invitationResult.staffName}<br />Role: {invitationResult.roleName}<br />Invitation expires: {new Date(invitationResult.expiresAt).toLocaleString()}</p><label>Invitation link<input aria-label="Staff invitation URL" readOnly value={invitationResult.invitationUrl} /></label>{copyFeedback && <p role="status">{copyFeedback}</p>}<div className="dialog-actions"><button type="button" className="secondary" onClick={() => { void navigator.clipboard.writeText(invitationResult.invitationUrl).then(() => setCopyFeedback('Invitation link copied.')).catch(() => setCopyFeedback('Unable to copy automatically. Select and copy the link above.')); }}>Copy Link</button><button type="button" onClick={() => { setInvitationResult(undefined); void load(); }}>Done</button></div></div>}
    </FormDialog>
  </section>;
}
