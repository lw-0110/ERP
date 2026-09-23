import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { pageLabel, type AppArea, type NavigationIcon, visibleNavigation } from './navigation.js';
import { NotificationBell } from './NotificationBell.js';
import type { PermissionContext } from './permissions.js';

type Identity = PermissionContext & {
  user?: { name?: string; email?: string };
  activeOrganization?: { name?: string };
  role?: { name?: string } | null;
};

type AppLayoutProps = {
  identity: Identity;
  activeArea: AppArea;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (area: AppArea) => void;
  onToggleCollapsed: () => void;
  onMobileOpen: () => void;
  onMobileClose: () => void;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
};

function Icon({ name }: { name: NavigationIcon | 'menu' | 'close' | 'collapse' | 'logout' }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9h13v-9M9 19v-5h6v5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    wallet: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v16H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 7h15M15 12h6v4h-6a2 2 0 0 1 0-4Z"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    collapse: <><path d="m14 7-5 5 5 5M20 4v16"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function NavigationList({ identity, activeArea, collapsed = false, onNavigate }: { identity: Identity; activeArea: AppArea; collapsed?: boolean; onNavigate: (area: AppArea) => void }) {
  const items = useMemo(() => visibleNavigation(identity), [identity]);
  const [expanded, setExpanded] = useState<string>(() => items.find((group) => group.items.some((item) => item.id === activeArea))?.id ?? '');
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const group = items.find((candidate) => candidate.items.some((item) => item.id === activeArea)); if (group) setExpanded(group.id); }, [activeArea, items]);
  useEffect(() => { if (!collapsed) setFlyout(null); }, [collapsed]);
  useEffect(() => {
    if (!flyout) return;
    const dismiss = (event: PointerEvent) => { if (!flyoutRef.current?.contains(event.target as Node) && !(event.target as Element).closest('[data-flyout-trigger]')) setFlyout(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFlyout(null); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [flyout]);
  const choose = (area: AppArea) => { setFlyout(null); onNavigate(area); };
  return <><nav className="sidebar-navigation" aria-label="Main navigation">
    {items.map((group) => {
      const active = group.items.some((item) => item.id === activeArea);
      const single = group.items.length === 1;
      return <div className="sidebar-group" key={group.id}>
        <button type="button" className={`sidebar-link${active ? ' is-active' : ''}`} data-flyout-trigger={collapsed && !single ? '' : undefined} aria-expanded={single ? undefined : collapsed ? flyout?.id === group.id : expanded === group.id} aria-controls={single ? undefined : collapsed ? `flyout-${group.id}` : `submenu-${group.id}`} aria-label={collapsed ? group.label : undefined} title={collapsed ? group.label : undefined} onClick={(event) => single ? choose(group.items[0].id) : collapsed ? setFlyout(flyout?.id === group.id ? null : { id: group.id, top: Math.min(event.currentTarget.getBoundingClientRect().top, window.innerHeight - 280) }) : setExpanded(expanded === group.id ? '' : group.id)}><Icon name={group.icon}/><span>{group.label}</span>{!single && !collapsed && <span className="submenu-chevron" aria-hidden="true">⌄</span>}</button>
        {!collapsed && !single && expanded === group.id && <div id={`submenu-${group.id}`} className="sidebar-submenu">{group.items.map((item) => <button key={item.id} type="button" className={`submenu-link${item.id === activeArea ? ' is-active' : ''}`} aria-current={item.id === activeArea ? 'page' : undefined} onClick={() => choose(item.id)}>{item.label}</button>)}</div>}
      </div>;
    })}
  </nav>{collapsed && flyout && createPortal(<div ref={flyoutRef} id={`flyout-${flyout.id}`} className="sidebar-flyout" style={{ top: Math.max(12, flyout.top) }} aria-label={items.find((group) => group.id === flyout.id)?.label}><strong>{items.find((group) => group.id === flyout.id)?.label}</strong>{items.find((group) => group.id === flyout.id)?.items.map((item) => <button key={item.id} type="button" className={`submenu-link${item.id === activeArea ? ' is-active' : ''}`} aria-current={item.id === activeArea ? 'page' : undefined} onClick={() => choose(item.id)}>{item.label}</button>)}</div>, document.body)}</>;
}

function Profile({ identity, collapsed = false }: { identity: Identity; collapsed?: boolean }) {
  const displayName = identity.user?.name ?? identity.user?.email ?? 'User';
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <div className="sidebar-profile" title={collapsed ? `${displayName} · ${identity.role?.name ?? 'No active role'}` : undefined}>
    <span className="profile-avatar" aria-hidden="true">{initials || 'U'}</span>
    <span className="profile-copy"><strong>{displayName}</strong><small>{identity.role?.name ?? 'No active role'}</small></span>
  </div>;
}

export function AppLayout({ identity, activeArea, collapsed, mobileOpen, onNavigate, onToggleCollapsed, onMobileOpen, onMobileClose, onLogout, children }: AppLayoutProps) {
  const title = pageLabel(activeArea);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    drawerRef.current?.querySelector<HTMLButtonElement>('.drawer-header button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onMobileClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('drawer-open');
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.classList.remove('drawer-open'); menuButtonRef.current?.focus(); };
  }, [mobileOpen, onMobileClose]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (media.matches && mobileOpen) onMobileClose(); };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, [mobileOpen, onMobileClose]);

  const navigate = (area: AppArea) => { onNavigate(area); onMobileClose(); };
  return <div className={`app-layout${collapsed ? ' sidebar-collapsed' : ''}`}>
    <aside className="desktop-sidebar" aria-label="Application sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">B</span><span className="brand-copy">Booking Platform</span></div>
      <NavigationList identity={identity} activeArea={activeArea} collapsed={collapsed} onNavigate={onNavigate}/>
      <div className="sidebar-footer"><Profile identity={identity} collapsed={collapsed}/><button type="button" className="sidebar-link logout-link" aria-label={collapsed ? 'Sign out' : undefined} data-tooltip={collapsed ? 'Sign out' : undefined} onClick={() => void onLogout()}><Icon name="logout"/><span>Sign out</span></button></div>
      <button type="button" className="collapse-control" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}><Icon name="collapse"/><span>{collapsed ? 'Expand' : 'Collapse sidebar'}</span></button>
    </aside>

    <header className="mobile-header">
      <button ref={menuButtonRef} type="button" className="icon-button" onClick={onMobileOpen} aria-label="Open navigation menu" aria-expanded={mobileOpen} aria-controls="mobile-navigation"><Icon name="menu"/></button>
      <div><strong>{title}</strong><small>{identity.activeOrganization?.name}</small></div>
      <NotificationBell />
      <button type="button" className="profile-shortcut" onClick={() => onNavigate('profile')} aria-label="My Profile"><span className="profile-avatar" aria-hidden="true">{(identity.user?.name ?? identity.user?.email ?? 'U')[0]?.toUpperCase()}</span><span>My Profile</span></button>
    </header>

    {mobileOpen && <button type="button" className="drawer-backdrop" aria-label="Close navigation menu" onClick={onMobileClose}/>} 
    {mobileOpen && <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navigation menu"><aside id="mobile-navigation" className="mobile-drawer is-open" aria-label="Mobile application sidebar">
      <div className="drawer-header"><div className="brand"><span className="brand-mark" aria-hidden="true">B</span><span className="brand-copy">Booking Platform</span></div><button type="button" className="icon-button" onClick={onMobileClose} aria-label="Close navigation menu"><Icon name="close"/></button></div>
      <NavigationList identity={identity} activeArea={activeArea} onNavigate={navigate}/>
      <div className="sidebar-footer"><Profile identity={identity}/><button type="button" className="sidebar-link logout-link" onClick={() => void onLogout()}><Icon name="logout"/><span>Sign out</span></button></div>
    </aside></div>}

    <section className="content-column">
      <header className="content-header"><div><p>{identity.activeOrganization?.name}</p><h1>{title}</h1></div><div className="header-actions"><NotificationBell /><button type="button" className="profile-shortcut" onClick={() => onNavigate('profile')} aria-label="My Profile"><span className="profile-avatar" aria-hidden="true">{(identity.user?.name ?? identity.user?.email ?? 'U')[0]?.toUpperCase()}</span><span>{identity.user?.name ?? identity.user?.email ?? 'My Profile'}</span></button></div></header>
      <main className="app-content">{children}</main>
    </section>
  </div>;
}
