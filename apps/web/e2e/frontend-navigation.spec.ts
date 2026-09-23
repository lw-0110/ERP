import { expect, test, type Page } from '@playwright/test';

const adminPermissions = [
  'report.read.operations', 'report.read.finance', 'organization.read', 'booking.read.all', 'resource.read', 'staff.read.all',
  'customer.read.all', 'customer.create', 'customer.update.all', 'staff.create', 'staff.update.all', 'service.read', 'service.create', 'service.update',
  'attendance.read.all', 'leave.read.all', 'leave.type.manage', 'payment.read.all', 'commission.read.all', 'commission.rule.manage', 'audit.read',
];
const person = { id: 'record-1', firstName: 'Alex', lastName: 'Lee', displayName: 'Alex Lee', employeeCode: 'S001', name: 'Existing service', email: 'alex@example.test', phone: '12345678', status: 'ACTIVE', durationMinutes: 60, priceMinor: 1000, currency: 'MYR', requiredStaffCount: 1 };

async function setup(page: Page, permissions = adminPermissions) {
  const records: Record<string, typeof person[]> = { customers: [person], staff: [person], services: [person] };
  const calls: string[] = [];
  await page.route('**/backend/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/backend/, '');
    const method = route.request().method();
    if (path === '/identity/me') return route.fulfill({ json: { user: { name: 'Test User', email: 'test@example.test' }, activeOrganization: { name: 'Test Organization' }, role: { name: 'Test Role' }, permissions } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 2 } });
    if (path === '/notifications') return route.fulfill({ json: { items: [{ id: 'note-1', title: 'Reminder', message: 'A booking changed', readAt: null, createdAt: new Date().toISOString() }], total: 1 } });
    if (path === '/notifications/note-1/read' || path === '/notifications/read-all') return route.fulfill({ json: {} });
    if (path === '/reports/dashboard' || path === '/reports/payments') return route.fulfill({ json: { bookings: 2, rows: [] } });
    if (path === '/staff/record-1/invitations') return route.fulfill({ json: [] });
    const module = path.split('/')[1];
    if (module in records) {
      if (method === 'GET') return route.fulfill({ json: { items: records[module] } });
      calls.push(`${method} ${path}`);
      if (method === 'POST') records[module].push({ ...person, id: `record-${records[module].length + 1}`, displayName: 'New record', name: 'New service' });
      return route.fulfill({ json: { id: 'saved' } });
    }
    if (path === '/attendance') return route.fulfill({ json: [{ id: 'attendance-1', workDate: '2026-09-19', clockInAt: '2026-09-19T09:00:00Z', clockOutAt: null, status: 'CLOCKED_IN', staff: { displayName: 'Alex Lee' } }] });
    if (path === '/leave-requests') return route.fulfill({ json: [{ id: 'leave-1', status: 'PENDING', startDateTime: '2026-09-20T09:00:00Z', endDateTime: '2026-09-20T10:00:00Z', reason: 'Personal', adminNote: null, leaveType: { name: 'Annual' }, staff: { displayName: 'Alex Lee' } }] });
    if (path === '/leave-types') return route.fulfill({ json: [] });
    if (path === '/audit-logs') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();
  return calls;
}

