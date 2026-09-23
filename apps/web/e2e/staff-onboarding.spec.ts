import { expect, test } from '@playwright/test';

test('staff creation binds the selected active role to a one-time invitation and later changes membership role', async ({ page }) => {
  const roles = [{ id: 'role-reception', name: 'Receptionist', status: 'ACTIVE' }, { id: 'role-staff', name: 'Staff', status: 'ACTIVE' }, { id: 'role-old', name: 'Old role', status: 'ARCHIVED' }];
  const items: Record<string, unknown>[] = [];
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    const method = route.request().method();
    if (path === '/identity/me') return route.fulfill({ json: { user: { name: 'Admin' }, activeOrganization: { name: 'Local' }, role: { name: 'Admin' }, permissions: ['staff.read.all', 'staff.create', 'staff.update.all', 'staff.invite', 'role.read', 'role.update'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/roles') return route.fulfill({ json: roles });
    if (path === '/staff' && method === 'GET') return route.fulfill({ json: { items, total: items.length, pageSize: 20 } });
    if (path === '/staff/create-and-invite' && method === 'POST') { const body = route.request().postDataJSON(); calls.push({ path, body }); const staff = { id: 'staff-one', ...body, status: 'ACTIVE', userId: null, roleId: body.roleId, roleName: 'Receptionist', accountStatus: 'Invitation Active' }; items.push(staff); return route.fulfill({ status: 201, json: { staff, invitation: { id: 'invite-one', expiresAt: '2030-01-01T00:00:00Z' }, invitationUrl: 'http://localhost:5173/staff-invitation?token=single-use-secret' } }); }
    if (path === '/staff/staff-one' && method === 'PATCH') { const body = route.request().postDataJSON(); calls.push({ path, body }); Object.assign(items[0], body); return route.fulfill({ json: items[0] }); }
    if (path === '/staff/staff-one/invitations' && method === 'POST') { const body = route.request().postDataJSON(); calls.push({ path, body }); Object.assign(items[0], { roleId: body.roleId, roleName: roles.find((role) => role.id === body.roleId)?.name, accountStatus: 'Invitation Active' }); return route.fulfill({ status: 201, json: { id: 'invite-one', invitation: { expiresAt: '2030-01-01T00:00:00Z' }, invitationUrl: 'http://localhost:5173/staff-invitation?token=single-use-secret' } }); }
    if (path === '/staff/staff-one/invitations' && method === 'GET') return route.fulfill({ json: [{ id: 'invite-one', roleId: 'role-reception', role: { name: 'Receptionist' }, status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z' }] });
    if (path === '/memberships/membership-one/role' && method === 'PATCH') { const body = route.request().postDataJSON(); calls.push({ path, body }); Object.assign(items[0], { roleId: body.roleId, roleName: roles.find((role) => role.id === body.roleId)?.name }); return route.fulfill({ json: { id: 'membership-one', roleId: body.roleId } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/#/staff-people');
  await page.getByRole('button', { name: 'New' }).click();
  const form = page.getByRole('dialog', { name: 'New staff member' });
  await form.getByLabel('Employee code').fill('R-1');
  await form.getByLabel('Display name').fill('John Tan');
  await form.getByLabel('Email').fill('john@example.test');
  await form.getByLabel('Phone').fill('0123456789');
  await expect(form.getByRole('option', { name: 'Old role' })).toHaveCount(0);
  await form.getByLabel('Role').selectOption('role-reception');
  await form.getByRole('button', { name: 'Create Staff & Invite' }).click();
  await expect(page.getByRole('dialog', { name: 'Staff created and invitation generated' })).toBeVisible();
  expect(calls.map((call) => call.path)).toEqual(['/staff/create-and-invite']);
  expect(calls[0].body).toMatchObject({ roleId: 'role-reception' });
  await expect(page.getByRole('row', { name: /John Tan/ })).toContainText('Invitation Active');
  await expect(page.getByLabel('Staff invitation URL')).toHaveValue(/single-use-secret/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy Link' }).click();
  await expect(page.getByText('Invitation link copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('single-use-secret');
  await page.getByRole('button', { name: 'Done' }).click();
  Object.assign(items[0], { userId: 'user-one', membershipId: 'membership-one', accountStatus: 'Account Active' });
  await page.reload();
  await page.getByRole('row', { name: /John Tan/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit staff member' });
  await edit.getByLabel('Role').selectOption('role-staff');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('row', { name: /John Tan/ })).toContainText('Staff');
  expect(calls.at(-1)).toEqual({ path: '/memberships/membership-one/role', body: { roleId: 'role-staff' } });
});

test('activation shows fixed email and role and requires matching password confirmation', async ({ page }) => {
  let redeemed = false;
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    if (path === '/staff-invitations/validate') return route.fulfill({ json: { valid: true, staffDisplayName: 'John Tan', email: 'john@example.test', roleName: 'Receptionist', expiresAt: '2030-01-01T00:00:00Z', existingAccount: false } });
    if (path === '/staff-invitations/redeem') { redeemed = true; return route.fulfill({ status: 201, json: { activated: true } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto('/staff-invitation?token=single-use-secret');
  await expect(page.getByLabel('Email')).toHaveValue('john@example.test');
  await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');
  await expect(page.getByText('Role:')).toContainText('Receptionist');
  await expect(page.getByLabel('Role')).toHaveCount(0);
  await page.getByLabel('Name').fill('John Tan');
  await page.getByLabel('Password', { exact: true }).fill('StrongPassw0rd!');
  await page.getByLabel('Confirm password').fill('DifferentPassw0rd!');
  await page.getByRole('button', { name: 'Activate staff account' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  expect(redeemed).toBe(false);
  await page.getByLabel('Confirm password').fill('StrongPassw0rd!');
  await page.getByRole('button', { name: 'Activate staff account' }).click();
  await expect(page.getByRole('heading', { name: 'Staff account activated' })).toBeVisible();
  expect(redeemed).toBe(true);
});

test('new staff remains visible with the one-time invitation link when it would be outside the first page', async ({ page }) => {
  const existing = Array.from({ length: 20 }, (_, index) => ({ id: `existing-${index}`, employeeCode: `A-${index}`, displayName: `A Staff ${index}`, email: `a${index}@example.test`, status: 'ACTIVE', accountStatus: 'No Account' }));
  const items: Record<string, unknown>[] = [...existing];
  await page.route('**/backend/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/backend/, '');
    const method = route.request().method();
    if (path === '/identity/me') return route.fulfill({ json: { user: { name: 'Admin' }, activeOrganization: { name: 'Local' }, permissions: ['staff.read.all', 'staff.create', 'staff.invite', 'role.read', 'role.update'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/roles') return route.fulfill({ json: [{ id: 'receptionist-role', name: 'Receptionist', status: 'ACTIVE' }] });
    if (path === '/staff' && method === 'GET') {
      const search = url.searchParams.get('search')?.toLowerCase();
      const matches = search ? items.filter((item) => String(item.employeeCode).toLowerCase().includes(search)) : items;
      return route.fulfill({ json: { items: matches.slice(0, 20), total: matches.length, pageSize: 20 } });
    }
    if (path === '/staff/create-and-invite' && method === 'POST') {
      const staff = { id: 'new-staff', ...route.request().postDataJSON(), status: 'ACTIVE', userId: null, accountStatus: 'No Account' };
      Object.assign(staff, { roleName: 'Receptionist', accountStatus: 'Invitation Active' });
      items.push(staff);
      return route.fulfill({ status: 201, json: { staff, invitation: { expiresAt: '2030-01-01T00:00:00Z' }, invitationUrl: 'http://localhost:5173/staff-invitation?token=copy-me' } });
    }
    if (path === '/staff/new-staff/invitations' && method === 'POST') {
      Object.assign(items.at(-1)!, { roleName: 'Receptionist', roleId: 'receptionist-role', accountStatus: 'Invited' });
      return route.fulfill({ status: 201, json: { invitationUrl: 'http://localhost:5173/staff-invitation?token=copy-me' } });
    }
    if (path === '/staff/new-staff/invitations' && method === 'GET') return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  await page.goto('/#/staff-people');
  await page.getByRole('button', { name: 'New' }).click();
  const form = page.getByRole('dialog', { name: 'New staff member' });
  await form.getByRole('button', { name: 'Save Profile Only' }).click();
  await expect(form.getByRole('alert')).toContainText('Complete Employee code');
  await form.getByLabel('Employee code').fill('Z-NEW');
  await form.getByLabel('Display name').fill('Z New Staff');
  await form.getByLabel('Email').fill('new@example.test');
  await form.getByLabel('Phone').fill('0123456789');
  await form.getByLabel('Role').selectOption('receptionist-role');
  await form.getByRole('button', { name: 'Create Staff & Invite' }).click();
  await expect(page.getByLabel('Find staff by name, email or employee code')).toHaveValue('Z-NEW');
  await expect(page.getByRole('row', { name: /Z New Staff/ })).toContainText('Invitation Active');
  await expect(page.getByLabel('Staff invitation URL')).toHaveValue(/copy-me/);
});

test('Save Profile Only never submits a role or invitation, and invite requires a role', async ({ page }) => {
  const calls: string[] = [];
  await page.route('**/backend/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/backend/, '');
    if (path === '/identity/me') return route.fulfill({ json: { user: { name: 'Admin' }, activeOrganization: { name: 'Local' }, permissions: ['staff.read.all', 'staff.create', 'staff.invite', 'role.read', 'role.update'] } });
    if (path === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (path === '/roles') return route.fulfill({ json: [{ id: 'role-one', name: 'Receptionist', status: 'ACTIVE' }] });
    if (path === '/staff' && route.request().method() === 'GET') return route.fulfill({ json: { items: [], total: 0, pageSize: 20 } });
    if (path === '/staff' && route.request().method() === 'POST') { calls.push(path); expect(route.request().postDataJSON()).not.toHaveProperty('roleId'); return route.fulfill({ status: 201, json: { id: 'profile-only', ...route.request().postDataJSON(), accountStatus: 'No Account' } }); }
    if (path.includes('/invitations') || path === '/staff/create-and-invite') calls.push(path);
    return route.fulfill({ json: [] });
  });
  await page.goto('/#/staff-people');
  await page.getByRole('button', { name: 'New' }).click();
  const form = page.getByRole('dialog', { name: 'New staff member' });
  await expect(form.getByRole('button', { name: 'Create Staff & Invite' })).toBeDisabled();
  await form.getByLabel('Employee code').fill('PROFILE-ONLY');
  await form.getByLabel('Display name').fill('Profile Only');
  await form.getByLabel('Email').fill('profile@example.test');
  await form.getByLabel('Phone').fill('0123456789');
  await form.getByLabel('Role').selectOption('role-one');
  await form.getByRole('button', { name: 'Save Profile Only' }).click();
  await expect(page.getByText('Staff profile saved. No login account has been created.')).toBeVisible();
  expect(calls).toEqual(['/staff']);
});
