import { apiFetch } from './api-fetch.js';
import { t, locale, translateStatus } from './i18n.js';
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
  const response = await apiFetch(`${api}${path}`, { credentials: 'include', ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
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
  const visibleGroups = Object.entries(groups).map(([module, items]) => ({ module, label: t(permissionGroups[module] ?? 'Other / System'), items: (items ?? []).filter((permission) => matchesPermissionSearch(permission.key, permission.module, search)) })).filter((group) => group.items.length);
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
    if (!selected || !window.confirm(selected.memberCount ? t('This role is currently assigned to {{count}} members. The server will not archive an in-use role. Continue?', { count: selected.memberCount }) : t('Archive {{name}}? This does not delete historical records.', { name: selected.name }))) return;
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
    <PageHeader title={t("Roles & Permissions")} actions={tab === 'roles' && hasPermission(identity, 'role.create') && hasPermission(identity, 'role.permission.manage') ? <button type="button" onClick={() => openForm(null)}>{t("New Role")}</button> : undefined} />
    <p className="roles-intro">{t("Organization roles use platform-defined permissions. Role names do not grant access on their own.")}</p>
    <div className="tabs roles-tabs" role="tablist" aria-label={t("Role management views")}><button type="button" role="tab" aria-selected={tab === 'roles'} className={tab === 'roles' ? 'active' : 'secondary'} onClick={() => setTab('roles')}>{t("Roles")}</button><button type="button" role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'active' : 'secondary'} onClick={() => setTab('members')}>{t("Members")}</button></div>
    {error && <p role="alert" className="error">{t(error)}</p>}{message && <p role="status">{t(message)}</p>}
    {tab === 'roles' && <>
      <DataTable rows={roles} loading={loading} selectedId={selectedId} onSelect={(role) => setSelectedId(role.id)} mobileSummary={(role) => <><strong>{role.name}</strong><span>{translateStatus(role.status)}</span><small>{role.permissionCount} {t("permissions ·")} {role.memberCount} {t("members")}</small></>} empty={t("No roles yet.")} columns={[{ label: 'Role Name', render: (role) => role.name }, { label: 'Status', render: (role) => role.status }, { label: 'Permissions', render: (role) => role.permissionCount }, { label: 'Members', render: (role) => role.memberCount }, { label: 'Updated At', render: (role) => new Date(role.updatedAt).toLocaleString(locale()) }]} />
      <RecordDrawer title={t("Role Details")} open={Boolean(selected)} onClose={() => setSelectedId('')} actions={selected && <>
        {selected.status === 'ACTIVE' && hasPermission(identity, 'role.update') && <button type="button" onClick={() => openForm(selected)}>{t("Edit")}</button>}
        {selected.status === 'ACTIVE' && hasPermission(identity, 'role.archive') && <button type="button" className="secondary" onClick={() => void archive()}>{t("Archive role")}</button>}
      </>}>
        {selected && <><RecordSection title={selected.name}><StatusBadge value={selected.status}/>{selected.description && <p>{selected.description}</p>}<RecordField label={t("Permissions")}>{selected.permissionCount}</RecordField><RecordField label={t("Members")}>{selected.memberCount}</RecordField><RecordField label={t("Created")}>{new Date(selected.createdAt).toLocaleString(locale())}</RecordField><RecordField label={t("Updated")}>{new Date(selected.updatedAt).toLocaleString(locale())}</RecordField>{selected.isSystemDefault && <p>{t("Seeded default role.")}</p>}</RecordSection><RecordSection title={t("Permissions")}><div className="role-permission-groups">{Object.entries(selectedPermissionGroups).map(([group, keys]) => <section key={group}><h4>{group} <small>{keys.length}</small></h4><ul>{keys.map((key) => { const display = permissionUi(key); return <li key={key} title={key}><strong>{display.label}</strong><span>{display.description}</span></li>; })}</ul></section>)}</div></RecordSection><RecordSection title={t("Assigned members")}>{roleMembers.length ? <ul>{roleMembers.map((member) => <li key={member.id}>{member.user.name} · {member.user.email}</li>)}</ul> : <p>{t("No members assigned.")}</p>}</RecordSection></>}
      </RecordDrawer>
    </>}
    {tab === 'members' && <><DataTable rows={members} loading={loading} selectedId={selectedMemberId} onSelect={(member) => { setSelectedMemberId(member.id); setTargetRoleId(member.roleId ?? ''); }} mobileSummary={(member) => <><strong>{member.user.name}</strong><span>{member.user.email}</span><small>{member.role?.name ?? t('No role')} · {translateStatus(member.status)}</small></>} empty={t("No members yet.")} columns={[{ label: 'Name', render: (member) => member.user.name }, { label: 'Email', render: (member) => member.user.email }, { label: 'Current Role', render: (member) => member.role?.name ?? t('No role') }, { label: 'Status', render: (member) => member.status }]} />
      <RecordDrawer title={t("Member Details")} open={Boolean(selectedMember)} onClose={() => setSelectedMemberId('')} actions={selectedMember && hasPermission(identity, 'role.update') && <button type="button" onClick={() => setMemberRoleEditing(true)}>{t("Change Role")}</button>}>{selectedMember && <RecordSection title={selectedMember.user.name}><RecordField label={t("Email")}>{selectedMember.user.email}</RecordField><RecordField label={t("Current role")}>{selectedMember.role?.name ?? t('No role')}</RecordField><RecordField label={t("Status")}>{translateStatus(selectedMember.status)}</RecordField></RecordSection>}</RecordDrawer>
      <FormDialog title={t("Change Member Role")} open={memberRoleEditing} onClose={() => setMemberRoleEditing(false)}>{selectedMember && <form className="stack" onSubmit={(event) => void assign(event)}><label>{t("Change role")}<select value={targetRoleId} onChange={(event) => setTargetRoleId(event.target.value)} required><option value="">{t("Select an active role")}</option>{activeRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><p className="role-warning">{t("Changing this role will update this user's permissions.")}{selfAssignmentRisk && t(' This selection would remove your own role-management access and will be rejected.')}</p><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setMemberRoleEditing(false)}>{t("Cancel")}</button><button disabled={saving || !targetRoleId || targetRoleId === selectedMember.roleId}>{saving ? t('Saving…') : t('Save role assignment')}</button></div></form>}</FormDialog></>}
    <FormDialog title={editing ? t('Edit Role') : t('New Role')} className="role-drawer" open={editing !== undefined} onClose={() => setEditing(undefined)}><form className="role-form" onSubmit={(event) => void save(event)}><div className="role-drawer-body"><label>{t("Role name")}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label><label>{t("Description")}<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="permission-editor"><div className="permission-editor-heading"><h3>{t("Permissions")}</h3><p>{t("Select from the platform catalogue.")}</p></div><label>{t("Search permissions")}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search permissions…")} /></label>{visibleGroups.length ? visibleGroups.map((group, index) => <details key={`${group.module}:${search ? 'search' : 'all'}`} className="permission-group" open={Boolean(search) || index === 0}><summary>{group.label} <small>{group.items.filter((item) => chosenKeys.includes(item.key)).length}/{group.items.length}</small></summary>{hasPermission(identity, 'role.permission.manage') && <button type="button" className="permission-bulk" onClick={() => setChosenKeys((current) => [...new Set([...current, ...group.items.map((item) => item.key)])])}>{t("Select all")} {search ? 'visible ' : ''}{group.label}</button>}{group.items.map((permission) => <label className="permission-option" key={permission.id} title={permission.key}><input type="checkbox" checked={chosenKeys.includes(permission.key)} onChange={() => toggle(permission.key)} disabled={!hasPermission(identity, 'role.permission.manage')} /><span><strong>{permissionUi(permission.key, permission.module).label}</strong><small>{permissionUi(permission.key, permission.module).description}</small></span></label>)}</details>) : <p>{t("No permissions match your search.")}</p>}</div>{selfEditRisk && <p role="alert" className="error">{t("This would remove your own ability to manage roles and permissions. The server will reject it.")}</p>}</div><div className="dialog-actions role-drawer-footer"><button type="button" className="secondary" onClick={() => setEditing(undefined)}>{t("Cancel")}</button><button disabled={saving}>{saving ? t('Saving…') : t('Save Role')}</button></div></form></FormDialog>
  </section>;
}
