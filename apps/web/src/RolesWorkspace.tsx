import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { hasPermission, type PermissionContext } from './permissions.js';
import { DataTable, FormDialog, PageHeader, RecordDrawer, RecordField, RecordSection, StatusBadge } from './ui.js';
import { matchesPermissionSearch, permissionGroups, permissionUi } from './permission-ui.js';
import './roles.css';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Permission = { id: string; key: string; module: string; description: string };
type Role = { id: string; name: string; description?: string | null; status: string; isSystemDefault: boolean; permissionKeys: string[]; permissionCount: number; memberCount: number; createdAt: string; updatedAt: string };
type Member = { id: string; userId: string; roleId: string | null; status: string; user: { name: string; email: string }; role: { name: string; status: string } | null };
type Identity = PermissionContext & { user?: { id?: string }; activeMembership?: { id?: string }; role?: { id?: string } | null };
const selfManagementKeys = ['role.read', 'role.update', 'role.permission.manage'];
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { credentials: 'include', ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
  return response.json() as Promise<T>;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function RolesWorkspace({ identity }: { identity: Identity }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [tab, setTab] = useState<'roles' | 'members'>('roles');
  const [editing, setEditing] = useState<Role | null>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chosenKeys, setChosenKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [targetRoleId, setTargetRoleId] = useState('');
  const [memberRoleEditing, setMemberRoleEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [nextRoles, nextPermissions, nextMembers] = await Promise.all([request<Role[]>('/roles'), request<Permission[]>('/permissions'), request<Member[]>('/memberships')]);
      setRoles(nextRoles); setPermissions(nextPermissions); setMembers(nextMembers);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (hasPermission(identity, 'role.read')) void load(); }, [identity]);
  const selected = roles.find((role) => role.id === selectedId);
  const selectedMember = members.find((member) => member.id === selectedMemberId);
  const groups = useMemo(() => permissions.reduce<Record<string, Permission[]>>((result, permission) => { (result[permission.module] ??= []).push(permission); return result; }, {}), [permissions]);
  const visibleGroups = Object.entries(groups).map(([module, items]) => ({ module, label: permissionGroups[module] ?? 'Other / System', items: (items ?? []).filter((permission) => matchesPermissionSearch(permission.key, permission.module, search)) })).filter((group) => group.items.length);
  const selectedPermissionGroups = (selected?.permissionKeys ?? []).reduce<Record<string, string[]>>((result, key) => { (result[permissionUi(key).group] ??= []).push(key); return result; }, {});
  const roleMembers = selected ? members.filter((member) => member.roleId === selected.id) : [];
  const activeRoles = roles.filter((role) => role.status === 'ACTIVE');
  const selfEditRisk = Boolean(editing && editing.id === identity.role?.id && selfManagementKeys.some((key) => editing.permissionKeys.includes(key) && !chosenKeys.includes(key)));
  const selfAssignmentRisk = selectedMember?.id === identity.activeMembership?.id && selfManagementKeys.some((key) => identity.permissions.includes(key) && !roles.find((role) => role.id === targetRoleId)?.permissionKeys.includes(key));

  function openForm(role: Role | null) {
    setEditing(role); setName(role?.name ?? ''); setDescription(role?.description ?? ''); setChosenKeys(role?.permissionKeys ?? []); setSearch(''); setError(''); setMessage('');
  }
  function toggle(key: string) { setChosenKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const role = await request<Role>(editing ? `/roles/${editing.id}` : '/roles', json(editing ? 'PATCH' : 'POST', { name, description, permissionKeys: chosenKeys }));
      setEditing(undefined); setSelectedId(role.id);
      setMessage(editing ? 'Role updated successfully.' : 'Role created successfully.');
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }
  async function archive() {
    if (!selected || !window.confirm(selected.memberCount ? `This role is currently assigned to ${selected.memberCount} members. The server will not archive an in-use role. Continue?` : `Archive ${selected.name}? This does not delete historical records.`)) return;
    setError(''); setMessage('');
    try { await request(`/roles/${selected.id}/archive`, json('PATCH')); setSelectedId(''); setMessage('Role archived successfully.'); await load(); }
    catch (cause) { setError((cause as Error).message); }
  }
  async function assign(event: FormEvent) {
    event.preventDefault(); if (!selectedMember || !targetRoleId || saving) return;
    setSaving(true); setError(''); setMessage('');
    try { await request(`/memberships/${selectedMember.id}/role`, json('PATCH', { roleId: targetRoleId })); setMemberRoleEditing(false); setMessage('Member role updated successfully. Their navigation and actions will update after they refresh or sign in again.'); await load(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }

  if (!hasPermission(identity, 'role.read')) return null;
  return <section className="panel roles-page">
    <PageHeader title="Roles & Permissions" actions={tab === 'roles' && hasPermission(identity, 'role.create') && hasPermission(identity, 'role.permission.manage') ? <button type="button" onClick={() => openForm(null)}>New Role</button> : undefined} />
    <p className="roles-intro">Organization roles use platform-defined permissions. Role names do not grant access on their own.</p>
    <div className="tabs roles-tabs" role="tablist" aria-label="Role management views"><button type="button" role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? 'active' : 'secondary'} onClick={() => setTab('roles')}>Roles</button><button type="button" role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'active' : 'secondary'} onClick={() => setTab('members')}>Members</button></div>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status">{message}</p>}
    {tab === 'roles' && <>
      <DataTable rows={roles} loading={loading} selectedId={selectedId} onSelect={(role) => setSelectedId(role.id)} mobileSummary={(role) => <><strong>{role.name}</strong><span>{role.status}</span><small>{role.permissionCount} permissions · {role.memberCount} members</small></>} empty="No roles yet." columns={[{ label: 'Role Name', render: (role) => role.name }, { label: 'Status', render: (role) => role.status }, { label: 'Permissions', render: (role) => role.permissionCount }, { label: 'Members', render: (role) => role.memberCount }, { label: 'Updated At', render: (role) => new Date(role.updatedAt).toLocaleString() }]} />
      <RecordDrawer title="Role Details" open={Boolean(selected)} onClose={() => setSelectedId('')} actions={selected && <>
        {selected.status === 'ACTIVE' && hasPermission(identity, 'role.update') && <button type="button" onClick={() => openForm(selected)}>Edit</button>}
        {selected.status === 'ACTIVE' && hasPermission(identity, 'role.archive') && <button type="button" className="secondary" onClick={() => void archive()}>Archive role</button>}
      </>}>
        {selected && <><RecordSection title={selected.name}><StatusBadge value={selected.status}/>{selected.description && <p>{selected.description}</p>}<RecordField label="Permissions">{selected.permissionCount}</RecordField><RecordField label="Members">{selected.memberCount}</RecordField><RecordField label="Created">{new Date(selected.createdAt).toLocaleString()}</RecordField><RecordField label="Updated">{new Date(selected.updatedAt).toLocaleString()}</RecordField>{selected.isSystemDefault && <p>Seeded default role.</p>}</RecordSection><RecordSection title="Permissions"><div className="role-permission-groups">{Object.entries(selectedPermissionGroups).map(([group, keys]) => <section key={group}><h4>{group} <small>{keys.length}</small></h4><ul>{keys.map((key) => { const display = permissionUi(key); return <li key={key} title={key}><strong>{display.label}</strong><span>{display.description}</span></li>; })}</ul></section>)}</div></RecordSection><RecordSection title="Assigned members">{roleMembers.length ? <ul>{roleMembers.map((member) => <li key={member.id}>{member.user.name} · {member.user.email}</li>)}</ul> : <p>No members assigned.</p>}</RecordSection></>}
      </RecordDrawer>
    </>}
    {tab === 'members' && <><DataTable rows={members} loading={loading} selectedId={selectedMemberId} onSelect={(member) => { setSelectedMemberId(member.id); setTargetRoleId(member.roleId ?? ''); }} mobileSummary={(member) => <><strong>{member.user.name}</strong><span>{member.user.email}</span><small>{member.role?.name ?? 'No role'} · {member.status}</small></>} empty="No members yet." columns={[{ label: 'Name', render: (member) => member.user.name }, { label: 'Email', render: (member) => member.user.email }, { label: 'Current Role', render: (member) => member.role?.name ?? 'No role' }, { label: 'Status', render: (member) => member.status }]} />
      <RecordDrawer title="Member Details" open={Boolean(selectedMember)} onClose={() => setSelectedMemberId('')} actions={selectedMember && hasPermission(identity, 'role.update') && <button type="button" onClick={() => setMemberRoleEditing(true)}>Change Role</button>}>{selectedMember && <RecordSection title={selectedMember.user.name}><RecordField label="Email">{selectedMember.user.email}</RecordField><RecordField label="Current role">{selectedMember.role?.name ?? 'No role'}</RecordField><RecordField label="Status">{selectedMember.status}</RecordField></RecordSection>}</RecordDrawer>
      <FormDialog title="Change Member Role" open={memberRoleEditing} onClose={() => setMemberRoleEditing(false)}>{selectedMember && <form className="stack" onSubmit={(event) => void assign(event)}><label>Change role<select value={targetRoleId} onChange={(event) => setTargetRoleId(event.target.value)} required><option value="">Select an active role</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><p className="role-warning">Changing this role will update this user's permissions.{selfAssignmentRisk && ' This selection would remove your own role-management access and will be rejected.'}</p><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setMemberRoleEditing(false)}>Cancel</button><button disabled={saving || !targetRoleId || targetRoleId === selectedMember.roleId}>{saving ? 'Saving…' : 'Save role assignment'}</button></div></form>}</FormDialog></>}
    <FormDialog title={editing ? 'Edit Role' : 'New Role'} className="role-drawer" open={editing !== undefined} onClose={() => setEditing(undefined)}><form className="role-form" onSubmit={(event) => void save(event)}><div className="role-drawer-body"><label>Role name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="permission-editor"><div className="permission-editor-heading"><h3>Permissions</h3><p>Select from the platform catalogue.</p></div><label>Search permissions<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search permissions…" /></label>{visibleGroups.length ? visibleGroups.map((group, index) => <details key={`${group.module}:${search ? 'search' : 'all'}`} className="permission-group" open={Boolean(search) || index === 0}><summary>{group.label} <small>{group.items.filter((item) => chosenKeys.includes(item.key)).length}/{group.items.length}</small></summary>{hasPermission(identity, 'role.permission.manage') && <button type="button" className="permission-bulk" onClick={() => setChosenKeys((current) => [...new Set([...current, ...group.items.map((item) => item.key)])])}>Select all {search ? 'visible ' : ''}{group.label}</button>}{group.items.map((permission) => <label className="permission-option" key={permission.id} title={permission.key}><input type="checkbox" checked={chosenKeys.includes(permission.key)} onChange={() => toggle(permission.key)} disabled={!hasPermission(identity, 'role.permission.manage')} /><span><strong>{permissionUi(permission.key, permission.module).label}</strong><small>{permissionUi(permission.key, permission.module).description}</small></span></label>)}</details>) : <p>No permissions match your search.</p>}</div>{selfEditRisk && <p role="alert" className="error">This would remove your own ability to manage roles and permissions. The server will reject it.</p>}</div><div className="dialog-actions role-drawer-footer"><button type="button" className="secondary" onClick={() => setEditing(undefined)}>Cancel</button><button disabled={saving}>{saving ? 'Saving…' : 'Save Role'}</button></div></form></FormDialog>
  </section>;
}
