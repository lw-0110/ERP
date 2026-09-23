import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
process.env.BETTER_AUTH_SECRET = '12345678901234567890123456789012';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0';
process.env.WEB_URL = 'http://localhost:5173';
process.env.DEFAULT_ORGANIZATION_SLUG = 'development';
const { createApp } = await import('../src/app.factory.js');
const { prisma } = await import('../src/auth/prisma.js');

const tag = `roles-${randomUUID()}`;
const managementKeys = ['role.read', 'role.create', 'role.update', 'role.archive', 'role.permission.manage'];
let app: INestApplication | undefined;
let base = '';
let organizationId = '';
let otherOrganizationId = '';
let memberMembershipId = '';
let adminMembershipId = '';
let adminRoleId = '';
let otherRoleId = '';
let otherMembershipId = '';
let cookie = '';
const userIds: string[] = [];
const roleIds: string[] = [];

async function signup(name: string) {
  const email = `${tag}-${name}@example.invalid`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, password: 'StrongPassw0rd!' }) });
  expect(response.status).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { memberships: true } });
  userIds.push(user.id);
  return { user, membership: user.memberships[0], cookie: response.headers.get('set-cookie') ?? '' };
}
async function call(path: string, method = 'GET', body?: unknown, authenticated = true) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(authenticated ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, result: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : undefined };
}

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const admin = await signup('admin');
  const member = await signup('member');
  adminMembershipId = admin.membership.id; memberMembershipId = member.membership.id;
  organizationId = admin.membership.organizationId;
  cookie = admin.cookie;
  const role = await prisma.role.create({ data: { organizationId, name: tag } });
  adminRoleId = role.id; roleIds.push(role.id);
  const permissions = await prisma.permission.findMany({ where: { key: { in: managementKeys } } });
  await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  await prisma.membership.update({ where: { id: adminMembershipId }, data: { roleId: role.id } });
  const other = await prisma.organization.create({ data: { name: `${tag}-other`, slug: `${tag}-other` } });
  otherOrganizationId = other.id;
  const otherRole = await prisma.role.create({ data: { organizationId: other.id, name: `${tag}-other` } });
  otherRoleId = otherRole.id; roleIds.push(otherRole.id);
  const outsider = await prisma.user.create({ data: { name: 'Outsider', email: `${tag}-outsider@example.invalid` } });
  userIds.push(outsider.id);
  otherMembershipId = (await prisma.membership.create({ data: { organizationId: other.id, userId: outsider.id, roleId: otherRole.id } })).id;
});
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] }, entityType: { in: ['Role', 'Membership'] }, entityId: { in: [...roleIds, memberMembershipId] } } });
  await prisma.membership.deleteMany({ where: { id: { in: [adminMembershipId, memberMembershipId, otherMembershipId] } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.organization.deleteMany({ where: { id: otherOrganizationId } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app?.close();
  await prisma.$disconnect();
});

describe('tenant role management HTTP API', () => {
  it('returns platform permissions only to authorized users', async () => {
    expect((await call('/permissions', 'GET', undefined, false)).status).toBe(401);
    const list = await call('/permissions');
    expect(list.status).toBe(200);
    expect(list.result).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'role.read', module: 'role' })]));
    const memberCookie = cookie;
    cookie = (await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${tag}-member@example.invalid`, password: 'StrongPassw0rd!' }) })).headers.get('set-cookie') ?? '';
    expect((await call('/permissions')).status).toBe(403);
    cookie = memberCookie;
  });

  it('creates, edits, lists and archives tenant roles with validated permissions', async () => {
    const listed = await call('/roles');
    expect(listed.status).toBe(200);
    expect(listed.result.some((role: { id: string }) => role.id === otherRoleId)).toBe(false);
    const input = { name: `${tag}-reception`, description: 'Front desk', permissionKeys: ['booking.read.all', 'customer.read.all'] };
    const created = await call('/roles', 'POST', input);
    expect(created.status).toBe(201);
    const id = created.result.id as string;
    roleIds.push(id);
    expect((await call('/roles', 'POST', input)).result.code).toBe('ROLE_NAME_DUPLICATE');
    expect((await call('/roles', 'POST', { ...input, name: `${tag}-invalid`, permissionKeys: ['made.up'] })).result.code).toBe('PERMISSION_INVALID');
    expect((await call(`/roles/${otherRoleId}`, 'PATCH', input)).result.code).toBe('ROLE_CROSS_TENANT');
    const updated = await call(`/roles/${id}`, 'PATCH', { ...input, permissionKeys: ['booking.read.all', 'customer.create'] });
    expect(updated.status).toBe(200);
    const role = (await call('/roles')).result.find((item: { id: string }) => item.id === id);
    expect(role.permissionKeys).toEqual(expect.arrayContaining(['booking.read.all', 'customer.create']));
    expect(role.permissionCount).toBe(2);
    expect(role.memberCount).toBe(0);
    expect((await call(`/roles/${id}/archive`, 'PATCH')).status).toBe(200);
    expect((await call(`/memberships/${memberMembershipId}/role`, 'PATCH', { roleId: id })).result.code).toBe('ROLE_INACTIVE');
    const actions = await prisma.auditLog.findMany({ where: { organizationId, entityId: id }, select: { action: true } });
    expect(actions.map(({ action }) => action)).toEqual(expect.arrayContaining(['role.created', 'role.updated', 'role.permissions.changed', 'role.archived']));
  });

  it('assigns active same-tenant roles and rejects cross-tenant or inactive targets', async () => {
    const created = await call('/roles', 'POST', { name: `${tag}-worker`, permissionKeys: ['booking.read.assigned'] });
    expect(created.status).toBe(201);
    const id = created.result.id as string; roleIds.push(id);
    const members = await call('/memberships');
    expect(members.result.some((member: { id: string }) => member.id === otherMembershipId)).toBe(false);
    expect(members.result.some((member: { id: string }) => member.id === memberMembershipId)).toBe(true);
    expect((await call(`/memberships/${memberMembershipId}/role`, 'PATCH', { roleId: id })).status).toBe(200);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: memberMembershipId } })).roleId).toBe(id);
    expect((await call(`/memberships/${otherMembershipId}/role`, 'PATCH', { roleId: id })).result.code).toBe('MEMBERSHIP_NOT_FOUND');
    expect((await call(`/memberships/${memberMembershipId}/role`, 'PATCH', { roleId: otherRoleId })).result.code).toBe('ROLE_CROSS_TENANT');
    expect((await call(`/roles/${id}/archive`, 'PATCH')).result.code).toBe('ROLE_IN_USE');
    expect(await prisma.auditLog.count({ where: { organizationId, entityId: memberMembershipId, action: 'role.assigned' } })).toBeGreaterThan(0);
  });

  it('prevents editing or reassigning the current membership into role-management lockout', async () => {
    const edit = await call(`/roles/${adminRoleId}`, 'PATCH', { name: tag, permissionKeys: ['role.read', 'role.create', 'role.archive', 'role.permission.manage'] });
    expect(edit.result.code).toBe('ROLE_SELF_LOCKOUT');
    expect((await call(`/memberships/${adminMembershipId}/role`, 'PATCH', { roleId: otherRoleId })).result.code).toBe('ROLE_CROSS_TENANT');
    const target = await call('/roles', 'POST', { name: `${tag}-limited`, permissionKeys: ['role.read'] });
    roleIds.push(target.result.id);
    expect((await call(`/memberships/${adminMembershipId}/role`, 'PATCH', { roleId: target.result.id })).result.code).toBe('ROLE_SELF_LOCKOUT');
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: adminMembershipId } })).roleId).toBe(adminRoleId);
  });
});
