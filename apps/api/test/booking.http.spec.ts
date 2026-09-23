import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { OrganizationOpeningHour } from '@prisma/client';
process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
process.env.BETTER_AUTH_SECRET = '12345678901234567890123456789012';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0';
process.env.WEB_URL = 'http://localhost:5173';
process.env.DEFAULT_ORGANIZATION_SLUG = 'development';
const { createApp } = await import('../src/app.factory.js');
const { prisma } = await import('../src/auth/prisma.js');
const tag = `m5http-${randomUUID()}`;
const email = `${tag}@example.invalid`;
let app: INestApplication | undefined;
let base = '';
let cookie = '';
let userId = '';
let organizationId = '';
let roleId = '';
let resourceTypeId = '';
let resourceId = '';
let staffId = '';
let serviceId = '';
let guestId = '';
let originalHour: OrganizationOpeningHour | null = null;
const start = '2030-01-07T02:00:00.000Z';

async function call(path: string, method = 'GET', body?: unknown, authenticated = true) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(authenticated ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => undefined);
  return { status: response.status, result };
}

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: tag, email, password: 'StrongPassw0rd!' }),
  });
  expect(response.ok).toBe(true);
  cookie = response.headers.get('set-cookie') ?? '';
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { memberships: true },
  });
  userId = user.id;
  organizationId = user.memberships[0].organizationId;
  originalHour = await prisma.organizationOpeningHour.findUnique({
    where: { organizationId_dayOfWeek: { organizationId, dayOfWeek: 1 } },
  });
  const role = await prisma.role.create({ data: { organizationId, name: tag } });
  roleId = role.id;
  const keys = [
    'customer.read.own',
    'customer.update.own',
    'booking.create.own',
    'booking.read.own',
    'service.read',
  ];
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
  });
  await prisma.membership.update({ where: { id: user.memberships[0].id }, data: { roleId } });
});

