import { useEffect, useState } from 'react';
import { hasPermission, type PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { DataTable, RecordDrawer, RecordField, RecordSection } from './ui.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Audit = { id: string; action: string; entityType: string; entityId?: string; actorUserId?: string; metadata: unknown; createdAt: string };
async function json(path: string) { const response = await fetch(`${api}${path}`, { credentials: 'include' }); if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response))); return response.json(); }

export function OperationsWorkspace({ identity }: { identity: PermissionContext }) {
  const [audit, setAudit] = useState<Audit[]>([]);
  const [selected, setSelected] = useState<Audit>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [actor, setActor] = useState(''); const [action, setAction] = useState(''); const [entityType, setEntityType] = useState('');
  async function loadAudit() {
    const query = new URLSearchParams();
    if (from) query.set('from', from); if (to) query.set('to', to); if (actor) query.set('actorUserId', actor); if (action) query.set('action', action); if (entityType) query.set('entityType', entityType);
    setLoading(true); setError('');
    try { const value = await json(`/audit-logs?${query}`); setAudit(value.items ?? []); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (hasPermission(identity, 'audit.read')) void loadAudit(); }, [identity]);
  if (!hasPermission(identity, 'audit.read')) return null;
  return <section className="panel operations-workspace"><h2>Audit Log</h2>{error && <p role="alert" className="error">{error}</p>}
    <form className="audit-filters" onSubmit={(event) => { event.preventDefault(); void loadAudit(); }}><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Actor user ID<input value={actor} onChange={(event) => setActor(event.target.value)} /></label><label>Action<input value={action} onChange={(event) => setAction(event.target.value)} /></label><label>Entity type<input value={entityType} onChange={(event) => setEntityType(event.target.value)} /></label><button>Apply filters</button></form>
    <DataTable rows={audit} loading={loading} selectedId={selected?.id} onSelect={setSelected} mobileSummary={(row) => <><strong>{row.action}</strong><span>{row.entityType}</span><small>{new Date(row.createdAt).toLocaleString()}</small></>} empty="No audit records." columns={[{ label: 'Time', render: (row) => new Date(row.createdAt).toLocaleString() }, { label: 'Action', render: (row) => row.action }, { label: 'Entity', render: (row) => row.entityType }, { label: 'Actor', render: (row) => row.actorUserId ?? 'System' }]} />
    <RecordDrawer title="Audit Details" open={Boolean(selected)} onClose={() => setSelected(undefined)}>{selected && <><RecordSection title="Event"><RecordField label="Time">{new Date(selected.createdAt).toLocaleString()}</RecordField><RecordField label="Actor">{selected.actorUserId ?? 'System'}</RecordField><RecordField label="Action">{selected.action}</RecordField><RecordField label="Entity">{selected.entityType}</RecordField></RecordSection><RecordSection title="Metadata">{selected.metadata && typeof selected.metadata === 'object' && !Array.isArray(selected.metadata) ? Object.entries(selected.metadata).map(([key, value]) => <RecordField key={key} label={key}>{value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</RecordField>) : <p>{selected.metadata == null ? 'No metadata.' : String(selected.metadata)}</p>}</RecordSection></>}</RecordDrawer>
  </section>;
}
