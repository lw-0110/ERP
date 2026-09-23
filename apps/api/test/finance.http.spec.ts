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
const tag = `m7http-${randomUUID()}`;
let app: INestApplication | undefined;
let base = '';
let organizationId = '';
let roleId = '';
let serviceId = '';
let bookingId = '';
let lineId = '';
let staffId = '';
const userIds: string[] = [];
const cookies: string[] = [];

async function signup(index: number) {
  const email = `${tag}-${index}@example.invalid`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: tag, email, password: 'StrongPassw0rd!' }),
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
  const owner = await signup(0);
  const staffUser = await signup(1);
  const role = await prisma.role.create({ data: { organizationId, name: tag } });
  roleId = role.id;
  const ownPermissions = await prisma.permission.findMany({
    where: { key: { in: ['payment.read.own', 'booking.read.own', 'commission.read.own'] } },
  });
  await prisma.rolePermission.createMany({
    data: ownPermissions.map((permission) => ({ roleId, permissionId: permission.id })),
  });
  await prisma.membership.updateMany({
    where: { organizationId, userId: { in: userIds } },
    data: { roleId },
  });
  const customer = await prisma.customerProfile.create({
    data: {
      organizationId,
      userId: owner.id,
      firstName: 'Test',
      lastName: 'Owner',
      displayName: 'Test Owner',
      email: owner.email,
      phone: '1',
    },
  });
  const staff = await prisma.staffProfile.create({
    data: {
      organizationId,
      userId: staffUser.id,
      employeeCode: tag,
      displayName: tag,
      email: staffUser.email,
      phone: '1',
    },
  });
  staffId = staff.id;
  const service = await prisma.service.create({
    data: { organizationId, name: tag, durationMinutes: 30, priceMinor: 1000, currency: 'MYR' },
  });
  serviceId = service.id;
  const booking = await prisma.booking.create({
    data: {
      organizationId,
      customerId: customer.id,
      bookingNumber: tag,
      startDateTime: new Date('2031-01-07T02:00:00Z'),
      endDateTime: new Date('2031-01-07T02:30:00Z'),
      createdByUserId: owner.id,
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
            requiredResourceTypeCountsSnapshot: [],
            quantity: 1,
            lineTotalMinor: 1000,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { services: true },
  });
  bookingId = booking.id;
  lineId = booking.services[0].id;
  await prisma.bookingStaff.create({
    data: { bookingServiceId: lineId, staffId, assignedByUserId: owner.id },
  });
});

afterAll(async () => {
  if (organizationId) {
    await prisma.commissionRecord.deleteMany({ where: { organizationId, bookingId } });
    await prisma.paymentRecord.deleteMany({ where: { organizationId, bookingId } });
    await prisma.commissionRule.deleteMany({ where: { organizationId, serviceId } });
    await prisma.booking.deleteMany({ where: { id: bookingId, organizationId } });
    await prisma.service.deleteMany({ where: { id: serviceId, organizationId } });
    await prisma.staffProfile.deleteMany({ where: { id: staffId, organizationId } });
    await prisma.customerProfile.deleteMany({ where: { organizationId, userId: userIds[0] } });
    await prisma.membership.deleteMany({ where: { organizationId, userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: roleId } });
  }
  await app?.close();
  await prisma.$disconnect();
});

describe('Milestone 7 real HTTP permissions and finance routes', () => {
  it('protects own payment summary and denies unprivileged mutations', async () => {
    expect(
      (await call(`/bookings/my/${bookingId}/payment-summary`, 'GET', undefined, -1)).status,
    ).toBe(401);
    const own = await call(`/bookings/my/${bookingId}/payment-summary`);
    expect(own.status).toBe(200);
    expect(own.result.paymentStatus).toBe('UNPAID');
    expect(
      (await call(`/bookings/my/${bookingId}/payment-summary`, 'GET', undefined, 1)).status,
    ).toBe(404);
    expect(
      (
        await call(`/bookings/${bookingId}/payments`, 'POST', {
          amountMinor: 100,
          currency: 'MYR',
          paymentMethod: 'Cash',
          paidAt: new Date().toISOString(),
        })
      ).status,
    ).toBe(403);
    expect((await call('/commissions/my', 'GET', undefined, 1)).status).toBe(200);
    expect((await call('/commissions/my')).status).toBe(403);
  });

  it('records payment without changing status and enforces manual commission timing', async () => {
    const keys = [
      'payment.read.all',
      'payment.record',
      'payment.status.manage',
      'commission.rule.manage',
      'commission.read.all',
      'commission.record',
    ];
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    });
    const payment = await call(`/bookings/${bookingId}/payments`, 'POST', {
      amountMinor: 500,
      currency: 'MYR',
      paymentMethod: 'Manual',
      paidAt: new Date().toISOString(),
    });
    expect(payment.status).toBe(201);
    expect((await call(`/bookings/${bookingId}/payment-summary`)).result.paymentStatus).toBe(
      'UNPAID',
    );
    expect(
      (await call(`/bookings/${bookingId}/payment-status`, 'PATCH', { status: 'PARTIALLY_PAID' }))
        .status,
    ).toBe(200);
    expect(
      (await call(`/bookings/${bookingId}/payment-summary`)).result.totalsByCurrency[0].paidMinor,
    ).toBe(500);
    const rule = await call('/commission-rules', 'POST', {
      serviceId,
      configuration: { note: 'Draft only' },
    });
    expect(rule.status).toBe(201);
    expect(rule.result.status).toBe('DRAFT');
    const commissionBody = {
      bookingId,
      bookingServiceId: lineId,
      staffId,
      amountMinor: 100,
      currency: 'MYR',
      explanation: 'Manual earned commission',
    };
    expect((await call('/commissions', 'POST', commissionBody)).status).toBe(400);
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });
    const earned = await call('/commissions', 'POST', commissionBody);
    expect(earned.status).toBe(201);
    expect(earned.result.sourceSnapshot.kind).toBe('MANUAL');
    expect((await call('/commissions', 'POST', commissionBody)).status).toBe(409);
    expect((await call('/commissions/my', 'GET', undefined, 1)).result).toHaveLength(1);
    expect((await call('/commissions')).result).toHaveLength(1);
  });
});
