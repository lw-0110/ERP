import { expect, test, type Page } from '@playwright/test';

type Assignment = { staffId: string; status: 'ACTIVE' | 'INVALIDATED'; staff: { displayName: string } };
const people = [{ id: 'staff-one', displayName: 'John Tan', recommended: true }, { id: 'staff-two', displayName: 'Maya Lee', recommended: false }];

async function setup(page: Page, starting: Assignment[] = [], failAssignment = false) {
  const booking = { id: 'booking-one', bookingNumber: 'BK-ASSIGN-1', startDateTime: '2030-01-07T02:00:00.000Z', endDateTime: '2030-01-07T03:00:00.000Z', status: 'CONFIRMED', paymentStatus: 'UNPAID', services: [{ id: 'line-one', sortOrder: 0, staffAssignments: [...starting] }] };
  const putBodies: { ids: string[] }[] = [];
  let detailReads = 0;
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    const method = route.request().method();
    if (path === '/identity/me') return route.fulfill({ json: { user: { name: 'Admin' }, activeOrganization: { name: 'Local' }, permissions: ['booking.read.all', 'booking.assign_staff'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/bookings' && method === 'GET') return route.fulfill({ json: [booking] });
    if (path === '/bookings/booking-one' && method === 'GET') { detailReads += 1; return route.fulfill({ json: booking }); }
    if (path === '/bookings/booking-one/services/line-one/eligible-staff') return route.fulfill({ json: people });
    if (path === '/bookings/booking-one/services/line-one/staff' && method === 'PUT') {
      const body = route.request().postDataJSON() as { ids: string[] };
      putBodies.push(body);
      if (failAssignment) return route.fulfill({ status: 409, json: { code: 'STAFF_ASSIGNMENT_CONFLICT' } });
      booking.services[0].staffAssignments = [
        ...booking.services[0].staffAssignments.map((item) => ({ ...item, status: 'INVALIDATED' as const })),
        ...body.ids.map((id) => ({ staffId: id, status: 'ACTIVE' as const, staff: { displayName: people.find((person) => person.id === id)!.displayName } })),
      ];
      return route.fulfill({ json: { assignments: booking.services[0].staffAssignments.filter((item) => item.status === 'ACTIVE'), warnings: body.ids.includes('staff-two') ? ['Skill mismatch is advisory.'] : [] } });
    }
    if (path === '/staff') return route.fulfill({ json: { items: people } });
    if (path === '/resources' || path === '/resource-types') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/#/bookings');
  if (page.viewportSize()!.width <= 700) await page.locator('.mobile-record-card').first().click();
  else await page.locator('.data-table tbody tr').first().click();
  return { booking, putBodies, detailReads: () => detailReads };
}

test('unassigned booking requires selection, then refreshes detail and keeps ACTIVE staff selected after reopening', async ({ page }) => {
  const state = await setup(page);
  const detail = page.getByRole('dialog', { name: 'Booking Details' });
  await expect(page.getByText('BK-ASSIGN-1')).toHaveCount(0);
  await expect(page.locator('.data-table tbody tr').first().locator('td').first()).toHaveText('1');
  await expect(detail).toContainText('Not assigned');
  await detail.getByRole('button', { name: 'Assign Staff', exact: true }).click();
  const control = page.locator('.staff-assignment-control');
  await expect(control.getByText('Not assigned')).toBeVisible();
  await expect(control.getByRole('button', { name: 'Assign staff', exact: true })).toBeDisabled();
  expect(state.putBodies).toEqual([]);
  await control.getByLabel('Choose staff').selectOption('staff-one');
  await control.getByRole('button', { name: 'Assign staff', exact: true }).click();
  await expect(detail.getByText('Staff assigned successfully.')).toBeVisible();
  await expect(detail).toContainText('John Tan');
  expect(state.putBodies).toEqual([{ ids: ['staff-one'] }]);
  expect(state.detailReads()).toBeGreaterThan(0);
  await page.reload();
  await page.locator('.data-table tbody tr').first().click();
  await expect(detail).toContainText('John Tan');
  await detail.getByRole('button', { name: 'Assign Staff', exact: true }).click();
  await expect(page.getByLabel('Choose staff')).toHaveValue('staff-one');
  await expect(control.getByRole('button', { name: 'Assign staff', exact: true })).toBeDisabled();
});

test('mobile booking card is a summary and opens a full-width detail sheet', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 800 });
  await setup(page);
  const detail = page.getByRole('dialog', { name: 'Booking Details' });
  await expect(detail).toBeVisible();
  await expect(page.locator('.mobile-record-card')).toHaveCount(1);
  await expect(page.getByText('BK-ASSIGN-1')).toHaveCount(0);
  expect(await detail.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(428);
});

test('only ACTIVE assignment appears; change warns and unassign needs explicit confirmation', async ({ page }) => {
  const state = await setup(page, [{ staffId: 'staff-one', status: 'ACTIVE', staff: { displayName: 'John Tan' } }, { staffId: 'old-staff', status: 'INVALIDATED', staff: { displayName: 'Historical Staff' } }]);
  const detail = page.getByRole('dialog', { name: 'Booking Details' });
  await expect(detail).toContainText('John Tan');
  await expect(detail).not.toContainText('Historical Staff');
  await detail.getByRole('button', { name: 'Assign Staff', exact: true }).click();
  const control = page.locator('.staff-assignment-control');
  await expect(control.locator('p')).toContainText('John Tan');
  await expect(control.locator('p')).not.toContainText('Historical Staff');
  await expect(control.getByLabel('Choose staff')).toHaveValue('staff-one');
  await control.getByLabel('Choose staff').selectOption('staff-two');
  await control.getByRole('button', { name: 'Assign staff', exact: true }).click();
  await expect(detail.getByText(/Staff assignment updated successfully/)).toBeVisible();
  await expect(detail.getByText(/Skill mismatch is advisory/)).toBeVisible();
  await expect(detail).toContainText('Maya Lee');
  await detail.getByRole('button', { name: 'Unassign Staff' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Unassign Staff' });
  await expect(confirmation.getByText('Remove Maya Lee from this booking?')).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  expect(state.putBodies).toEqual([{ ids: ['staff-two'] }]);
  await detail.getByRole('button', { name: 'Unassign Staff' }).click();
  await confirmation.getByRole('button', { name: 'Unassign', exact: true }).click();
  await expect(detail.getByText('Staff unassigned successfully.')).toBeVisible();
  await expect(detail).toContainText('Not assigned');
  expect(state.putBodies).toEqual([{ ids: ['staff-two'] }, { ids: [] }]);
});

test('failed assignment keeps the current staff visible and shows a friendly error', async ({ page }) => {
  const state = await setup(page, [{ staffId: 'staff-one', status: 'ACTIVE', staff: { displayName: 'John Tan' } }], true);
  const detail = page.getByRole('dialog', { name: 'Booking Details' });
  await detail.getByRole('button', { name: 'Assign Staff', exact: true }).click();
  const control = page.locator('.staff-assignment-control');
  await control.getByLabel('Choose staff').selectOption('staff-two');
  await control.getByRole('button', { name: 'Assign staff', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Assign Staff' }).getByRole('alert')).toContainText('already has another assignment');
  await expect(control.locator('p')).toContainText('John Tan');
  expect(state.putBodies).toEqual([{ ids: ['staff-two'] }]);
  expect(state.detailReads()).toBe(0);
});
