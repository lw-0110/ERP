import { describe, expect, it } from 'vitest';
import { matchesPermissionSearch, permissionUi } from './permission-ui.js';

describe('role permission display metadata', () => {
  it('uses friendly labels, plain-English descriptions and groups', () => {
    expect(permissionUi('booking.reschedule.own')).toEqual({ label: 'Reschedule own booking', description: 'Reschedule your own booking.', group: 'Bookings' });
    expect(permissionUi('attendance.read.own')).toEqual({ label: 'View own attendance', description: 'See your own attendance records.', group: 'Attendance' });
  });

  it('searches friendly names, explanations and hidden raw keys', () => {
    expect(matchesPermissionSearch('booking.reschedule.own', 'booking', 'reschedule own')).toBe(true);
    expect(matchesPermissionSearch('booking.create.all', 'booking', 'on behalf of customers')).toBe(true);
    expect(matchesPermissionSearch('booking.reschedule.own', 'booking', 'booking.reschedule.own')).toBe(true);
    expect(matchesPermissionSearch('booking.reschedule.own', 'booking', 'payment')).toBe(false);
  });

  it('keeps unknown backend permissions visible with safe fallback copy', () => {
    expect(permissionUi('some.new.permission')).toEqual({ label: 'Some new permission', description: 'Permission description is not available yet.', group: 'Other / System' });
  });
});