test('Admin submenu, active state, notification bell, sales, and session restoration', async ({ page }) => {
  await setup(page);
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await expect(sidebar.getByRole('button', { name: 'My Profile' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Bookings & scheduling' }).click();
  await expect(sidebar.getByRole('button', { name: 'Manage Bookings' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'New Booking' })).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'People & services' }).click();
  await sidebar.getByRole('button', { name: 'Customers' }).click();
  await expect(sidebar.getByRole('button', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(sidebar.getByRole('button', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Reminder');
  await sidebar.getByRole('button', { name: 'Reports & settings' }).click();
  await expect(sidebar.getByRole('button', { name: 'Sales' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Sales' }).click();
  await expect(page.getByLabel('From')).toBeVisible();
  await expect(page.getByLabel('To')).toBeVisible();
});

test('Customers, Staff, and Services use row selection and one create/edit dialog', async ({ page }) => {
  const calls = await setup(page);
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await sidebar.getByRole('button', { name: 'People & services' }).click();
  for (const [name, path] of [['Customers', 'customers'], ['Staff', 'staff'], ['Services', 'services']] as const) {
    await sidebar.getByRole('button', { name, exact: true }).click();
    await page.getByRole('row', { name: /Alex Lee|Existing service/ }).click();
    const title = path === 'customers' ? 'Customer Details' : path === 'staff' ? 'Staff Details' : 'Service Details';
    const detail = page.getByRole('dialog', { name: title });
    await detail.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: path === 'staff' ? 'Edit staff member' : path === 'customers' ? 'Edit customer' : 'Edit service' });
    await expect(edit).toBeVisible();
    await edit.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(edit).not.toBeVisible();
    expect(calls).toContain(`PATCH /${path}/record-1`);
    await detail.getByRole('button', { name: `Close ${title}` }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: path === 'staff' ? 'New staff member' : path === 'customers' ? 'New customer' : 'New service' });
    await expect(dialog).toBeVisible();
    if (path === 'customers') { await dialog.getByLabel('First name').fill('New'); await dialog.getByLabel('Last name').fill('Customer'); await dialog.getByLabel('Display name').fill('New Customer'); await dialog.getByLabel('Email').fill('new.customer@example.test'); await dialog.getByLabel('Phone').fill('12345678'); }
    if (path === 'staff') { await dialog.getByLabel('Employee code').fill('S002'); await dialog.getByLabel('Display name').fill('New Staff'); await dialog.getByLabel('Email').fill('new.staff@example.test'); await dialog.getByLabel('Phone').fill('12345678'); }
    if (path === 'services') await dialog.getByLabel('Service name').fill('New service');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).not.toBeVisible();
    expect(calls).toContain(`POST /${path}`);
    if (await page.getByRole('dialog', { name: title }).isVisible()) await page.getByRole('dialog', { name: title }).getByRole('button', { name: `Close ${title}` }).click();
  }
});

test('Staff and Customer receive only their permitted navigation', async ({ page }) => {
  await setup(page, ['booking.read.assigned', 'attendance.read.own', 'leave.read.own', 'commission.read.own']);
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await expect(sidebar.getByRole('button', { name: 'Attendance & leave' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'People & services' })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: 'Audit Log' })).toHaveCount(0);
  await page.reload();
  await setup(page, ['booking.create.own', 'booking.read.own', 'payment.read.own']);
  await sidebar.getByRole('button', { name: 'Bookings' }).click();
  await expect(sidebar.getByRole('button', { name: 'New Booking' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'My Bookings' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Manage Bookings' })).toHaveCount(0);
  await expect(sidebar.getByRole('button', { name: 'People & services' })).toHaveCount(0);
});

test('Attendance and leave pages are tables, and mobile drawer closes on selection', async ({ page }) => {
  await setup(page);
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await sidebar.getByRole('button', { name: 'Attendance & leave' }).click();
  await sidebar.getByRole('button', { name: 'Attendance', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row', { name: /Alex Lee/ })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Leave Requests' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('row', { name: /Alex Lee/ }).click();
  await expect(page.getByText('Personal')).toBeVisible();
  await page.getByRole('dialog', { name: 'Leave Details' }).getByRole('button', { name: 'Close Leave Details' }).click();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const drawer = page.getByRole('complementary', { name: 'Mobile application sidebar' });
  await drawer.getByRole('button', { name: 'Dashboard' }).click();
  await expect(drawer).not.toBeVisible();
});

test('Responsive cards, status labels and edit sheet fit mobile and desktop viewports', async ({ page }) => {
  await setup(page);
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await sidebar.getByRole('button', { name: 'People & services' }).click();
  await sidebar.getByRole('button', { name: 'Customers' }).click();
  for (const width of [1440, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 820 });
    if (width <= 700) { await expect(page.locator('.mobile-record-card')).toBeVisible(); await page.locator('.mobile-record-card').first().click(); }
    else { await expect(page.getByRole('table')).toBeVisible(); await page.getByRole('row', { name: /Alex Lee/ }).click(); }
    const detail = page.getByRole('dialog', { name: 'Customer Details' });
    await expect(detail).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width <= 700) expect(await detail.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(width);
    await detail.getByRole('button', { name: 'Edit', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Edit customer' });
    await expect(edit).toBeVisible();
    if (width <= 700) expect(await edit.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(width);
    await edit.getByRole('button', { name: 'Close form' }).click();
    await detail.getByRole('button', { name: 'Close Customer Details' }).click();
  }
});

test('Table loading, empty and page error states remain readable', async ({ page }) => {
  await setup(page);
  await page.route('**/backend/customers?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ json: { items: [], total: 0 } });
  });
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await sidebar.getByRole('button', { name: 'People & services' }).click();
  await sidebar.getByRole('button', { name: 'Customers' }).click();
  await expect(page.getByRole('status', { name: 'Loading records' })).toBeVisible();
  await expect(page.getByText('No customers yet.')).toBeVisible();
  await page.route('**/backend/customers?*', (route) => route.fulfill({ status: 500, json: { message: 'Internal server error' } }));
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('Resource create and edit use the shared drawer without changing the request shape', async ({ page }) => {
  await setup(page, [...adminPermissions, 'resource.create', 'resource.update']);
  const calls: string[] = [];
  await page.route('**/backend/resources*', (route) => {
    const method = route.request().method();
    if (method !== 'GET') { calls.push(`${method} ${new URL(route.request().url()).pathname}`); return route.fulfill({ json: {} }); }
    return route.fulfill({ json: [{ id: 'resource-1', name: 'Room A', resourceTypeId: 'type-1', capacity: 2, status: 'ACTIVE' }] });
  });
  await page.route('**/backend/resources/**', (route) => { calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`); return route.fulfill({ json: {} }); });
  await page.route('**/backend/resource-types', (route) => route.fulfill({ json: [{ id: 'type-1', name: 'Room' }] }));
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await sidebar.getByRole('button', { name: 'Bookings & scheduling' }).click();
  await sidebar.getByRole('button', { name: 'Resources' }).click();
  await page.getByRole('row', { name: /Room A/ }).click();
  const detail = page.getByRole('dialog', { name: 'Resource Details' });
  await detail.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit resource' });
  await expect(edit).toBeVisible();
  await edit.getByRole('button', { name: 'Save resource' }).click();
  await expect(edit).not.toBeVisible();
  expect(calls).toContain('PATCH /backend/resources/resource-1');
  await detail.getByRole('button', { name: 'Close Resource Details' }).click();
  await page.getByRole('button', { name: 'New resource' }).click();
  await expect(page.getByRole('dialog', { name: 'New resource' })).toBeVisible();
  await page.getByRole('dialog', { name: 'New resource' }).getByLabel('Resource name').fill('Room B');
  await page.getByRole('dialog', { name: 'New resource' }).getByRole('button', { name: 'Save resource' }).click();
  expect(calls).toContain('POST /backend/resources');
});
