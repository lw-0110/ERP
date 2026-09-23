import { expect, test } from '@playwright/test';

test('receptionist searches, reviews duplicates, quick-creates and books a customer', async ({ page }) => {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const existing = { id: 'customer-existing', displayName: 'Aina Tan', phone: '+60123456789', email: 'aina@example.test', status: 'ACTIVE', completedVisitCount: 2, lastCompletedVisit: '2026-09-12T10:00:00Z' };
  await page.route('**/backend/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/backend/, '');
    if (path === '/identity/me') return route.fulfill({ json: { user: { name: 'Reception' }, activeOrganization: { name: 'Local' }, role: { name: 'Front Desk' }, permissions: ['booking.create.all', 'customer.read.all', 'customer.create', 'service.read'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/services') return route.fulfill({ json: { items: [{ id: 'service-one', name: 'Consultation', durationMinutes: 30 }] } });
    if (path === '/customers/booking-search') return route.fulfill({ json: ['0123456789', '+60123456789', 'Aina'].some((value) => url.searchParams.get('q')?.includes(value)) ? [existing] : [] });
    if (path === '/customers' && route.request().method() === 'POST') { calls.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ status: 201, json: { id: 'customer-new', ...route.request().postDataJSON(), status: 'ACTIVE', completedVisitCount: 0, lastCompletedVisit: null } }); }
    if (path === '/availability/check-for-customer') return route.fulfill({ json: { available: true } });
    if (path === '/bookings/for-customer') { calls.push({ path, body: route.request().postDataJSON() }); return route.fulfill({ status: 201, json: { id: 'booking-one' } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/#/book');
  await page.getByLabel('Search phone, customer name or email').fill('0123456789');
  await expect(page.getByText('Aina Tan')).toBeVisible();
  await expect(page.getByText(/Total visits: 2/)).toBeVisible();
  await page.getByRole('button', { name: 'Select' }).click();
  await expect(page.getByText('Service, date and time')).toBeVisible();
  await page.getByRole('button', { name: 'Change customer' }).click();
  await page.getByRole('button', { name: '+ Create New Customer' }).click();
  await page.getByLabel('First name').fill('New');
  await page.getByLabel('Last name').fill('Guest');
  await page.getByLabel('Phone', { exact: true }).fill('0123456789');
  await page.getByLabel('Email', { exact: true }).fill('new@example.test');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByText(/similar phone number or email/)).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Create anyway' }).click();
  await expect(page.getByText('Customer created. Continue with the booking.')).toBeVisible();
  await page.getByLabel('Choose services (in order)').selectOption('service-one');
  await page.getByLabel('Start time').fill('2030-01-14T10:00');
  await page.getByRole('button', { name: 'Check availability and confirm booking' }).click();
  await expect(page.getByText('Booking created for New Guest.')).toBeVisible();
  expect(calls.map((call) => call.path)).toEqual(['/customers', '/bookings/for-customer']);
  expect(calls[1].body.customerId).toBe('customer-new');
});
