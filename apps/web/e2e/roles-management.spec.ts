import { expect, test, type Page } from '@playwright/test';

const catalogue = [
  { id: 'permission-role-read', key: 'role.read', module: 'role', description: 'Read organization roles.' },
  { id: 'permission-booking-read', key: 'booking.read.all', module: 'booking', description: 'Read all bookings.' },
  { id: 'permission-customer-read', key: 'customer.read.all', module: 'customer', description: 'Read customers.' },
];
const management = ['role.read', 'role.create', 'role.update', 'role.archive', 'role.permission.manage', 'organization.read', 'report.read.finance'];
type Role = { id: string; name: string; description: string; status: string; isSystemDefault: boolean; permissionKeys: string[]; permissionCount: number; memberCount: number; createdAt: string; updatedAt: string };
const date = '2026-09-19T08:00:00.000Z';
function role(id: string, name: string, keys: string[], memberCount = 0): Role { return { id, name, description: '', status: 'ACTIVE', isSystemDefault: false, permissionKeys: keys, permissionCount: keys.length, memberCount, createdAt: date, updatedAt: date }; }

async function setup(page: Page, permissions = management) {
  const roles = [role('role-admin', 'Admin', management, 1), role('role-staff', 'Staff', ['booking.read.all'], 1)];
  const members = [{ id: 'membership-admin', userId: 'user-admin', roleId: 'role-admin', status: 'ACTIVE', user: { name: 'Local Admin', email: 'admin@example.test' }, role: { name: 'Admin', status: 'ACTIVE' } }, { id: 'membership-alex', userId: 'user-alex', roleId: 'role-staff', status: 'ACTIVE', user: { name: 'Alex Lee', email: 'alex@example.test' }, role: { name: 'Staff', status: 'ACTIVE' } }];
  const calls: string[] = [];
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    const method = route.request().method();
    if (path === '/identity/me') return route.fulfill({ json: { user: { id: 'user-admin', name: 'Local Admin' }, activeMembership: { id: 'membership-admin' }, activeOrganization: { name: 'Example Organization' }, role: { id: 'role-admin', name: 'Admin' }, permissions } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/permissions') return route.fulfill({ json: catalogue });
    if (path === '/roles' && method === 'GET') return route.fulfill({ json: roles });
    if (path === '/memberships' && method === 'GET') return route.fulfill({ json: members });
    if (path === '/roles' && method === 'POST') { const body = route.request().postDataJSON(); calls.push('POST /roles'); const created = role('role-new', body.name, body.permissionKeys); created.description = body.description; roles.push(created); return route.fulfill({ status: 201, json: created }); }
    if (path.startsWith('/roles/') && method === 'PATCH') { const id = path.split('/')[2]; const item = roles.find((candidate) => candidate.id === id)!; if (path.endsWith('/archive')) { calls.push('PATCH /roles/archive'); item.status = 'ARCHIVED'; } else { const body = route.request().postDataJSON(); calls.push('PATCH /roles'); item.name = body.name; item.description = body.description; item.permissionKeys = body.permissionKeys; item.permissionCount = body.permissionKeys.length; } return route.fulfill({ json: item }); }
    if (path.startsWith('/memberships/') && method === 'PATCH') { const body = route.request().postDataJSON(); calls.push('PATCH /memberships/role'); const item = members.find((candidate) => candidate.id === path.split('/')[2])!; item.roleId = body.roleId; item.role = { name: roles.find((candidate) => candidate.id === body.roleId)!.name, status: 'ACTIVE' }; return route.fulfill({ json: item }); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  return { calls, roles };
}

test('authorized role management creates, edits, archives and assigns roles', async ({ page }) => {
  const { calls, roles } = await setup(page);
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await sidebar.getByRole('button', { name: 'Reports & settings' }).click();
  await sidebar.getByRole('button', { name: 'Roles & Permissions' }).click();
  await expect(page.getByRole('row', { name: /Admin/ })).toBeVisible();
  await page.getByRole('button', { name: 'New Role' }).click();
  const drawer = page.getByRole('dialog', { name: 'New Role' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Role name').fill('Receptionist');
  await drawer.getByLabel('Search permissions').fill('View all bookings');
  await expect(drawer.getByText('See all bookings in this organization.')).toBeVisible();
  await drawer.getByLabel('Search permissions').fill('See all bookings');
  await expect(drawer.getByText('View all bookings')).toBeVisible();
  await drawer.getByLabel('Search permissions').fill('booking.read.all');
  await expect(drawer.getByText('View all bookings')).toBeVisible();
  await expect(drawer.getByText('booking.read.all')).toHaveCount(0);
  await drawer.locator('input[type="checkbox"]').check();
  await drawer.getByRole('button', { name: 'Save Role' }).click();
  await expect(page.getByText('Role created successfully.')).toBeVisible();
  expect(calls).toContain('POST /roles');
  expect(roles.find((role) => role.id === 'role-new')?.permissionKeys).toEqual(['booking.read.all']);
  const roleDetail = page.getByRole('dialog', { name: 'Role Details' });
  await expect(roleDetail.getByText('View all bookings')).toBeVisible();
  await expect(roleDetail.getByText('booking.read.all')).toHaveCount(0);
  await roleDetail.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Role' });
  await edit.getByLabel('Role name').fill('Reception Lead');
  await edit.getByRole('button', { name: 'Save Role' }).click();
  await expect(page.getByText('Role updated successfully.')).toBeVisible();
  expect(calls).toContain('PATCH /roles');
  page.once('dialog', (dialog) => dialog.accept());
  await roleDetail.getByRole('button', { name: 'Archive role' }).click();
  await expect(page.getByText('Role archived successfully.')).toBeVisible();
  expect(calls).toContain('PATCH /roles/archive');
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('row', { name: /Alex Lee/ }).click();
  await page.getByRole('dialog', { name: 'Member Details' }).getByRole('button', { name: 'Change Role' }).click();
  const assignment = page.getByRole('dialog', { name: 'Change Member Role' });
  await assignment.getByLabel('Change role').selectOption('role-admin');
  await assignment.getByRole('button', { name: 'Save role assignment' }).click();
  await expect(page.getByText(/Member role updated successfully/)).toBeVisible();
  expect(calls).toContain('PATCH /memberships/role');
});

test('unauthorized identity cannot reach role management', async ({ page }) => {
  await setup(page, ['booking.read.all']);
  await expect(page.getByRole('button', { name: 'Roles & Permissions' })).toHaveCount(0);
  await page.goto('/#/roles');
  await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();
});

test('mobile role list uses cards and a full-width permission sheet', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const navigation = page.getByRole('complementary', { name: 'Mobile application sidebar' });
  await navigation.getByRole('button', { name: 'Reports & settings' }).click();
  await navigation.getByRole('button', { name: 'Roles & Permissions' }).click();
  await expect(navigation).not.toBeVisible();
  await expect(page.locator('.mobile-record-card').filter({ hasText: 'Admin' })).toBeVisible();
  await page.getByRole('button', { name: 'New Role' }).click();
  await expect(page.getByRole('dialog', { name: 'New Role' })).toHaveCSS('width', '390px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('role drawer keeps header and footer outside the scrolling permission body', async ({ page }) => {
  await setup(page);
  await page.route('**/backend/permissions', (route) => route.fulfill({ json: Array.from({ length: 60 }, (_, index) => ({ id: `permission-${index}`, key: `booking.example_${index}`, module: 'booking', description: `Booking permission ${index}` })) }));
  for (const width of [1440, 1024, 430, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/#/roles');
    await page.getByRole('button', { name: 'New Role' }).click();
    const dialog = page.getByRole('dialog', { name: 'New Role' });
    const body = dialog.locator('.role-drawer-body');
    const footer = dialog.locator('.role-drawer-footer');
    const header = dialog.locator('.dialog-header');
    const before = await header.boundingBox();
    const bottom = await footer.boundingBox();
    const scrollable = await body.evaluate((element) => element.scrollHeight > element.clientHeight);
    expect(scrollable).toBe(true);
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const last = await dialog.locator('.permission-option').last().boundingBox();
    expect(Math.round((await header.boundingBox())!.y)).toBe(Math.round(before!.y));
    expect(Math.round((await footer.boundingBox())!.y)).toBe(Math.round(bottom!.y));
    expect(last!.y + last!.height).toBeLessThanOrEqual(bottom!.y);
    const buttons = footer.getByRole('button');
    const cancel = await buttons.nth(0).boundingBox();
    const save = await buttons.nth(1).boundingBox();
    expect(cancel!.width).toBe(save!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  }
});
