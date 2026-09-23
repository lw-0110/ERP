import { useEffect, useState, type FormEvent } from 'react';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { hasPermission, type PermissionContext } from './permissions.js';
import './receptionist-booking.css';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Customer = { id: string; displayName: string; email: string; phone: string; status: string; completedVisitCount: number; lastCompletedVisit: string | null };
type Service = { id: string; name: string; durationMinutes: number };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { credentials: 'include', ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) throw new Error(getUserFriendlyError(await readApiError(response)));
  return response.json() as Promise<T>;
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export function ReceptionistBooking({ identity }: { identity: PermissionContext }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer>();
  const [services, setServices] = useState<Service[]>([]);
  const [creating, setCreating] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<Record<string, string>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { void request<{ items: Service[] }>('/services').then((response) => setServices(response.items)).catch((cause: Error) => setError(cause.message)); }, []);
  useEffect(() => {
    if (!query.trim() || customer) return;
    let current = true;
    const timer = setTimeout(() => { void request<Customer[]>(`/customers/booking-search?q=${encodeURIComponent(query)}`).then((items) => { if (current) { setResults(items); setError(''); setSearching(false); } }).catch((cause: Error) => { if (current) { setError(cause.message); setSearching(false); } }); }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query, customer]);

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    const input = { firstName: String(data.get('firstName')).trim(), lastName: String(data.get('lastName')).trim(), phone: String(data.get('phone')).trim(), email: String(data.get('email')).trim() };
    const body = { ...input, displayName: `${input.firstName} ${input.lastName}`.trim() };
    setBusy(true); setError(''); setMessage('');
    try {
      const [phoneMatches, emailMatches] = await Promise.all([
        request<Customer[]>(`/customers/booking-search?q=${encodeURIComponent(input.phone)}`),
        request<Customer[]>(`/customers/booking-search?q=${encodeURIComponent(input.email)}`),
      ]);
      const matches = [...new Map([...phoneMatches, ...emailMatches].map((item) => [item.id, item])).values()];
      if (matches.length && JSON.stringify(body) !== JSON.stringify(pendingCustomer)) {
        setResults(matches); setPendingCustomer(body); setError('An existing customer with a similar phone number or email was found. Please review the results before creating a new customer. Submit again only if this is a different person.');
        return;
      }
      const created = await request<Customer>('/customers', post(body));
      setCustomer(created); setCreating(false); setPendingCustomer(undefined); setQuery(''); setResults([]);
      setMessage('Customer created. Continue with the booking.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!customer || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(''); setMessage('');
    try {
      const body = { customerId: customer.id, startDateTime: new Date(String(data.get('start'))).toISOString(), services: data.getAll('serviceIds').map((serviceId) => ({ serviceId, quantity: 1 })) };
      const check = await request<{ available: boolean }>('/availability/check-for-customer', post({ startDateTime: body.startDateTime, services: body.services }));
      if (!check.available) throw new Error('This time is unavailable.');
      await request('/bookings/for-customer', post(body));
      setMessage(`Booking created for ${customer.displayName}.`);
      setCustomer(undefined); setQuery(''); setResults([]);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="panel reception-booking">
    <h2>New Booking</h2>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status">{message}</p>}
    <div className="reception-step"><span>1</span><h3>Customer</h3></div>
    {customer ? <div className="reception-selected"><strong>{customer.displayName}</strong><span>{customer.phone} · {customer.email}</span><button type="button" className="secondary" onClick={() => { setCustomer(undefined); setQuery(''); setCreating(false); }}>Change customer</button></div> : <>
      <label className="reception-search">Search phone, customer name or email<input type="search" autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setResults([]); setSearching(Boolean(event.target.value.trim())); setPendingCustomer(undefined); }} placeholder="Phone number, name or email" /></label>
      {searching && <p role="status">Searching customers…</p>}
      {query.trim() && !searching && !results.length && !error && <p>No customer found.</p>}
      {!!results.length && <ul className="reception-results">{results.map((item) => <li key={item.id}><div><strong>{item.displayName}</strong><span>{item.phone} · {item.email}</span><small>{item.status} · Total visits: {item.completedVisitCount} · Last visit: {item.lastCompletedVisit ? new Date(item.lastCompletedVisit).toLocaleDateString() : '—'}</small></div><button type="button" disabled={item.status !== 'ACTIVE'} onClick={() => { setCustomer(item); setCreating(false); setError(''); }}>Select</button></li>)}</ul>}
      {hasPermission(identity, 'customer.create') && <button type="button" className="secondary" onClick={() => { setCreating((value) => !value); setPendingCustomer(undefined); }}>{creating ? 'Cancel new customer' : '+ Create New Customer'}</button>}
      {creating && <form className="stack reception-create" onSubmit={(event) => void createCustomer(event)}><label>First name<input name="firstName" required /></label><label>Last name<input name="lastName" required /></label><label>Phone<input name="phone" type="tel" required /></label><label>Email<input name="email" type="email" required /></label><button disabled={busy}>{busy ? 'Creating…' : pendingCustomer ? 'Create anyway' : 'Create customer'}</button></form>}
    </>}
    {customer && <><div className="reception-step"><span>2</span><h3>Service, date and time</h3></div><form className="stack reception-book-form" onSubmit={(event) => void createBooking(event)}><label>Choose services (in order)<select name="serviceIds" multiple required>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select></label><label>Start time<input type="datetime-local" name="start" required /></label><button disabled={busy || !services.length}>{busy ? 'Checking…' : 'Check availability and confirm booking'}</button></form></>}
  </section>;
}
