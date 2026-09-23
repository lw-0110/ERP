import { useEffect, useState } from 'react';
import { getUserFriendlyError, readApiError } from './error-messages.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Notification = { id: string; title: string; message: string; readAt: string | null; createdAt: string };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState('');
  async function request(path: string, method = 'GET') {
    const response = await fetch(`${api}${path}`, { method, credentials: 'include' });
    if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
    return response.json();
  }
  async function load() {
    const [list, count] = await Promise.all([request('/notifications?page=1&limit=20'), request('/notifications/unread-count')]);
    setItems(list.items ?? []);
    setUnread(count.count ?? 0);
  }
  useEffect(() => { void load().catch(() => setError('Notifications are unavailable.')); }, []);
  async function mark(path: string) {
    setError('');
    try { await request(path, 'PATCH'); await load(); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <div className="notification-control">
    <button type="button" className="icon-button notification-trigger" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} aria-controls="notification-panel" onClick={() => { setOpen(!open); if (!open) void load().catch(() => setError('Notifications are unavailable.')); }}>
      <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
      {unread > 0 && <span className="notification-badge">{unread}</span>}
    </button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Notifications"><header><h2>Notifications</h2><button type="button" className="secondary" disabled={!unread} onClick={() => void mark('/notifications/read-all')}>Mark all read</button></header>{error && <p role="alert">{error}</p>}{items.length ? <ul className="notification-list">{items.map((item) => <li key={item.id} className={item.readAt ? '' : 'unread'}><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small>{!item.readAt && <button type="button" className="secondary" onClick={() => void mark(`/notifications/${item.id}/read`)}>Mark read</button>}</li>)}</ul> : <p>No notifications.</p>}</section>}
  </div>;
}
