import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
process.env.BETTER_AUTH_SECRET = '12345678901234567890123456789012';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0';
process.env.WEB_URL = 'http://localhost:5173';
process.env.DEFAULT_ORGANIZATION_SLUG = 'development';
process.env.STAFF_INVITATION_TTL_HOURS = '24';
const { createApp } = await import('../src/app.factory.js');
const { prisma } = await import('../src/auth/prisma.js');

const tag = `invite-${randomUUID()}`;
const userIds: string[] = [];
const staffIds: string[] = [];
let app: INestApplication | undefined;
let base = '';
let organizationId = '';
let adminCookie = '';
let receptionistRoleId = '';

async function signup(email: string, name: string) {
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, name, password: 'StrongPassw0rd!' }) });
  expect(response.status).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  userIds.push(user.id);
  return { user, cookie: response.headers.get('set-cookie') ?? '' };
}

beforeAll(async () => {
  app = await createApp(); await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: 'development' } }); organizationId = organization.id;
  const admin = await signup(`${tag}-admin@example.test`, 'Invitation Admin'); adminCookie = admin.cookie;
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId, name: 'Admin' } } });
  await prisma.membership.update({ where: { userId_organizationId: { userId: admin.user.id, organizationId } }, data: { roleId: adminRole.id } });
  const receptionist = await prisma.role.create({ data: { organizationId, name: `${tag}-Receptionist` } });
  receptionistRoleId = receptionist.id;
  const permissions = await prisma.permission.findMany({ where: { key: { in: ['customer.read.all', 'booking.create.all'] } } });
  await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: receptionist.id, permissionId: permission.id })) });
});

afterAll(async () => {
  await prisma.staffInvitation.deleteMany({ where: { staffProfileId: { in: staffIds } } });
  await prisma.staffProfile.deleteMany({ where: { id: { in: staffIds } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: receptionistRoleId } });
  await prisma.role.deleteMany({ where: { id: receptionistRoleId } });
  await app?.close(); await prisma.$disconnect();
});

