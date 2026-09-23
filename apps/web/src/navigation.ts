import { hasPermission, type PermissionContext } from './permissions.js';

export type AppArea =
  | 'dashboard' | 'profile'
  | 'book' | 'mine' | 'assigned' | 'bookings' | 'resources' | 'hours' | 'schedules'
  | 'customers' | 'staff-people' | 'services'
  | 'my-attendance' | 'my-leave' | 'attendance' | 'leave-review' | 'leave-types'
  | 'my-payments' | 'payments' | 'my-commission' | 'commissions' | 'commission-rules'
  | 'sales' | 'settings' | 'roles' | 'audit';
export type NavigationIcon = 'home' | 'calendar' | 'people' | 'clock' | 'wallet' | 'chart' | 'bell';
export type NavigationItem = { id: AppArea; label: string; permissions?: readonly string[]; requiresAll?: readonly string[]; excludeWhen?: readonly string[] };
export type NavigationGroup = { id: string; label: string; icon: NavigationIcon; items: readonly NavigationItem[] };

export const navigationConfig: readonly NavigationGroup[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home', items: [{ id: 'dashboard', label: 'Dashboard' }] },
  { id: 'profile', label: 'My Profile', icon: 'people', items: [{ id: 'profile', label: 'My Profile' }] },
  { id: 'booking', label: 'Bookings & scheduling', icon: 'calendar', items: [
    { id: 'bookings', label: 'Manage Bookings', permissions: ['booking.read.all'] },
    { id: 'resources', label: 'Resources', permissions: ['resource.read'] },
    { id: 'hours', label: 'Opening Hours', permissions: ['organization.read'] },
    { id: 'schedules', label: 'Staff Schedules', permissions: ['staff.read.all'] },
    { id: 'assigned', label: 'Assigned Work', permissions: ['booking.read.assigned'], excludeWhen: ['booking.read.all'] },
    { id: 'book', label: 'New Booking', permissions: ['booking.create.own', 'booking.create.all'] },
    { id: 'mine', label: 'My Bookings', permissions: ['booking.read.own'], excludeWhen: ['booking.read.all'] },
  ] },
  { id: 'management', label: 'People & services', icon: 'people', items: [
    { id: 'customers', label: 'Customers', permissions: ['customer.read.all'] },
    { id: 'staff-people', label: 'Staff', permissions: ['staff.read.all'] },
    { id: 'services', label: 'Services', permissions: ['service.read'] },
  ] },
  { id: 'staff', label: 'Attendance & leave', icon: 'clock', items: [
    { id: 'attendance', label: 'Attendance', permissions: ['attendance.read.all'] },
    { id: 'leave-review', label: 'Leave Requests', permissions: ['leave.read.all'] },
    { id: 'leave-types', label: 'Leave Types', permissions: ['leave.type.manage'] },
    { id: 'my-attendance', label: 'My Attendance', permissions: ['attendance.read.own'], excludeWhen: ['attendance.read.all'] },
    { id: 'my-leave', label: 'My Leave', permissions: ['leave.read.own'], excludeWhen: ['leave.read.all'] },
  ] },
  { id: 'finance', label: 'Payments & commission', icon: 'wallet', items: [
    { id: 'payments', label: 'Payments', requiresAll: ['payment.read.all', 'booking.read.all'] },
    { id: 'commissions', label: 'Commission Records', permissions: ['commission.read.all'] },
    { id: 'commission-rules', label: 'Commission Rules', permissions: ['commission.rule.manage'] },
    { id: 'my-payments', label: 'My Payments', requiresAll: ['payment.read.own', 'booking.read.own'], excludeWhen: ['payment.read.all'] },
    { id: 'my-commission', label: 'My Commission', permissions: ['commission.read.own'], excludeWhen: ['commission.read.all'] },
  ] },
  { id: 'reports', label: 'Reports & settings', icon: 'chart', items: [
    { id: 'sales', label: 'Sales', permissions: ['report.read.finance'] },
    { id: 'settings', label: 'Settings', permissions: ['organization.read'] },
    { id: 'roles', label: 'Roles & Permissions', permissions: ['role.read'] },
  ] },
  { id: 'audit', label: 'Audit Log', icon: 'bell', items: [{ id: 'audit', label: 'Audit Log', permissions: ['audit.read'] }] },
];

export function visibleNavigation(context: PermissionContext | undefined): NavigationGroup[] {
  return navigationConfig.map((group) => ({
    ...group,
    label: group.id === 'booking' && !hasPermission(context, 'booking.read.all') ? 'Bookings'
      : group.id === 'finance' && !hasPermission(context, 'payment.read.all')
        ? hasPermission(context, 'payment.read.own') ? 'Payments' : 'Commission'
        : group.label,
    items: group.items.filter((item) =>
      (!item.permissions || item.permissions.some((key) => hasPermission(context, key))) &&
      (!item.requiresAll || item.requiresAll.every((key) => hasPermission(context, key))) &&
      (!item.excludeWhen || !item.excludeWhen.some((key) => hasPermission(context, key))),
    ),
  })).filter((group) => group.items.length > 0);
}

export function pageLabel(area: AppArea): string {
  return navigationConfig.flatMap((group) => group.items).find((item) => item.id === area)?.label ?? 'Dashboard';
}
