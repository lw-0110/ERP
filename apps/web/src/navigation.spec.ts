import { describe, expect, it } from 'vitest';
import { pageLabel, visibleNavigation } from './navigation.js';

const leaves = (permissions: string[]) => visibleNavigation({ permissions }).flatMap((group) => group.items.map((item) => item.id));

describe('permission-driven navigation', () => {
  it('shows the exact Admin booking, management, report, and audit destinations', () => {
    const groups = visibleNavigation({ permissions: [
      'booking.read.all', 'booking.read.own', 'booking.read.assigned', 'booking.create.own', 'resource.read', 'organization.read', 'staff.read.all', 'customer.read.all', 'service.read', 'service.create',
      'attendance.read.all', 'attendance.read.own', 'leave.read.all', 'leave.read.own', 'leave.type.manage', 'payment.read.all', 'payment.read.own', 'commission.read.all', 'commission.read.own', 'commission.rule.manage', 'report.read.finance', 'audit.read',
    ] });
    expect(groups.find((group) => group.id === 'booking')?.items.map((item) => item.id)).toEqual(['bookings', 'resources', 'hours', 'schedules', 'book']);
    expect(groups.find((group) => group.id === 'management')?.items.map((item) => item.id)).toEqual(['customers', 'staff-people', 'services']);
    expect(groups.find((group) => group.id === 'reports')?.items.map((item) => item.id)).toEqual(['sales', 'settings']);
    expect(groups.find((group) => group.id === 'audit')?.items.map((item) => item.id)).toEqual(['audit']);
    expect(groups.find((group) => group.id === 'finance')?.items.map((item) => item.id)).toEqual(['payments', 'commissions', 'commission-rules']);
  });

  it('keeps Staff within assigned work, own attendance, leave, and commission permissions', () => {
    expect(leaves(['booking.read.assigned', 'attendance.read.own', 'leave.read.own', 'commission.read.own'])).toEqual(['dashboard', 'profile', 'assigned', 'my-attendance', 'my-leave', 'my-commission']);
  });

  it('keeps Customer within own booking and payment views', () => {
    expect(leaves(['service.read', 'booking.create.own', 'booking.read.own', 'payment.read.own'])).toEqual(['dashboard', 'profile', 'book', 'mine', 'services', 'my-payments']);
  });

  it('shows New Booking from permissions without depending on a Receptionist role name', () => {
    expect(leaves(['booking.create.all', 'customer.read.all', 'customer.create', 'service.read'])).toContain('book');
  });

  it('lets a read-only custom role view Services without exposing edit permissions', () => {
    expect(leaves(['service.read'])).toContain('services');
  });

  it('requires every permission for payment management and labels the dashboard', () => {
    expect(leaves(['payment.read.all'])).not.toContain('payments');
    expect(pageLabel('dashboard')).toBe('Dashboard');
  });
});
