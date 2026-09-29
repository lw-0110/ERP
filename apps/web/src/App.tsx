import { apiFetch } from './api-fetch.js';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Management } from './Management.js';
import { BookingWorkspace, type BookingSection } from './BookingWorkspace.js';
import { ReceptionistBooking } from './ReceptionistBooking.js';
import { StaffOperationsWorkspace, type StaffSection } from './StaffOperationsWorkspace.js';
import { FinanceWorkspace, type FinanceSection } from './FinanceWorkspace.js';
import { ReportingWorkspace } from './ReportingWorkspace.js';
import { OperationsWorkspace } from './OperationsWorkspace.js';
import { StaffInvitationPage } from './StaffInvitationPage.js';
import { AppLayout } from './AppLayout.js';
import { StaffProfile } from './StaffProfile.js';
import { RolesWorkspace } from './RolesWorkspace.js';
import { visibleNavigation, type AppArea } from './navigation.js';
import type { PermissionContext } from './permissions.js';
import { getUserFriendlyError, readApiError } from './error-messages.js';
import { useTranslation } from 'react-i18next';
import { t } from './i18n.js';
import { LanguageSwitch } from './LanguageSwitch.js';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
type Identity = PermissionContext & { user?: { id?: string; name?: string; email?: string }; activeMembership?: { id?: string }; activeOrganization?: { name?: string }; role?: { id?: string; name?: string } | null };

export default function App() {
  useTranslation();
  const invitationToken = useMemo(() => location.pathname === '/staff-invitation' ? new URLSearchParams(location.search).get('token') : null, []);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [session, setSession] = useState<Identity>(); const [checking, setChecking] = useState(true); const [error, setError] = useState(''); const [area, setArea] = useState<AppArea>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true'); const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => { if (invitationToken) { setChecking(false); return; } void apiFetch(`${api}/identity/me`, { credentials: 'include' }).then(async (response) => { if (response.ok) setSession(await response.json()); }).finally(() => setChecking(false)); }, [invitationToken]);
  useEffect(() => { if (!session) return; const allowed = new Set(visibleNavigation(session).flatMap((group) => group.items.map((item) => item.id))); const restore = () => { const requested = location.hash.replace(/^#\/?/, '') as AppArea; setArea(allowed.has(requested) ? requested : 'dashboard'); }; restore(); window.addEventListener('hashchange', restore); return () => window.removeEventListener('hashchange', restore); }, [session]);
  const navigate = (destination: AppArea) => { location.hash = `/${destination}`; setArea(destination); };
  if (invitationToken) return <><div className="language-switch-container"><LanguageSwitch /></div><StaffInvitationPage token={invitationToken} /></>;

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const path = mode === 'login' ? 'sign-in/email' : 'sign-up/email';
    const body = mode === 'login' ? { email, password } : { email, password, name };
    const response = await apiFetch(`${api}/api/auth/${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { setError(getUserFriendlyError(await readApiError(response))); return; }
    const me = await apiFetch(`${api}/identity/me`, { credentials: 'include' });
    if (!me.ok) { setError(getUserFriendlyError(await readApiError(me))); return; }
    setSession(await me.json());
  }

  if (checking) return <main><div className="language-switch-container"><LanguageSwitch /></div><h1>{t('Booking Management Platform')}</h1><p role="status">{t('Restoring your session…')}</p></main>;
  if (!session) return <main className="auth-shell"><div className="language-switch-container"><LanguageSwitch /></div><section className="panel stack"><h1>{mode === 'login' ? t('Sign in') : t('Create customer account')}</h1><p>{mode === 'login' ? t('Use your organization account.') : t('Register for customer booking access.')}</p><form className="stack" onSubmit={(event) => { void submit(event); }}>{mode === 'register' && <label>{t("Name")}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}<label>{t("Email")}<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>{t("Password")}<input type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button>{mode === 'login' ? t('Sign in') : t('Register')}</button></form>{error && <p role="alert" className="error">{t(error)}</p>}<button className="secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? t('Create customer account') : t('Return to sign in')}</button></section></main>;

  return <AppLayout
    identity={session}
    activeArea={area}
    collapsed={sidebarCollapsed}
    mobileOpen={mobileNavigationOpen}
    onNavigate={navigate}
    onToggleCollapsed={() => setSidebarCollapsed((value) => { localStorage.setItem('sidebar-collapsed', String(!value)); return !value; })}
    onMobileOpen={() => setMobileNavigationOpen(true)}
    onMobileClose={() => setMobileNavigationOpen(false)}
    onLogout={async () => { await apiFetch(`${api}/api/auth/sign-out`, { method: 'POST', credentials: 'include' }); setSession(undefined); setArea('dashboard'); location.hash = ''; }}
  >
    {area === 'dashboard' && (session.permissions.includes('report.read.operations') ? <ReportingWorkspace identity={session} section="Dashboard" /> : <section className="panel welcome-panel"><h2>{t("Welcome,")} {session.user?.name ?? t('team member')}</h2><p>{t("Choose an area from the navigation.")}</p><dl><dt>{t("Organization")}</dt><dd>{session.activeOrganization?.name}</dd><dt>{t("Role")}</dt><dd>{session.role?.name ?? t('No active role')}</dd></dl></section>)}
    {area === 'profile' && (session.permissions.includes('customer.read.own') && !session.permissions.includes('customer.read.all') ? <BookingWorkspace identity={session} section="profile" /> : session.permissions.includes('staff.read.own') && !session.permissions.includes('staff.read.all') ? <StaffProfile /> : <section className="panel"><h2>{t("My Profile")}</h2><dl><dt>{t("Name")}</dt><dd>{session.user?.name ?? '—'}</dd><dt>{t("Email")}</dt><dd>{session.user?.email ?? '—'}</dd><dt>{t("Organization")}</dt><dd>{session.activeOrganization?.name ?? '—'}</dd><dt>{t("Role")}</dt><dd>{session.role?.name ?? '—'}</dd></dl></section>)}
    {area === 'book' && session.permissions.includes('booking.create.all') && session.permissions.includes('customer.read.all') ? <ReceptionistBooking identity={session} /> : (['book', 'mine', 'assigned', 'bookings', 'resources', 'hours', 'schedules'] as AppArea[]).includes(area) && <BookingWorkspace key={area} identity={session} section={area === 'bookings' ? 'admin' : area as BookingSection} />}
    {(['customers', 'staff-people', 'services'] as AppArea[]).includes(area) && <Management key={area} identity={session} section={area === 'staff-people' ? 'staff' : area as 'customers' | 'services'} />}
    {(['my-attendance', 'my-leave', 'attendance', 'leave-review', 'leave-types'] as AppArea[]).includes(area) && <StaffOperationsWorkspace key={area} identity={session} section={area as StaffSection} />}
    {(['my-payments', 'payments', 'my-commission', 'commissions', 'commission-rules'] as AppArea[]).includes(area) && <FinanceWorkspace key={area} identity={session} section={area as FinanceSection} />}
    {area === 'sales' && <ReportingWorkspace identity={session} section="Sales" />}
    {area === 'settings' && <ReportingWorkspace identity={session} section="Settings" />}
    {area === 'roles' && <RolesWorkspace identity={session} />}
    {area === 'audit' && <OperationsWorkspace identity={session} />}
  </AppLayout>;
}
