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
const { ActivityService } = await import('../src/operations/activity.service.js');
const tag = `m9-${randomUUID()}`;
let app: INestApplication | undefined;
let activities: InstanceType<typeof ActivityService>;
let base = '';
const users: string[] = [];
const cookies: string[] = [];
let organizationId = '';
let roleId = '';
let otherNotificationId = '';
let customerId = '';
let bookingId = '';
let staffId = '';
let leaveTypeId = '';
let leaveId = '';

async function signup(suffix: string) {
  const email = `${tag}-${suffix}@example.invalid`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: suffix, email, password: 'StrongPassw0rd!' }),
  });
  expect(response.status).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { memberships: true },
  });
  users.push(user.id);
  cookies.push(response.headers.get('set-cookie') ?? '');
  organizationId = user.memberships[0].organizationId;
}
async function call(path: string, user = 0, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(user >= 0 ? { cookie: cookies[user] } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    result: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : undefined,
    headers: response.headers,
    text,
  };
}

beforeAll(async () => {
  app = await createApp();
  activities = app.get(ActivityService);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  await signup('one');
  await signup('two');
  const role = await prisma.role.create({ data: { organizationId, name: tag } });
  roleId = role.id;
  await prisma.membership.updateMany({
    where: { userId: users[0], organizationId },
    data: { roleId },
  });
  const own = await prisma.notification.create({
    data: {
      organizationId,
      userId: users[0],
      type: 'test',
      title: 'Own',
      message: 'Safe',
      eventKey: `${tag}:own`,
      metadata: { bookingId: randomUUID() },
    },
  });
  expect(own.id).toBeTruthy();
  const other = await prisma.notification.create({
    data: {
      organizationId,
      userId: users[1],
      type: 'test',
      title: 'Other',
      message: 'Private',
      eventKey: `${tag}:other`,
    },
  });
  otherNotificationId = other.id;
  const customer = await prisma.customerProfile.create({
    data: {
      organizationId,
      userId: users[0],
      firstName: 'Test',
      lastName: 'User',
      displayName: tag,
      phone: '1',
      email: `${tag}@example.invalid`,
    },
  });
  customerId = customer.id;
  const booking = await prisma.booking.create({
    data: {
      organizationId,
      customerId,
      bookingNumber: tag,
      startDateTime: new Date('2035-01-01T01:00:00Z'),
      endDateTime: new Date('2035-01-01T02:00:00Z'),
      createdByUserId: users[0],
    },
  });
  bookingId = booking.id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.leaveRequest.deleteMany({ where: { id: leaveId } });
  await prisma.leaveType.deleteMany({ where: { id: leaveTypeId } });
  await prisma.booking.deleteMany({ where: { id: bookingId } });
  await prisma.staffProfile.deleteMany({ where: { id: staffId } });
  await prisma.customerProfile.deleteMany({ where: { id: customerId } });
  await prisma.membership.deleteMany({ where: { userId: { in: users } } });
  await prisma.session.deleteMany({ where: { userId: { in: users } } });
  await prisma.account.deleteMany({ where: { userId: { in: users } } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await app?.close();
  await prisma.$disconnect();
});

describe('Milestone 9 notifications, audit, health and errors', () => {
  it('enforces private tenant-scoped notifications and read lifecycle', async () => {
    expect((await call('/notifications', -1)).status).toBe(401);
    const list = await call('/notifications');
    expect(list.status).toBe(200);
    expect(list.result.items.map((item: { title: string }) => item.title)).toContain('Own');
    expect(list.text).not.toContain('Private');
    expect((await call('/notifications/unread-count')).result.count).toBe(1);
    expect((await call(`/notifications/${otherNotificationId}/read`, 0, 'PATCH')).status).toBe(404);
    const ownId = list.result.items[0].id;
    expect((await call(`/notifications/${ownId}/read`, 0, 'PATCH')).status).toBe(200);
    expect((await call('/notifications/unread-count')).result.count).toBe(0);
    await prisma.notification.create({
      data: {
        organizationId,
        userId: users[0],
        type: 'test',
        title: 'Second',
        message: 'Safe',
        eventKey: `${tag}:second`,
      },
    });
    expect((await call('/notifications/read-all', 0, 'PATCH')).result.count).toBe(1);
  });

  it('protects tenant audit data and records safe mutation metadata', async () => {
    expect((await call('/audit-logs', -1)).status).toBe(401);
    expect((await call('/audit-logs')).status).toBe(403);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'audit.read' } });
    await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    await call('/notifications/read-all', 0, 'PATCH');
    const logs = await call('/audit-logs');
    expect(logs.status).toBe(200);
    const log = logs.result.items.find(
      (item: { action: string }) => item.action === 'notifications.patch',
    );
    expect(log).toBeTruthy();
    expect(JSON.stringify(log.metadata)).not.toMatch(
      /password|cookie|authorization|session_token/i,
    );
    expect((await call(`/audit-logs/${log.id}`, 0, 'PATCH')).status).toBe(404);
    const foreignOrganization = await prisma.organization.create({
      data: { name: tag, slug: `${tag}-foreign` },
    });
    await prisma.auditLog.create({
      data: { organizationId: foreignOrganization.id, action: 'foreign', entityType: 'Test' },
    });
    expect(logs.result.items.some((item: { action: string }) => item.action === 'foreign')).toBe(
      false,
    );
    await prisma.organization.delete({ where: { id: foreignOrganization.id } });
  });

  it('creates a deduplicated customer notification and audit record for a booking event', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'booking.status.update' },
    });
    await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    expect(
      (await call(`/bookings/${bookingId}/status`, 0, 'PATCH', { status: 'CHECKED_IN' })).status,
    ).toBe(200);
    expect(
      (await call(`/bookings/${bookingId}/status`, 0, 'PATCH', { status: 'IN_PROGRESS' })).status,
    ).toBe(200);
    const changed = await call(`/bookings/${bookingId}/status`, 0, 'PATCH', {
      status: 'COMPLETED',
    });
    expect(changed.status).toBe(200);
    const notification = await prisma.notification.findFirst({
      where: { organizationId, userId: users[0], type: 'booking.status.changed' },
    });
    expect(notification?.metadata).toEqual({ bookingId });
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId,
        actorUserId: users[0],
        action: 'booking.status.changed',
        entityId: bookingId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toBeTruthy();
    expect(audit?.metadata).toMatchObject({ status: 'COMPLETED' });
  });

  it('routes staff and leave notifications only to approved linked recipients', async () => {
    const reviewPermission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'leave.review' },
    });
    await prisma.rolePermission.create({ data: { roleId, permissionId: reviewPermission.id } });
    const staff = await prisma.staffProfile.create({
      data: {
        organizationId,
        userId: users[1],
        employeeCode: tag,
        displayName: 'Staff',
        phone: '1',
        email: `${tag}-staff@example.invalid`,
      },
    });
    staffId = staff.id;
    const leaveType = await prisma.leaveType.create({ data: { organizationId, name: tag } });
    leaveTypeId = leaveType.id;
    const leave = await prisma.leaveRequest.create({
      data: {
        organizationId,
        staffId,
        leaveTypeId,
        startDateTime: new Date('2035-02-01T01:00:00Z'),
        endDateTime: new Date('2035-02-01T02:00:00Z'),
      },
    });
    leaveId = leave.id;
    await activities.record({
      organizationId,
      actorUserId: users[1],
      action: 'leave.submitted',
      entityType: 'LeaveRequest',
      entityId: leaveId,
      requestId: randomUUID(),
      result: { id: leaveId, conflicts: [{ bookingId }] },
    });
    expect(
      await prisma.notification.count({
        where: { userId: users[0], eventKey: `leave.submitted:${leaveId}` },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: users[0], eventKey: `leave.conflict.detected:${leaveId}` },
      }),
    ).toBe(1);
    await activities.record({
      organizationId,
      actorUserId: users[0],
      action: 'leave.reviewed',
      entityType: 'LeaveRequest',
      entityId: leaveId,
      requestId: randomUUID(),
      result: { id: leaveId },
    });
    await activities.record({
      organizationId,
      actorUserId: users[0],
      action: 'booking.staff.assigned',
      entityType: 'BookingService',
      entityId: randomUUID(),
      requestId: randomUUID(),
      result: { assignments: [{ id: randomUUID(), staffId }] },
    });
    expect(
      await prisma.notification.count({
        where: { userId: users[1], type: { in: ['leave.reviewed', 'booking.staff.assigned'] } },
      }),
    ).toBe(2);
  });

  it('reports liveness/readiness and sanitizes validation errors with correlation IDs', async () => {
    const live = await call('/health/live', -1);
    expect(live.result).toEqual({ status: 'ok', version: '1.0.0' });
    expect(live.headers.get('content-security-policy')).toBeTruthy();
    expect(live.headers.get('x-content-type-options')).toBe('nosniff');
    expect(live.headers.get('strict-transport-security')).toBeNull();
    expect((await call('/health/ready', -1)).result).toEqual({ status: 'ready', version: '1.0.0' });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'customer.read.all' },
    });
    await prisma.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    const failure = await call('/customers/not-a-uuid');
    expect(failure.status).toBe(400);
    expect(failure.result.code).toBe('HTTP_400');
    expect(failure.result.requestId).toBe(failure.headers.get('x-request-id'));
    expect(failure.text).not.toMatch(/Prisma|stack|database/i);
  });

  it('keeps credentialed CORS explicit and rejects foreign-origin cookie mutations', async () => {
    const preflight = await fetch(`${base}/notifications`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
    const foreign = await fetch(`${base}/notifications/read-all`, {
      method: 'PATCH',
      headers: { cookie: cookies[0], origin: 'https://foreign.example.test' },
    });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
  });
});
