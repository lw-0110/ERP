import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
process.env.BETTER_AUTH_SECRET = '12345678901234567890123456789012';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0';
process.env.WEB_URL = 'http://localhost:5173';
process.env.DEFAULT_ORGANIZATION_SLUG = 'development';
const { createApp } = await import('../src/app.factory.js');
const { prisma } = await import('../src/auth/prisma.js');

const tag = `m10http-${randomUUID()}`;
const userIds: string[] = [];
const cookies: string[] = [];
let app: INestApplication | undefined;
let base = '';
let organizationId = '';
let customerRoleId = '';
let adminRoleId = '';
let adminCustomerProfileId = '';
let staffId = '';
let serviceId = '';
let resourceTypeId = '';
let resourceId = '';

async function signup(label: string) {
  const email = `${tag}-${label}@example.invalid`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: label, email, password: 'StrongPassw0rd!' }),
  });
  expect(response.status).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { memberships: true },
  });
  userIds.push(user.id);
  cookies.push(response.headers.get('set-cookie') ?? '');
  return user;
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
  };
}

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const organization = await prisma.organization.create({
    data: { name: tag, slug: tag, timezone: 'Asia/Kuala_Lumpur' },
  });
  organizationId = organization.id;
  const [customerRole, adminRole] = await Promise.all([
    prisma.role.create({ data: { organizationId, name: `${tag}-customer` } }),
    prisma.role.create({ data: { organizationId, name: `${tag}-admin` } }),
  ]);
  customerRoleId = customerRole.id;
  adminRoleId = adminRole.id;
  const customerKeys = [
    'customer.read.own',
    'customer.update.own',
    'booking.create.own',
    'booking.read.own',
    'booking.cancel.own',
    'booking.reschedule.own',
    'service.read',
  ];
  const adminKeys = [
    'organization.read',
    'organization.settings.manage',
    'booking.create.own',
    'booking.read.own',
    'booking.read.all',
    'booking.cancel.all',
    'booking.reschedule.all',
    'booking.assign_staff',
    'booking.assign_resource',
    'booking.status.update',
    'customer.update.own',
  ];
  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...customerKeys, ...adminKeys] } },
  });
  await prisma.rolePermission.createMany({
    data: [
      ...permissions
        .filter(({ key }) => customerKeys.includes(key))
        .map(({ id }) => ({ roleId: customerRoleId, permissionId: id })),
      ...permissions
        .filter(({ key }) => adminKeys.includes(key))
        .map(({ id }) => ({ roleId: adminRoleId, permissionId: id })),
    ],
  });
  const customer = await signup('customer');
  const admin = await signup('admin');
  await prisma.membership.update({
    where: { id: customer.memberships[0].id },
    data: { organizationId, roleId: customerRoleId },
  });
  await prisma.membership.update({
    where: { id: admin.memberships[0].id },
    data: { organizationId, roleId: adminRoleId },
  });
  const customerProfile = await prisma.customerProfile.create({
    data: {
      organizationId,
      userId: customer.id,
      firstName: 'Customer',
      lastName: 'One',
      displayName: tag,
      email: customer.email,
      phone: '1',
    },
  });
  const adminProfile = await prisma.customerProfile.create({
    data: {
      organizationId,
      userId: admin.id,
      firstName: 'Admin',
      lastName: 'User',
      displayName: `${tag}-admin`,
      email: admin.email,
      phone: '2',
    },
  });
  expect(customerProfile.id).toBeTruthy();
  adminCustomerProfileId = adminProfile.id;
  const staff = await prisma.staffProfile.create({
    data: {
      organizationId,
      userId: admin.id,
      employeeCode: tag,
      displayName: tag,
      email: admin.email,
      phone: '2',
    },
  });
  staffId = staff.id;
  await prisma.organizationOpeningHour.create({
    data: { organizationId, dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' },
  });
  await prisma.staffWorkingSchedule.create({
    data: { organizationId, staffId, dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
  });
  const resourceType = await prisma.resourceType.create({ data: { organizationId, name: tag } });
  resourceTypeId = resourceType.id;
  const resource = await prisma.resource.create({
    data: { organizationId, resourceTypeId, name: tag, capacity: 1 },
  });
  resourceId = resource.id;
  const service = await prisma.service.create({
    data: {
      organizationId,
      name: tag,
      durationMinutes: 30,
      priceMinor: 1000,
      currency: 'MYR',
      requiredStaffCount: 1,
      requiredResourceTypes: { create: [{ resourceTypeId, requiredCount: 1 }] },
    },
  });
  serviceId = service.id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.bookingChange.deleteMany({ where: { organizationId } });
  await prisma.paymentRecord.deleteMany({ where: { organizationId } });
  await prisma.commissionRecord.deleteMany({ where: { organizationId } });
  await prisma.booking.deleteMany({ where: { organizationId } });
  await prisma.bookingPolicy.deleteMany({ where: { organizationId } });
  await prisma.staffWorkingSchedule.deleteMany({ where: { organizationId } });
  await prisma.organizationOpeningHour.deleteMany({ where: { organizationId } });
  await prisma.service.deleteMany({ where: { organizationId } });
  await prisma.resource.deleteMany({ where: { organizationId } });
  await prisma.resourceType.deleteMany({ where: { organizationId } });
  await prisma.staffProfile.deleteMany({ where: { organizationId } });
  await prisma.customerProfile.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rolePermission.deleteMany({
    where: { roleId: { in: [customerRoleId, adminRoleId] } },
  });
  await prisma.role.deleteMany({ where: { id: { in: [customerRoleId, adminRoleId] } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await app?.close();
  await prisma.$disconnect();
});

describe('Milestone 10 HTTP booking lifecycle', () => {
  it('configures policy and prefix through tenant-scoped settings', async () => {
    expect((await call('/settings/booking-policy')).status).toBe(403);
    const defaults = await call('/settings/booking-policy', 1);
    expect(defaults.result).toMatchObject({
      customerCancellationEnabled: false,
      customerRescheduleEnabled: false,
      cancellationCutoffMinutes: null,
    });
    const policy = await call('/settings/booking-policy', 1, 'PATCH', {
      customerCancellationEnabled: true,
      customerRescheduleEnabled: true,
      cancellationCutoffMinutes: null,
      rescheduleCutoffMinutes: null,
      maxCustomerReschedules: 2,
    });
    expect(policy.status).toBe(200);
    const settings = await call('/settings/organization', 1, 'PATCH', {
      bookingNumberPrefix: '  life-10 ',
    });
    expect(settings.result.bookingNumberPrefix).toBe('LIFE-10');
  });

  it('enforces ownership and permissions, preserves snapshots, and excludes the current booking while rescheduling', async () => {
    const start = '2030-01-07T02:00:00.000Z';
    const created = await call('/bookings', 0, 'POST', {
      startDateTime: start,
      services: [{ serviceId, quantity: 1 }],
    });
    expect(created.status).toBe(201);
    expect(created.result.bookingNumber.startsWith('LIFE-10-')).toBe(true);
    const bookingId = created.result.id as string;
    const lineId = created.result.services[0].id as string;
    const snapshot = await prisma.bookingService.findUniqueOrThrow({ where: { id: lineId } });
    expect(
      (await call(`/bookings/${bookingId}/services/${lineId}/staff`, 1, 'PUT', { ids: [staffId] }))
        .status,
    ).toBe(200);
    expect(
      (
        await call(`/bookings/${bookingId}/services/${lineId}/resources`, 1, 'PUT', {
          ids: [resourceId],
        })
      ).status,
    ).toBe(200);
    const moved = await call(`/bookings/${bookingId}/reschedule`, 0, 'PATCH', {
      newStartDateTime: '2030-01-07T03:00:00.000Z',
      reason: 'New time',
    });
    expect(moved.status).toBe(200);
    expect(moved.result.startDateTime).toBe('2030-01-07T03:00:00.000Z');
    expect(await prisma.bookingService.findUniqueOrThrow({ where: { id: lineId } })).toMatchObject({
      durationMinutesSnapshot: snapshot.durationMinutesSnapshot,
      requiredStaffCountSnapshot: snapshot.requiredStaffCountSnapshot,
    });
    expect((await call(`/bookings/my/${bookingId}/eligibility`, 1)).status).toBe(404);
    expect(
      await prisma.notification.count({
        where: { organizationId, userId: userIds[1], type: 'booking.rescheduled.customer' },
      }),
    ).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId, action: 'booking.rescheduled.customer', entityId: bookingId },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain('New time');
  });

  it('cancels only confirmed own bookings, preserves history, and prevents the generic status bypass', async () => {
    const created = await call('/bookings', 0, 'POST', {
      startDateTime: '2030-01-07T04:00:00.000Z',
      services: [{ serviceId, quantity: 1 }],
    });
    const bookingId = created.result.id as string;
    const lineId = created.result.services[0].id as string;
    await call(`/bookings/${bookingId}/services/${lineId}/staff`, 1, 'PUT', { ids: [staffId] });
    expect(
      (await call(`/bookings/${bookingId}/status`, 1, 'PATCH', { status: 'CANCELLED' })).status,
    ).toBe(400);
    const cancelled = await call(`/bookings/${bookingId}/cancel`, 0, 'PATCH', {
      reason: 'Private reason',
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.result.status).toBe('CANCELLED');
    expect(
      await prisma.bookingChange.count({
        where: { bookingId, type: 'CANCELLED', initiatedBy: 'CUSTOMER' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { organizationId, userId: userIds[1], type: 'booking.cancelled.customer' },
      }),
    ).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId, action: 'booking.cancelled.customer', entityId: bookingId },
    });
    expect(audit.metadata).toMatchObject({ reasonProvided: true });
    expect(JSON.stringify(audit.metadata)).not.toContain('Private reason');
    expect((await call(`/bookings/${bookingId}/cancel`, 0, 'PATCH', {})).status).toBe(400);
  });

  it('lets an authorized admin bypass customer policy but not confirmed-only status', async () => {
    await call('/settings/booking-policy', 1, 'PATCH', {
      customerCancellationEnabled: false,
      customerRescheduleEnabled: false,
      cancellationCutoffMinutes: 999999,
      rescheduleCutoffMinutes: 999999,
      maxCustomerReschedules: 0,
    });
    const booking = await prisma.booking.create({
      data: {
        organizationId,
        customerId: adminCustomerProfileId,
        bookingNumber: `${tag}-admin-cancel`,
        startDateTime: new Date('2030-01-07T05:00:00.000Z'),
        endDateTime: new Date('2030-01-07T05:30:00.000Z'),
        createdByUserId: userIds[1],
        services: {
          create: [
            {
              serviceId,
              unitPriceMinorSnapshot: 1000,
              currencySnapshot: 'MYR',
              durationMinutesSnapshot: 30,
              bufferBeforeMinutesSnapshot: 0,
              bufferAfterMinutesSnapshot: 0,
              requiredStaffCountSnapshot: 1,
              requiredSkillIdsSnapshot: [],
              requiredSkillCountsSnapshot: [],
              requiredResourceTypeCountsSnapshot: [{ resourceTypeId, requiredCount: 1 }],
              quantity: 1,
              lineTotalMinor: 1000,
              sortOrder: 0,
            },
          ],
        },
      },
    });
    expect((await call(`/admin/bookings/${booking.id}/cancel`, 1, 'PATCH', {})).status).toBe(200);
    expect((await call(`/admin/bookings/${booking.id}/cancel`, 1, 'PATCH', {})).status).toBe(400);
    expect((await call(`/admin/bookings/${booking.id}/cancel`, 0, 'PATCH', {})).status).toBe(403);
  });
});
