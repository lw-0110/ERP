import { expect, test, type Page } from '@playwright/test';

type RecordItem = { id: string; displayName?: string; firstName?: string; lastName?: string; name?: string; email?: string; phone?: string; status: string; durationMinutes?: number; priceMinor?: number; currency?: string; requiredStaffCount?: number; employeeCode?: string; accountStatus?: string };

async function mockApp(page: Page, permissions: string[], records: Record<string, RecordItem[]> = {}) {
  await page.route('**/backend/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/backend/, '');
    if (path === '/identity/me') return route.fulfill({ json: { user: { id: 'user-one', name: 'Test User' }, activeOrganization: { name: 'Test Org' }, permissions } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/roles') return route.fulfill({ json: [{ id: 'role-one', name: 'Staff', status: 'ACTIVE' }] });
    if (path.endsWith('/invitations')) return route.fulfill({ json: [] });
    const key = path.split('/')[1];
    if (key in records) {
      if (route.request().method() === 'GET') return route.fulfill({ json: { items: records[key], total: records[key].length, pageSize: 20 } });
      const body = route.request().postDataJSON() as RecordItem;
      if (route.request().method() === 'PATCH') {
        const item = records[key].find((row) => row.id === path.split('/')[2])!;
        Object.assign(item, body);
        return route.fulfill({ json: item });
      }
      if (route.request().method() === 'POST') {
        const item = { ...body, id: `new-${records[key].length}`, status: 'ACTIVE' };
        records[key].push(item);
        return route.fulfill({ json: item });
      }
    }
    return route.fulfill({ json: [] });
  });
}

test('read-only customer opens details but cannot edit or create', async ({ page }) => {
  await mockApp(page, ['customer.read.all'], { customers: [{ id: 'c1', firstName: 'John', lastName: 'Tan', displayName: 'John Tan', phone: '0123456789', email: 'john@example.test', status: 'ACTIVE' }] });
  await page.goto('/#/customers');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0);
  await page.locator('.data-table tbody tr').click();
  const detail = page.getByRole('dialog', { name: 'Customer Details' });
  await expect(detail).toContainText('John Tan');
  await expect(detail).toContainText('0123456789');
  await expect(detail.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Close Customer Details' }).click();
  await expect(detail).not.toBeVisible();
});

test('customer edit saves and returns to refreshed read-only view', async ({ page }) => {
  const records = { customers: [{ id: 'c1', firstName: 'John', lastName: 'Tan', displayName: 'John Tan', phone: '0123456789', email: 'john@example.test', status: 'ACTIVE' }] };
  await mockApp(page, ['customer.read.all', 'customer.create', 'customer.update.all'], records);
  await page.goto('/#/customers');
  await page.locator('.data-table tbody tr').click();
  const detail = page.getByRole('dialog', { name: 'Customer Details' });
  await expect(detail.locator('input')).toHaveCount(0);
  await detail.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit customer' });
  await edit.getByLabel('Display name').fill('John Updated');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).not.toBeVisible();
  await expect(detail).toContainText('John Updated');
  await detail.getByRole('button', { name: 'Close Customer Details' }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New customer' })).toBeVisible();
});

test('staff and service details respect action permissions', async ({ page }) => {
  await mockApp(page, ['staff.read.all', 'service.read'], {
    staff: [{ id: 's1', displayName: 'Maya Lee', employeeCode: 'S1', phone: '0111111111', email: 'maya@example.test', status: 'ACTIVE', accountStatus: 'No Account' }],
    services: [{ id: 'v1', name: 'Massage', durationMinutes: 60, priceMinor: 5000, currency: 'MYR', requiredStaffCount: 1, status: 'ACTIVE' }],
  });
  await page.goto('/#/staff-people');
  await page.locator('.data-table tbody tr').click();
  const staffDetail = page.getByRole('dialog', { name: 'Staff Details' });
  await expect(staffDetail).toContainText('Maya Lee');
  await expect(staffDetail.getByRole('button', { name: 'Create & Invite Account' })).toHaveCount(0);
  await staffDetail.getByRole('button', { name: 'Close Staff Details' }).click();
  await page.goto('/#/services');
  await page.locator('.data-table tbody tr').click();
  const serviceDetail = page.getByRole('dialog', { name: 'Service Details' });
  await expect(serviceDetail).toContainText('Massage');
  await expect(serviceDetail.getByRole('button', { name: 'Edit' })).toHaveCount(0);
});

test('staff invitation is an explicit action only for an invited-capable role', async ({ page }) => {
  await mockApp(page, ['staff.read.all', 'staff.invite', 'role.read', 'role.update'], { staff: [{ id: 's1', displayName: 'Maya Lee', employeeCode: 'S1', phone: '0111111111', email: 'maya@example.test', status: 'ACTIVE', accountStatus: 'No Account' }] });
  await page.goto('/#/staff-people');
  await page.locator('.data-table tbody tr').click();
  const detail = page.getByRole('dialog', { name: 'Staff Details' });
  await detail.getByRole('button', { name: 'Create & Invite Account' }).click();
  const action = page.getByRole('dialog', { name: 'Create & Invite Account' });
  await expect(action.getByLabel('Role')).toBeVisible();
  await action.getByRole('button', { name: 'Cancel' }).click();
  await expect(detail).toBeVisible();
});

test('service update action opens a separate form and returns to detail', async ({ page }) => {
  await mockApp(page, ['service.read', 'service.update'], { services: [{ id: 'v1', name: 'Massage', durationMinutes: 60, priceMinor: 5000, currency: 'MYR', requiredStaffCount: 1, status: 'ACTIVE' }] });
  await page.goto('/#/services');
  await page.locator('.data-table tbody tr').click();
  const detail = page.getByRole('dialog', { name: 'Service Details' });
  await detail.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit service' });
  await edit.getByLabel('Service name').fill('Updated Massage');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(detail).toContainText('Updated Massage');
});

test('responsive cards and detail sheet fit 1440, 1024, 430, and 390px', async ({ page }) => {
  await mockApp(page, ['customer.read.all'], { customers: [{ id: 'c1', firstName: 'John', lastName: 'Tan', displayName: 'John Tan', phone: '0123456789', email: 'john@example.test', status: 'ACTIVE' }] });
  for (const width of [1440, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/#/customers');
    const card = page.locator('.mobile-record-card');
    if (width <= 700) { await expect(card).toBeVisible(); await card.click(); }
    else { await expect(page.locator('.data-table')).toBeVisible(); await page.locator('.data-table tbody tr').click(); }
    const detail = page.getByRole('dialog', { name: 'Customer Details' });
    await expect(detail).toBeVisible();
    const dimensions = await detail.evaluate((element) => ({ width: element.getBoundingClientRect().width, pageWidth: document.documentElement.scrollWidth }));
    expect(dimensions.width).toBeLessThanOrEqual(width);
    expect(dimensions.pageWidth).toBeLessThanOrEqual(width);
    if (width <= 700) expect(dimensions.width).toBeGreaterThan(width - 2);
    else { expect(dimensions.width).toBeGreaterThanOrEqual(480); expect(dimensions.width).toBeLessThanOrEqual(640); }
    await detail.getByRole('button', { name: 'Close Customer Details' }).click();
  }
});
