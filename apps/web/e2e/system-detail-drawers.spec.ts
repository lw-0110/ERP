import { expect, test, type Page } from '@playwright/test';

async function mock(page: Page, permissions: string[]) {
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    if (path === '/identity/me') return route.fulfill({ json: { user: { id: 'u1', name: 'Viewer' }, activeOrganization: { name: 'Local' }, permissions } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/roles') return route.fulfill({ json: [{ id: 'r1', name: 'Viewer', status: 'ACTIVE', isSystemDefault: false, permissionKeys: ['role.read'], permissionCount: 1, memberCount: 1, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z' }] });
    if (path === '/permissions') return route.fulfill({ json: [{ id: 'p1', key: 'role.read', module: 'role', description: 'Read roles' }] });
    if (path === '/memberships') return route.fulfill({ json: [{ id: 'm1', userId: 'u1', roleId: 'r1', status: 'ACTIVE', user: { name: 'Viewer', email: 'viewer@example.test' }, role: { name: 'Viewer', status: 'ACTIVE' } }] });
    if (path === '/bookings') return route.fulfill({ json: [{ id: 'b1', bookingNumber: 'BK-technical-long-id', status: 'CONFIRMED', paymentStatus: 'UNPAID', customer: { displayName: 'John Tan' }, services: [] }] });
    if (path === '/bookings/b1/payment-summary') return route.fulfill({ json: { paymentStatus: 'UNPAID', totalsByCurrency: [{ currency: 'MYR', bookedMinor: 5000, paidMinor: 0 }], payments: [] } });
    if (path === '/leave-requests') return route.fulfill({ json: [{ id: 'l1', status: 'PENDING', startDateTime: '2026-09-21T02:00:00Z', endDateTime: '2026-09-21T10:00:00Z', reason: 'Personal', adminNote: null, staff: { displayName: 'Maya Lee' }, leaveType: { name: 'Annual Leave' } }] });
    if (path.startsWith('/audit-logs')) return route.fulfill({ json: { items: [{ id: 'a1', action: 'BOOKING_CREATED', entityType: 'BOOKING', entityId: 'technical-id', actorUserId: 'actor-id', metadata: { channel: 'front desk' }, createdAt: '2026-09-20T00:00:00Z' }] } });
    return route.fulfill({ json: [] });
  });
}

test('roles and members open read-only drawers', async ({ page }) => {
  await mock(page, ['role.read']);
  await page.goto('/#/roles');
  await page.locator('.data-table tbody tr').click();
  const role = page.getByRole('dialog', { name: 'Role Details' });
  await expect(role).toContainText('Viewer');
  await expect(role.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await role.getByRole('button', { name: 'Close Role Details' }).click();
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.locator('.data-table tbody tr').click();
  const member = page.getByRole('dialog', { name: 'Member Details' });
  await expect(member).toContainText('viewer@example.test');
  await expect(member.getByRole('button', { name: 'Change Role' })).toHaveCount(0);
});

test('payments open read-only detail without exposing technical booking number', async ({ page }) => {
  await mock(page, ['payment.read.all', 'booking.read.all']);
  await page.goto('/#/payments');
  await expect(page.getByText('BK-technical-long-id')).toHaveCount(0);
  await page.locator('.data-table tbody tr').click();
  const detail = page.getByRole('dialog', { name: 'Payment Details' });
  await expect(detail).toContainText('John Tan');
  await expect(detail).toContainText('UNPAID');
  await expect(detail.getByRole('button', { name: 'Record Payment' })).toHaveCount(0);
});

test('leave and audit events use compact list-to-detail views', async ({ page }) => {
  await mock(page, ['leave.read.all', 'audit.read']);
  await page.goto('/#/leave-review');
  await page.locator('.data-table tbody tr').click();
  const leave = page.getByRole('dialog', { name: 'Leave Details' });
  await expect(leave).toContainText('Maya Lee');
  await expect(leave.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await leave.getByRole('button', { name: 'Close Leave Details' }).click();
  await page.goto('/#/audit');
  await page.locator('.data-table tbody tr').click();
  const audit = page.getByRole('dialog', { name: 'Audit Details' });
  await expect(audit).toContainText('BOOKING_CREATED');
  await expect(audit).toContainText('front desk');
});
