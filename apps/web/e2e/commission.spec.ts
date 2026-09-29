import { expect, test } from '@playwright/test';

test('staff commission shows currency and the saved calculation without a manual entry action', async ({ page }) => {
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    if (path === '/identity/me') return route.fulfill({ json: { user: { id: 'staff-user', name: 'Staff' }, activeOrganization: { name: 'Test' }, permissions: ['commission.read.own'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/commissions/my') return route.fulfill({ json: [{ id: 'earned', amountMinor: 3000, currency: 'MYR', sourceSnapshot: { kind: 'AUTOMATIC', serviceName: 'Massage A', commissionPercentage: '30.00', explanation: 'Automatic commission: 30.00% of RM100.00.' } }] });
    return route.fulfill({ json: [] });
  });
  await page.goto('/#/my-commission');
  await expect(page.locator('.data-table')).toContainText('RM30.00');
  await expect(page.getByRole('button', { name: 'Record Commission' })).toHaveCount(0);
  await page.locator('.data-table tbody tr').click();
  await expect(page.getByRole('dialog', { name: 'Commission Details' })).toContainText('RM30.00');
  await expect(page.getByRole('dialog', { name: 'Commission Details' })).not.toContainText('minor units');
});

test('service editor saves percentage and converts displayed price to minor units', async ({ page }) => {
  let service = { id: 'service-one', name: 'Massage A', durationMinutes: 60, priceMinor: 10000, currency: 'MYR', requiredStaffCount: 1, commissionPercentage: '30.00', status: 'ACTIVE' };
  let saved: Record<string, unknown> | undefined;
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    if (path === '/identity/me') return route.fulfill({ json: { user: { id: 'admin', name: 'Admin' }, activeOrganization: { name: 'Test' }, permissions: ['service.read', 'service.update', 'service.commission.manage'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/services/service-one' && route.request().method() === 'PATCH') {
      saved = route.request().postDataJSON();
      service = { ...service, ...saved };
      return route.fulfill({ json: service });
    }
    if (path === '/services') return route.fulfill({ json: { items: [service], total: 1, pageSize: 20 } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/#/services');
  await expect(page.locator('.data-table')).toContainText('RM100.00');
  await page.locator('.data-table tbody tr').click();
  const details = page.getByRole('dialog', { name: 'Service Details' });
  await details.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit service', exact: true });
  await expect(form.getByLabel('Commission percentage')).toHaveValue('30');
  await form.getByLabel('Commission percentage').fill('35.25');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).not.toBeVisible();
  expect(saved).toMatchObject({ priceMinor: 10000, commissionPercentage: 35.25 });
  await expect(details).toContainText('35.25%');
});
