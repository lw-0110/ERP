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
const tag = `m6http-${randomUUID()}`;
let app: INestApplication | undefined;
let base = '';
let organizationId = '';
let roleId = '';
let typeId = '';
let otherOrganizationId = '';
const userIds: string[] = [];
const staffIds: string[] = [];
const cookies: string[] = [];
let leaveId = '';

async function signup(suffix: string) {
  const email = `${tag}-${suffix}@example.invalid`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: suffix, email, password: 'StrongPassw0rd!' }),
  });
  expect(response.ok).toBe(true);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { memberships: true },
  });
  userIds.push(user.id);
  cookies.push(response.headers.get('set-cookie') ?? '');
  organizationId = user.memberships[0].organizationId;
  return user;
}
async function call(path: string, method = 'GET', body?: unknown, user = 0) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(user >= 0 ? { cookie: cookies[user] } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, result: await response.json().catch(() => undefined) };
}

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const first = await signup('first');
  const second = await signup('second');
  const role = await prisma.role.create({ data: { organizationId, name: tag } });
  roleId = role.id;
  const permissions = await prisma.permission.findMany({
    where: {
      key: {
        in: ['attendance.clock.own', 'attendance.read.own', 'leave.create.own', 'leave.read.own'],
      },
    },
  });
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
  });
  await prisma.membership.updateMany({
    where: { organizationId, userId: { in: userIds } },
    data: { roleId },
  });
  for (const [index, user] of [first, second].entries()) {
    const staff = await prisma.staffProfile.create({
      data: {
        organizationId,
        userId: user.id,
        employeeCode: `${tag}-${index}`,
        displayName: user.name,
        email: user.email,
        phone: '1',
      },
    });
    staffIds.push(staff.id);
  }
  const type = await prisma.leaveType.create({ data: { organizationId, name: tag } });
  typeId = type.id;
  const other = await prisma.organization.create({
    data: { name: `${tag}-other`, slug: `${tag}-other` },
  });
  otherOrganizationId = other.id;
});

afterAll(async () => {
  if (organizationId) {
    await prisma.leaveRequest.deleteMany({ where: { organizationId, staffId: { in: staffIds } } });
    await prisma.attendanceRecord.deleteMany({
      where: { organizationId, staffId: { in: staffIds } },
    });
    await prisma.leaveType.deleteMany({ where: { id: typeId } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: staffIds } } });
    await prisma.membership.deleteMany({ where: { organizationId, userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: roleId } });
    if (otherOrganizationId)
      await prisma.organization.delete({ where: { id: otherOrganizationId } });
  }
  await app?.close();
  await prisma.$disconnect();
});

describe('Milestone 6 real HTTP staff operations', () => {
  it('enforces sessions, permissions, own clocking, and one active attendance record', async () => {
    expect((await call('/attendance/my', 'GET', undefined, -1)).status).toBe(401);
    expect((await call('/attendance', 'GET')).status).toBe(403);
    expect((await call('/attendance/clock-in', 'POST', { staffId: staffIds[1] })).status).toBe(400);
    const open = await call('/attendance/clock-in', 'POST', {});
    expect(open.status).toBe(201);
    expect(open.result.staffId).toBe(staffIds[0]);
    expect((await call('/attendance/clock-in', 'POST', {})).status).toBe(409);
    expect((await call('/attendance/my')).result).toHaveLength(1);
    const closed = await call('/attendance/clock-out', 'POST');
    expect(closed.status).toBe(201);
    expect(closed.result.status).toBe('PRESENT');
    expect((await call('/attendance/clock-out', 'POST')).status).toBe(400);
    expect((await call('/attendance/my', 'GET', undefined, 1)).result).toHaveLength(0);
  });

  it('creates pending leave for the linked staff and rejects cross-tenant types or other ownership', async () => {
    const foreign = await prisma.leaveType.create({
      data: { organizationId: otherOrganizationId, name: tag },
    });
    try {
      const body = {
        leaveTypeId: foreign.id,
        startDateTime: '2030-01-07T02:00:00Z',
        endDateTime: '2030-01-07T03:00:00Z',
      };
      expect((await call('/leave-requests', 'POST', body)).status).toBe(400);
      expect(
        (
          await call('/leave-requests', 'POST', {
            ...body,
            leaveTypeId: typeId,
            organizationId: otherOrganizationId,
          })
        ).status,
      ).toBe(400);
      const created = await call('/leave-requests', 'POST', { ...body, leaveTypeId: typeId });
      expect(created.status).toBe(201);
      expect(created.result.status).toBe('PENDING');
      expect(created.result.staffId).toBe(staffIds[0]);
      leaveId = created.result.id;
      expect((await call(`/leave-requests/${leaveId}`)).status).toBe(200);
      expect((await call(`/leave-requests/${leaveId}`, 'GET', undefined, 1)).status).toBe(404);
      expect((await call('/leave-requests/my')).result).toHaveLength(1);
      expect((await call('/leave-requests', 'GET')).status).toBe(403);
    } finally {
      await prisma.leaveType.delete({ where: { id: foreign.id } });
    }
  });

  it('uses explicit all-read and review permissions for admin list and decision', async () => {
    const permissions = await prisma.permission.findMany({
      where: {
        key: { in: ['attendance.read.all', 'leave.read.all', 'leave.review', 'leave.type.manage'] },
      },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    });
    expect((await call('/attendance')).status).toBe(200);
    expect((await call('/leave-requests')).status).toBe(200);
    const detail = await call(`/leave-requests/${leaveId}`);
    expect(detail.status).toBe(200);
    expect(detail.result.id).toBe(leaveId);
    const reviewed = await call(`/leave-requests/${leaveId}/reject`, 'PATCH', {});
    expect(reviewed.status).toBe(200);
    expect(reviewed.result.status).toBe('REJECTED');
  });
});
