import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const tag = `live-staff-${randomUUID()}`;
const adminEmail = `${tag}-admin@example.test`;
const staffEmail = `${tag}-receptionist@example.test`;
const roleName = `${tag}-Receptionist`;
const employeeCode = `${tag}-S1`;
const password = 'StrongPassw0rd!';
const api = 'http://127.0.0.1:5173/backend';

test('real browser: role → atomic Staff invite → incognito redemption → permission-aware login', async ({ page, browser }) => {
  process.env.DATABASE_URL ??= 'postgresql://platform:platform@localhost:5432/platform?schema=public';
  const { prisma } = await import('../../api/src/auth/prisma.js');
  let staffContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const signup = await fetch(`${api}/api/auth/sign-up/email`, { method: 'POST', headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' }, body: JSON.stringify({ email: adminEmail, name: 'Live Onboarding Admin', password }) });
    expect(signup.status, await signup.text()).toBe(200);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: 'development' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId: organization.id, name: 'Admin' } } });
    await prisma.membership.update({ where: { userId_organizationId: { userId: admin.id, organizationId: organization.id } }, data: { roleId: adminRole.id } });

    await page.goto('/');
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: 'New Role' })).toHaveCount(0);
    await page.goto('/#/roles');
    await page.getByRole('button', { name: 'New Role' }).click();
    const roleForm = page.getByRole('dialog', { name: 'New Role' });
    await roleForm.getByLabel('Role name').fill(roleName);
    await roleForm.getByLabel('Search permissions').fill('customer.read.all');
    await roleForm.locator('.permission-option[title="customer.read.all"] input').check();
    await roleForm.getByRole('button', { name: 'Save Role' }).click();
    await expect(page.getByText('Role created successfully.')).toBeVisible();

    await page.goto('/#/staff-people');
    await page.getByRole('button', { name: 'New' }).click();
    const staffForm = page.getByRole('dialog', { name: 'New staff member' });
    await staffForm.getByLabel('Employee code').fill(employeeCode);
    await staffForm.getByLabel('Display name').fill('Live Receptionist');
    await staffForm.getByLabel('Email').fill(staffEmail);
    await staffForm.getByLabel('Phone').fill('0123456789');
    await staffForm.getByLabel('Role').selectOption({ label: roleName });
    await staffForm.getByRole('button', { name: 'Create Staff & Invite' }).click();
    const success = page.getByRole('dialog', { name: 'Staff created and invitation generated' });
    await expect(success).toBeVisible();
    await expect(success.getByText(`Role: ${roleName}`)).toBeVisible();
    const invitationUrl = await success.getByLabel('Staff invitation URL').inputValue();
    expect(invitationUrl).toMatch(/^http:\/\/127\.0\.0\.1:5173\/staff-invitation\?token=/);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await success.getByRole('button', { name: 'Copy Link' }).click();
    await expect(success.getByText('Invitation link copied.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invitationUrl);
    await success.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('row', { name: /Live Receptionist/ })).toContainText('Invitation Active');

    const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId: organization.id, name: roleName } } });
    const staff = await prisma.staffProfile.findFirstOrThrow({ where: { organizationId: organization.id, employeeCode } });
    const invitation = await prisma.staffInvitation.findFirstOrThrow({ where: { staffProfileId: staff.id, status: 'ACTIVE' } });
    expect(invitation.roleId).toBe(role.id);
    expect(invitation.tokenHash).not.toBe(new URL(invitationUrl).searchParams.get('token'));

    staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await staffPage.goto(invitationUrl);
    await expect(staffPage.getByText(`Role: ${roleName}`)).toBeVisible();
    await staffPage.getByLabel('Name').fill('Live Receptionist');
    await staffPage.getByLabel('Password', { exact: true }).fill(password);
    await staffPage.getByLabel('Confirm password').fill(password);
    await staffPage.getByRole('button', { name: 'Activate staff account' }).click();
    await expect(staffPage.getByRole('heading', { name: 'Staff account activated' })).toBeVisible();
    await staffPage.getByRole('link', { name: 'Go to login' }).click();
    await staffPage.getByLabel('Email').fill(staffEmail);
    await staffPage.getByLabel('Password').fill(password);
    await staffPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(staffPage.getByRole('button', { name: 'People & services' })).toBeVisible();
    const identity = await staffPage.evaluate(async () => (await fetch('/backend/identity/me', { credentials: 'include' })).json());
    expect(identity.role?.id).toBe(role.id);
    expect(identity.permissions).toContain('customer.read.all');
    expect(identity.permissions).not.toContain('role.update');
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId).toBe(identity.user.id);
    expect((await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: identity.user.id, organizationId: organization.id } } })).roleId).toBe(role.id);
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe('USED');
  } finally {
    await staffContext?.close();
    const users = await prisma.user.findMany({ where: { email: { in: [adminEmail, staffEmail] } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    const roles = await prisma.role.findMany({ where: { name: roleName }, select: { id: true } });
    const roleIds = roles.map((role) => role.id);
    const staff = await prisma.staffProfile.findMany({ where: { employeeCode }, select: { id: true } });
    const staffIds = staff.map((item) => item.id);
    await prisma.staffInvitation.deleteMany({ where: { staffProfileId: { in: staffIds } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.$disconnect();
  }
});