afterAll(async () => {
  if (organizationId) {
    await prisma.booking.deleteMany({
      where: { organizationId, bookingNumber: { startsWith: 'BK-' }, createdByUserId: userId },
    });
    await prisma.staffWorkingSchedule.deleteMany({ where: { staffId } });
    if (originalHour)
      await prisma.organizationOpeningHour.update({
        where: { id: originalHour.id },
        data: {
          openTime: originalHour.openTime,
          closeTime: originalHour.closeTime,
          status: originalHour.status,
        },
      });
    else
      await prisma.organizationOpeningHour.deleteMany({ where: { organizationId, dayOfWeek: 1 } });
    await prisma.service.deleteMany({ where: { id: serviceId } });
    await prisma.resource.deleteMany({ where: { id: resourceId } });
    await prisma.resourceType.deleteMany({ where: { id: resourceTypeId } });
    await prisma.staffProfile.deleteMany({ where: { id: staffId } });
    await prisma.customerProfile.deleteMany({ where: { organizationId, userId } });
    if (guestId) await prisma.customerProfile.deleteMany({ where: { id: guestId } });
    await prisma.membership.deleteMany({ where: { organizationId, userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.role.deleteMany({ where: { id: roleId } });
  }
  await app?.close();
  await prisma.$disconnect();
});

describe('Milestone 5 HTTP integration', () => {
  it('requires a real session and completes only the current user profile', async () => {
    expect((await call('/bookings/my', 'GET', undefined, false)).status).toBe(401);
    expect((await call('/bookings', 'GET')).status).toBe(403);
    expect(
      (
        await call('/customers/me', 'POST', {
          firstName: 'Test',
          lastName: 'Customer',
          phone: '123',
          userId: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const complete = await call('/customers/me', 'POST', {
      firstName: 'Test',
      lastName: 'Customer',
      phone: '123',
    });
    expect(complete.status).toBe(201);
    expect(complete.result.userId).toBe(userId);
    expect(complete.result.organizationId).toBe(organizationId);
    expect((await call('/customers/me')).status).toBe(200);
  });
  it('uses tenant permissions for resource and scheduling APIs', async () => {
    expect(
      (await call('/resources', 'POST', { name: tag, resourceTypeId: randomUUID(), capacity: 1 }))
        .status,
    ).toBe(403);
    const keys = [
      'resource.type.manage',
      'resource.create',
      'resource.read',
      'resource.update',
      'resource.disable',
      'organization.read',
      'organization.settings.manage',
      'staff.read.all',
      'staff.schedule.manage',
      'booking.read.all',
      'booking.assign_staff',
      'booking.assign_resource',
      'booking.status.update',
    ];
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    });
    const type = await call('/resource-types', 'POST', { name: tag });
    expect(type.status).toBe(201);
    resourceTypeId = type.result.id;
    expect(
      (await call('/resources', 'POST', { name: `${tag}-invalid`, resourceTypeId, capacity: 0 }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('/resources', 'POST', {
          name: `${tag}-forged`,
          resourceTypeId,
          capacity: 1,
          organizationId: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const resource = await call('/resources', 'POST', { name: tag, resourceTypeId, capacity: 1 });
    expect(resource.status).toBe(201);
    resourceId = resource.result.id;
    expect(
      (
        await call(`/resources/${resourceId}`, 'PATCH', {
          name: `${tag}-updated`,
          resourceTypeId,
          capacity: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('/opening-hours', 'PUT', { dayOfWeek: 1, openTime: '18:00', closeTime: '09:00' }))
        .status,
    ).toBe(400);
    expect(
      (await call('/opening-hours', 'PUT', { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00' }))
        .status,
    ).toBe(200);
    const staff = await prisma.staffProfile.create({
      data: { organizationId, employeeCode: tag, displayName: tag, email, phone: '123' },
    });
    staffId = staff.id;
    expect(
      (
        await call(`/staff/${staffId}/schedule`, 'PUT', {
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '18:00',
        })
      ).status,
    ).toBe(200);
  });
  it('checks availability, books as confirmed, and assigns the per-service staff/resource', async () => {
    const service = await prisma.service.create({
      data: {
        organizationId,
        name: tag,
        durationMinutes: 30,
        priceMinor: 5000,
        currency: 'MYR',
        requiredStaffCount: 1,
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 5,
        requiredResourceTypes: { create: [{ resourceTypeId, requiredCount: 1 }] },
      },
    });
    serviceId = service.id;
    const body = { startDateTime: start, services: [{ serviceId, quantity: 1 }] };
    const check = await call('/availability/check', 'POST', body);
    expect(check.status).toBe(201);
    expect(check.result.available).toBe(true);
    const booking = await call('/bookings', 'POST', body);
    expect(booking.status, JSON.stringify(booking.result)).toBe(201);
    expect(booking.result.status).toBe('CONFIRMED');
    expect(
      (await call('/bookings', 'POST', { ...body, organizationId: randomUUID() })).status,
    ).toBe(400);
    const bookingId = booking.result.id as string;
    const lineId = booking.result.services[0].id as string;
    expect((await call('/bookings/my')).result).toHaveLength(1);
    expect((await call(`/bookings/my/${bookingId}`)).status).toBe(200);
    expect((await call(`/bookings/${bookingId}`)).status).toBe(200);
    expect(
      (await call(`/bookings/${bookingId}/services/${lineId}/staff`, 'PUT', { ids: [staffId] }))
        .status,
    ).toBe(200);
    const assignedDetail = await call(`/bookings/${bookingId}`);
    expect(assignedDetail.status).toBe(200);
    expect(assignedDetail.result.services[0].staffAssignments).toEqual([
      expect.objectContaining({
        staffId,
        status: 'ACTIVE',
        staff: expect.objectContaining({ displayName: tag }),
      }),
    ]);
    const assignedList = await call('/bookings');
    expect(assignedList.result.find((item: { id: string }) => item.id === bookingId)
      ?.services[0].staffAssignments[0].staff.displayName).toBe(tag);
    expect(
      (
        await call(`/bookings/${bookingId}/services/${lineId}/resources`, 'PUT', {
          ids: [resourceId],
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(`/bookings/${bookingId}/status`, 'PATCH', { status: 'CHECKED_IN' })).status,
    ).toBe(200);
    expect(
      (await call(`/bookings/${bookingId}/status`, 'PATCH', { status: 'IN_PROGRESS' })).status,
    ).toBe(200);
    expect((await call(`/resources/${resourceId}/status`, 'PATCH', {})).status).toBe(200);
  });
  it('gates receptionist search and selected-customer booking by existing permissions', async () => {
    await prisma.resource.update({ where: { id: resourceId }, data: { status: 'ACTIVE' } });
    expect((await call('/customers/booking-search?q=Guest')).status).toBe(403);
    expect((await call('/bookings/for-customer', 'POST', { customerId: randomUUID(), startDateTime: '2030-01-14T02:00:00Z', services: [{ serviceId, quantity: 1 }] })).status).toBe(403);
    const permissions = await prisma.permission.findMany({ where: { key: { in: ['customer.read.all', 'customer.create', 'booking.create.all'] } } });
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permissionId: permission.id })) });
    const created = await call('/customers', 'POST', { firstName: 'Desk', lastName: 'Guest', displayName: 'Desk Guest', email: `${tag}-guest@example.invalid`, phone: '+60123456789' });
    expect(created.status).toBe(201);
    guestId = created.result.id;
    const found = await call('/customers/booking-search?q=012-3456789');
    expect(found.status).toBe(200);
    expect(found.result.some((item: { id: string }) => item.id === guestId)).toBe(true);
    const body = { customerId: guestId, startDateTime: '2030-01-14T02:00:00Z', services: [{ serviceId, quantity: 1 }] };
    const availability = await call('/availability/check-for-customer', 'POST', { startDateTime: body.startDateTime, services: body.services });
    expect(availability.status).toBe(201);
    expect(availability.result.available).toBe(true);
    const booking = await call('/bookings/for-customer', 'POST', body);
    expect(booking.status, JSON.stringify(booking.result)).toBe(201);
    expect(booking.result.customerId).toBe(guestId);
    expect((await call('/bookings/for-customer', 'POST', { ...body, customerId: randomUUID(), startDateTime: '2030-01-21T02:00:00Z' })).status).toBe(404);
  });
});