describe('single-use staff invitation lifecycle', () => {
  it('atomically creates staff and a role-bound invitation, then activates the selected role', async () => {
    const invitedEmail = `${tag}-atomic@example.test`;
    const employeeCode = `${tag}-ATOMIC`;
    const response = await fetch(`${base}/staff/create-and-invite`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ employeeCode, displayName: 'Atomic Receptionist', email: invitedEmail, phone: '+60000000011', roleId: receptionistRoleId }) });
    expect(response.status).toBe(201);
    const result = await response.json();
    staffIds.push(result.staff.id);
    expect(result.staff.email).toBe(invitedEmail);
    expect(result.invitation).toMatchObject({ staffProfileId: result.staff.id, organizationId, roleId: receptionistRoleId, status: 'ACTIVE' });
    expect(result.invitationUrl).toMatch(/^http:\/\/localhost:5173\/staff-invitation\?token=/);
    const token = new URL(result.invitationUrl).searchParams.get('token')!;
    const stored = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: result.invitation.id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(JSON.stringify(result.invitation)).not.toContain(token);
    const redeemed = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Atomic Receptionist', password: 'StrongPassw0rd!' }) });
    expect(redeemed.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: invitedEmail } });
    userIds.push(user.id);
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: result.staff.id } })).userId).toBe(user.id);
    expect((await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: user.id, organizationId } } })).roleId).toBe(receptionistRoleId);
  });

  it('does not leave a staff profile when an atomic create-and-invite validation fails', async () => {
    const employeeCode = `${tag}-ROLLBACK`;
    const body = { employeeCode, displayName: 'No Orphan', email: `${tag}-orphan@example.test`, phone: '+60000000012' };
    const missing = await fetch(`${base}/staff/create-and-invite`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await missing.json()).code).toBe('STAFF_ROLE_REQUIRED');
    const missingEmail = await fetch(`${base}/staff/create-and-invite`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ employeeCode, displayName: body.displayName, phone: body.phone, roleId: receptionistRoleId }) });
    expect((await missingEmail.json()).code).toBe('STAFF_EMAIL_REQUIRED');
    const foreignOrganization = await prisma.organization.create({ data: { name: `${tag}-atomic-foreign`, slug: `${tag}-atomic-foreign` } });
    const foreignRole = await prisma.role.create({ data: { organizationId: foreignOrganization.id, name: 'Foreign' } });
    try {
      const crossTenant = await fetch(`${base}/staff/create-and-invite`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, roleId: foreignRole.id }) });
      expect((await crossTenant.json()).code).toBe('ROLE_CROSS_TENANT');
    } finally { await prisma.role.delete({ where: { id: foreignRole.id } }); await prisma.organization.delete({ where: { id: foreignOrganization.id } }); }
    await prisma.role.update({ where: { id: receptionistRoleId }, data: { status: 'ARCHIVED' } });
    try {
      const inactive = await fetch(`${base}/staff/create-and-invite`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, roleId: receptionistRoleId }) });
      expect((await inactive.json()).code).toBe('ROLE_INACTIVE');
    } finally { await prisma.role.update({ where: { id: receptionistRoleId }, data: { status: 'ACTIVE' } }); }
    expect(await prisma.staffProfile.count({ where: { organizationId, employeeCode } })).toBe(0);
    expect(await prisma.staffInvitation.count({ where: { organizationId, email: body.email } })).toBe(0);
  });

  it('stores only a token hash and activates the server-selected staff profile and role once', async () => {
    const invitedEmail = `${tag}-staff@example.test`;
    const staffCreated = await fetch(`${base}/staff`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ employeeCode: `${tag}-S1`, displayName: 'Invited Staff', email: invitedEmail, phone: '+60000000001' }) });
    expect(staffCreated.status).toBe(201);
    const staff = await staffCreated.json(); staffIds.push(staff.id);
    const created = await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) });
    expect(created.status).toBe(201);
    const result = await created.json();
    const token = new URL(result.invitationUrl).searchParams.get('token') ?? '';
    expect(token.length).toBeGreaterThan(40);
    const stored = await prisma.staffInvitation.findUniqueOrThrow({ where: { id: result.id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.roleId).toBe(receptionistRoleId);
    const invitedResponse = await fetch(`${base}/staff?search=${encodeURIComponent(invitedEmail)}`, { headers: { cookie: adminCookie } });
    const invitedList = await invitedResponse.json();
    expect(invitedResponse.status, JSON.stringify(invitedList)).toBe(200);
    expect(invitedList.items.find((item: { id: string }) => item.id === staff.id)).toMatchObject({ accountStatus: 'Invitation Active', roleId: receptionistRoleId });
    expect(JSON.stringify(result.invitation)).not.toContain(token);
    expect((await fetch(`${base}/staff-invitations/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).status).toBe(201);
    expect((await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Invited Staff', password: 'StrongPassw0rd!', roleId: randomUUID() }) })).status).toBe(400);
    const redeemed = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Invited Staff', password: 'StrongPassw0rd!' }) });
    expect(redeemed.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: invitedEmail }, include: { memberships: { include: { role: true } } } }); userIds.push(user.id);
    expect(user.memberships.find((membership) => membership.organizationId === organizationId)?.roleId).toBe(receptionistRoleId);
    const effective = await prisma.rolePermission.findMany({ where: { roleId: receptionistRoleId }, select: { permission: { select: { key: true } } } });
    expect(effective.map((item) => item.permission.key).sort()).toEqual(['booking.create.all', 'customer.read.all']);
    const signedIn = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: invitedEmail, password: 'StrongPassw0rd!' }) });
    const identity = await (await fetch(`${base}/identity/me`, { headers: { cookie: signedIn.headers.get('set-cookie') ?? '' } })).json();
    expect(identity.permissions.sort()).toEqual(['booking.create.all', 'customer.read.all']);
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId).toBe(user.id);
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: stored.id } })).status).toBe('USED');
    const activeList = await (await fetch(`${base}/staff?search=${encodeURIComponent(invitedEmail)}`, { headers: { cookie: adminCookie } })).json();
    expect(activeList.items.find((item: { id: string }) => item.id === staff.id)).toMatchObject({ accountStatus: 'Account Active', roleId: receptionistRoleId });
    expect((await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Again', password: 'StrongPassw0rd!' }) })).status).toBe(400);
    const membership = user.memberships.find((item) => item.organizationId === organizationId)!;
    const staffRole = await prisma.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId, name: 'Staff' } } });
    const changed = await fetch(`${base}/memberships/${membership.id}/role`, { method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: staffRole.id }) });
    expect(changed.status).toBe(200);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } })).roleId).toBe(staffRole.id);
  });

  it('allows an authorized admin to revoke an unused invitation without exposing its token later', async () => {
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S2`, displayName: 'Revoked Staff', email: `${tag}-revoked@example.test`, phone: '+60000000002' } }); staffIds.push(staff.id);
    const created = await (await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) })).json();
    expect((await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) })).status).toBe(409);
    const revoked = await fetch(`${base}/staff/${staff.id}/invitations/${created.id}/revoke`, { method: 'PATCH', headers: { cookie: adminCookie } });
    expect(revoked.status).toBe(200);
    const staffList = await (await fetch(`${base}/staff?search=${encodeURIComponent(staff.email)}`, { headers: { cookie: adminCookie } })).json();
    expect(staffList.items.find((item: { id: string }) => item.id === staff.id).accountStatus).toBe('Invitation Revoked');
    const listed = await (await fetch(`${base}/staff/${staff.id}/invitations`, { headers: { cookie: adminCookie } })).json();
    expect(listed[0].status).toBe('REVOKED');
    expect(JSON.stringify(listed)).not.toContain('tokenHash');
    const token = new URL(created.invitationUrl).searchParams.get('token');
    expect((await fetch(`${base}/staff-invitations/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).status).toBe(400);
    const redeemRevoked = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Revoked Staff', password: 'StrongPassw0rd!' }) });
    expect((await redeemRevoked.json()).code).toBe('INVITE_REVOKED');
  });

  it('links the authenticated invited account without creating a duplicate user', async () => {
    const invitedEmail = `${tag}-existing@example.test`;
    const existing = await signup(invitedEmail, 'Existing Invited User');
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S3`, displayName: 'Existing Invited User', email: invitedEmail, phone: '+60000000003' } });
    staffIds.push(staff.id);

    const createdResponse = await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    const token = new URL(created.invitationUrl).searchParams.get('token') ?? '';

    const unauthenticated = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    expect(unauthenticated.status).toBe(401);

    const redeemed = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: existing.cookie }, body: JSON.stringify({ token }) });
    expect(redeemed.status).toBe(201);
    expect(await prisma.user.count({ where: { email: invitedEmail } })).toBe(1);
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId).toBe(existing.user.id);
    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: existing.user.id, organizationId } }, include: { role: true } });
    expect(membership.roleId).toBe(receptionistRoleId);
  });

  it('rejects redemption by a different signed-in account from another tenant', async () => {
    const owner = await signup(`${tag}-owner@example.test`, 'Invited Owner');
    const other = await signup(`${tag}-other@example.test`, 'Foreign Account');
    const foreignOrganization = await prisma.organization.create({ data: { name: `${tag}-other-tenant`, slug: `${tag}-other-tenant` } });
    const foreignRole = await prisma.role.create({ data: { organizationId: foreignOrganization.id, name: 'Foreign Staff' } });
    await prisma.membership.delete({ where: { userId_organizationId: { userId: other.user.id, organizationId } } });
    await prisma.membership.create({ data: { organizationId: foreignOrganization.id, userId: other.user.id, roleId: foreignRole.id } });
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-FOREIGN`, displayName: 'Invited Owner', email: owner.user.email, phone: '+60000000013' } });
    staffIds.push(staff.id);
    try {
      const created = await (await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) })).json();
      const token = new URL(created.invitationUrl).searchParams.get('token');
      const wrongAccount = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { cookie: other.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      expect(wrongAccount.status).toBe(401);
      expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId).toBeNull();
      expect((await prisma.membership.findUniqueOrThrow({ where: { userId_organizationId: { userId: other.user.id, organizationId: foreignOrganization.id } } })).roleId).toBe(foreignRole.id);
      expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('ACTIVE');
    } finally {
      await prisma.membership.deleteMany({ where: { organizationId: foreignOrganization.id, userId: other.user.id } });
      await prisma.role.delete({ where: { id: foreignRole.id } });
      await prisma.organization.delete({ where: { id: foreignOrganization.id } });
    }
  });

  it('rejects inactive, cross-tenant and missing roles before creating an invitation', async () => {
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S4`, displayName: 'Role Checked Staff', email: `${tag}-role@example.test`, phone: '+60000000004' } });
    staffIds.push(staff.id);
    const invite = (roleId?: string) => fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify(roleId ? { roleId } : {}) });
    expect((await invite()).status).toBe(400);
    const foreignOrganization = await prisma.organization.create({ data: { name: `${tag}-foreign`, slug: `${tag}-foreign` } });
    const foreignRole = await prisma.role.create({ data: { organizationId: foreignOrganization.id, name: `${tag}-foreign` } });
    try { expect((await invite(foreignRole.id)).status).toBe(403); }
    finally { await prisma.role.delete({ where: { id: foreignRole.id } }); await prisma.organization.delete({ where: { id: foreignOrganization.id } }); }
    await prisma.role.update({ where: { id: receptionistRoleId }, data: { status: 'ARCHIVED' } });
    expect((await invite(receptionistRoleId)).status).toBe(400);
    await prisma.role.update({ where: { id: receptionistRoleId }, data: { status: 'ACTIVE' } });
    expect(await prisma.staffInvitation.count({ where: { staffProfileId: staff.id } })).toBe(0);
  });

  it('does not let staff invitation permission alone assign a role', async () => {
    const limited = await signup(`${tag}-limited@example.test`, 'Limited Inviter');
    const role = await prisma.role.create({ data: { organizationId, name: `${tag}-limited` } });
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'staff.invite' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.membership.update({ where: { userId_organizationId: { userId: limited.user.id, organizationId } }, data: { roleId: role.id } });
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S8`, displayName: 'Protected Staff', email: `${tag}-protected@example.test`, phone: '+60000000008' } });
    staffIds.push(staff.id);
    const response = await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: limited.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) });
    expect(response.status).toBe(403);
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId, name: 'Admin' } } });
    await prisma.membership.update({ where: { userId_organizationId: { userId: limited.user.id, organizationId } }, data: { roleId: adminRole.id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
  });

  it('rejects linking an invited account already attached to another staff profile', async () => {
    const email = `${tag}-conflict@example.test`;
    const existing = await signup(email, 'Already Staff');
    const linked = await prisma.staffProfile.create({ data: { organizationId, userId: existing.user.id, employeeCode: `${tag}-S5`, displayName: 'Linked Staff', email, phone: '+60000000005' } });
    const target = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S6`, displayName: 'Other Staff', email, phone: '+60000000006' } });
    staffIds.push(linked.id, target.id);
    const created = await (await fetch(`${base}/staff/${target.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) })).json();
    const token = new URL(created.invitationUrl).searchParams.get('token');
    const redeemed = await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: existing.cookie }, body: JSON.stringify({ token }) });
    expect(redeemed.status).toBe(409);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: target.id } })).userId).toBeNull();
  });

  it('rejects an expired invitation without linking an account', async () => {
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S7`, displayName: 'Expired Staff', email: `${tag}-expired@example.test`, phone: '+60000000007' } });
    staffIds.push(staff.id);
    const created = await (await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) })).json();
    const token = new URL(created.invitationUrl).searchParams.get('token');
    await prisma.staffInvitation.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const validation = await fetch(`${base}/staff-invitations/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    expect((await validation.json()).code).toBe('INVITE_EXPIRED');
    const staffList = await (await fetch(`${base}/staff?search=${encodeURIComponent(staff.email)}`, { headers: { cookie: adminCookie } })).json();
    expect(staffList.items.find((item: { id: string }) => item.id === staff.id).accountStatus).toBe('Invitation Expired');
    expect((await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Expired Staff', password: 'StrongPassw0rd!' }) })).status).toBe(400);
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } })).userId).toBeNull();
  });

  it('rejects redemption when the invitation role is later archived', async () => {
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S9`, displayName: 'Archived Role Staff', email: `${tag}-archived@example.test`, phone: '+60000000009' } });
    staffIds.push(staff.id);
    const created = await (await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) })).json();
    const token = new URL(created.invitationUrl).searchParams.get('token');
    await prisma.role.update({ where: { id: receptionistRoleId }, data: { status: 'ARCHIVED' } });
    try {
      const validation = await fetch(`${base}/staff-invitations/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      expect((await validation.json()).code).toBe('ROLE_INACTIVE');
      expect((await fetch(`${base}/staff-invitations/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name: 'Archived Role Staff', password: 'StrongPassw0rd!' }) })).status).toBe(400);
    } finally { await prisma.role.update({ where: { id: receptionistRoleId }, data: { status: 'ACTIVE' } }); }
  });

  it('replaces an old unbound invitation only when Admin explicitly issues a role-bound one', async () => {
    const staff = await prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-S10`, displayName: 'Legacy Invite Staff', email: `${tag}-legacy@example.test`, phone: '+60000000010' } });
    staffIds.push(staff.id);
    const legacy = await prisma.staffInvitation.create({ data: { organizationId, staffProfileId: staff.id, email: staff.email, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), expiresAt: new Date(Date.now() + 3600000), createdByUserId: userIds[0] } });
    const created = await fetch(`${base}/staff/${staff.id}/invitations`, { method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ roleId: receptionistRoleId }) });
    expect(created.status).toBe(201);
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: legacy.id } })).status).toBe('REVOKED');
    expect((await prisma.staffInvitation.findUniqueOrThrow({ where: { id: (await created.json()).id } })).roleId).toBe(receptionistRoleId);
  });
});
