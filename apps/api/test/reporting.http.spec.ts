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
const tag = `m8http-${randomUUID()}`;
let app: INestApplication | undefined;
let base = '';
let cookie = '';
let userId = '';
let organizationId = '';
let otherOrganizationId = '';
let roleId = '';
let bookingId = '';

async function call(path: string, method = 'GET', body?: unknown, authenticated = true) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(authenticated ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    result: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : undefined,
    headers: response.headers,
  };
}
const dates = '?from=2030-01-07&to=2030-01-07';

beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const email = `${tag}@example.invalid`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: tag, email, password: 'StrongPassw0rd!' }),
  });
  expect(response.ok).toBe(true);
  cookie = response.headers.get('set-cookie') ?? '';
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  userId = user.id;
  const [organization, other] = await Promise.all([
    prisma.organization.create({ data: { name: tag, slug: tag, timezone: 'Asia/Kuala_Lumpur' } }),
    prisma.organization.create({
      data: { name: `${tag}-other`, slug: `${tag}-other`, timezone: 'Asia/Kuala_Lumpur' },
    }),
  ]);
  organizationId = organization.id;
  otherOrganizationId = other.id;
  const role = await prisma.role.create({ data: { organizationId, name: tag } });
  roleId = role.id;
  await prisma.membership.updateMany({
    where: { userId, organizationId: { not: organizationId } },
    data: { status: 'INACTIVE' },
  });
  await prisma.membership.create({ data: { userId, organizationId, roleId } });
  const [customer, otherCustomer] = await Promise.all([
    prisma.customerProfile.create({
      data: {
        organizationId,
        userId,
        firstName: 'Test',
        lastName: 'Customer',
        displayName: tag,
        email,
        phone: '1',
      },
    }),
    prisma.customerProfile.create({
      data: {
        organizationId: otherOrganizationId,
        firstName: 'Other',
        lastName: 'Customer',
        displayName: 'Other',
        email: `${tag}-other@example.invalid`,
        phone: '1',
      },
    }),
  ]);
  const booking = await prisma.booking.create({
    data: {
      organizationId,
      customerId: customer.id,
      bookingNumber: `${tag}-own`,
      startDateTime: new Date('2030-01-06T16:30:00Z'),
      endDateTime: new Date('2030-01-06T17:00:00Z'),
      status: 'CONFIRMED',
      createdByUserId: userId,
    },
  });
  bookingId = booking.id;
  await prisma.booking.create({
    data: {
      organizationId: otherOrganizationId,
      customerId: otherCustomer.id,
      bookingNumber: `${tag}-foreign`,
      startDateTime: new Date('2030-01-06T16:30:00Z'),
      endDateTime: new Date('2030-01-06T17:00:00Z'),
      status: 'CONFIRMED',
      createdByUserId: userId,
    },
  });
});

afterAll(async () => {
  const organizations = [organizationId, otherOrganizationId].filter(Boolean);
  await prisma.booking.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.customerProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.role.deleteMany({ where: { id: roleId } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await app?.close();
  await prisma.$disconnect();
});

describe('Milestone 8 real HTTP reporting and settings', () => {
  it('denies unauthenticated and unpermitted reports and settings', async () => {
    expect((await call(`/reports/dashboard${dates}`, 'GET', undefined, false)).status).toBe(401);
    expect((await call(`/reports/dashboard${dates}`)).status).toBe(403);
    expect((await call('/settings/organization')).status).toBe(403);
    expect((await call(`/exports/bookings.csv${dates}`)).status).toBe(403);
  });

  it('scopes operations and finance reports independently and rejects client tenant claims', async () => {
    const operations = await prisma.permission.findUniqueOrThrow({
      where: { key: 'report.read.operations' },
    });
    await prisma.rolePermission.create({ data: { roleId, permissionId: operations.id } });
    const dashboard = await call(`/reports/dashboard${dates}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.result.bookingsInRange).toBe(1);
    expect('recordedPaymentsByCurrency' in dashboard.result).toBe(false);
    expect(
      (await call(`/reports/dashboard${dates}&organizationId=${otherOrganizationId}`)).status,
    ).toBe(400);
    expect((await call(`/reports/payments${dates}`)).status).toBe(403);
    const finance = await prisma.permission.findUniqueOrThrow({
      where: { key: 'report.read.finance' },
    });
    await prisma.rolePermission.create({ data: { roleId, permissionId: finance.id } });
    expect((await call(`/reports/payments${dates}`)).status).toBe(200);
    expect((await call(`/reports/dashboard${dates}`)).result.recordedPaymentsByCurrency).toEqual(
      [],
    );
  });

  it('exports only filtered tenant data and validates tenant-owned settings', async () => {
    const permissions = await prisma.permission.findMany({
      where: {
        key: { in: ['report.export', 'organization.read', 'organization.settings.manage'] },
      },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    });
    const exportResult = await call(`/exports/bookings.csv${dates}`);
    expect(exportResult.status).toBe(200);
    expect(exportResult.headers.get('content-type')).toContain('text/csv');
    expect(exportResult.text).toContain('"bookingId","bookingNumber"');
    expect(exportResult.text).toContain(bookingId);
    expect(exportResult.text).not.toContain(`${tag}-foreign`);
    for (const name of ['payments', 'commissions', 'attendance', 'leave']) {
      const result = await call(`/exports/${name}.csv${dates}`);
      expect(result.status).toBe(200);
      expect(result.headers.get('content-type')).toContain('text/csv');
    }
    expect(
      (await call('/settings/organization', 'PATCH', { timezone: 'Not/A_Timezone' })).status,
    ).toBe(400);
    expect(
      (
        await call('/settings/organization', 'PATCH', {
          name: 'Changed',
          organizationId: otherOrganizationId,
        })
      ).status,
    ).toBe(400);
    const updated = await call('/settings/organization', 'PATCH', {
      name: `${tag}-updated`,
      timezone: 'Asia/Kuala_Lumpur',
      defaultCurrency: 'MYR',
    });
    expect(updated.status).toBe(200);
    expect(updated.result.id).toBe(organizationId);
    expect((await call('/settings/organization')).result.name).toBe(`${tag}-updated`);
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: otherOrganizationId } })).name,
    ).toBe(`${tag}-other`);
  });
});
