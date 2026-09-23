import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
const { prisma } = await import('../auth/prisma.js');
const { PaymentService } = await import('./payment.service.js');
const { CommissionService } = await import('./commission.service.js');
const { StaffIdentityService } = await import('../staff-operations/staff-identity.service.js');
const payments = new PaymentService();
const commissions = new CommissionService(new StaffIdentityService());
const tag = `m7-${randomUUID()}`;
let organizationId = ''; let otherOrganizationId = ''; let adminId = ''; let customerId = ''; let staffUserId = ''; let staffId = '';
let serviceId = ''; let bookingId = ''; let lineId = ''; let ruleId = '';

beforeAll(async () => {
  const [organization, other, admin, customer, staffUser] = await Promise.all([
    prisma.organization.create({ data: { name: tag, slug: tag } }),
    prisma.organization.create({ data: { name: `${tag}-other`, slug: `${tag}-other` } }),
    prisma.user.create({ data: { name: tag, email: `${tag}-admin@example.invalid` } }),
    prisma.user.create({ data: { name: tag, email: `${tag}-customer@example.invalid` } }),
    prisma.user.create({ data: { name: tag, email: `${tag}-staff@example.invalid` } }),
  ]);
  organizationId = organization.id; otherOrganizationId = other.id; adminId = admin.id; customerId = customer.id; staffUserId = staffUser.id;
  await prisma.membership.createMany({ data: [adminId, customerId, staffUserId].map((userId) => ({ organizationId, userId })) });
  const customerProfile = await prisma.customerProfile.create({ data: { organizationId, userId: customerId, firstName: 'Test', lastName: 'Customer', displayName: 'Test Customer', email: customer.email, phone: '1' } });
  const staff = await prisma.staffProfile.create({ data: { organizationId, userId: staffUserId, employeeCode: tag, displayName: tag, email: staffUser.email, phone: '1' } }); staffId = staff.id;
  const service = await prisma.service.create({ data: { organizationId, name: tag, durationMinutes: 30, priceMinor: 1000, currency: 'MYR' } }); serviceId = service.id;
  const booking = await prisma.booking.create({ data: { organizationId, customerId: customerProfile.id, bookingNumber: tag, startDateTime: new Date('2030-01-07T02:00:00Z'), endDateTime: new Date('2030-01-07T03:00:00Z'), createdByUserId: customerId, services: { create: [
    { serviceId, unitPriceMinorSnapshot: 1000, currencySnapshot: 'MYR', durationMinutesSnapshot: 30, bufferBeforeMinutesSnapshot: 0, bufferAfterMinutesSnapshot: 0, requiredStaffCountSnapshot: 1, requiredSkillIdsSnapshot: [], requiredSkillCountsSnapshot: [], requiredResourceTypeCountsSnapshot: [], quantity: 1, lineTotalMinor: 1000, sortOrder: 0 },
    { serviceId, unitPriceMinorSnapshot: 2000, currencySnapshot: 'USD', durationMinutesSnapshot: 30, bufferBeforeMinutesSnapshot: 0, bufferAfterMinutesSnapshot: 0, requiredStaffCountSnapshot: 1, requiredSkillIdsSnapshot: [], requiredSkillCountsSnapshot: [], requiredResourceTypeCountsSnapshot: [], quantity: 1, lineTotalMinor: 2000, sortOrder: 1 },
  ] } }, include: { services: true } });
  bookingId = booking.id; lineId = booking.services[0].id;
  await prisma.bookingStaff.create({ data: { bookingServiceId: lineId, staffId, assignedByUserId: adminId } });
});

afterAll(async () => {
  const organizations = [organizationId, otherOrganizationId].filter(Boolean);
  await prisma.commissionRecord.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.paymentRecord.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.commissionRule.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.service.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.staffProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.customerProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.membership.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, customerId, staffUserId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.$disconnect();
});

describe('Milestone 7 PostgreSQL-backed finance foundation', () => {
  it('records append-only positive ISO-currency payments without deriving status and protects own summary', async () => {
    const input = { amountMinor: 500, currency: 'MYR', paymentMethod: 'Manual transfer', paidAt: new Date() };
    await expect(payments.record(organizationId, bookingId, adminId, { ...input, amountMinor: 1.5 })).rejects.toThrow();
    await expect(payments.record(organizationId, bookingId, adminId, { ...input, currency: 'ZZZ' })).rejects.toThrow();
    await expect(payments.record(otherOrganizationId, bookingId, adminId, input)).rejects.toThrow();
    const recorded = await payments.record(organizationId, bookingId, adminId, input);
    expect(recorded.amountMinor).toBe(500);
    const summary = await payments.summary(organizationId, bookingId, customerId);
    expect(summary.paymentStatus).toBe('UNPAID');
    expect(summary.totalsByCurrency).toEqual([{ currency: 'MYR', bookedMinor: 1000, paidMinor: 500 }, { currency: 'USD', bookedMinor: 2000, paidMinor: 0 }]);
    await expect(payments.summary(organizationId, bookingId, adminId)).rejects.toThrow();
    await expect(payments.summary(otherOrganizationId, bookingId, customerId)).rejects.toThrow();
    await payments.setStatus(organizationId, bookingId, 'PARTIALLY_PAID');
    expect((await payments.summary(organizationId, bookingId)).paymentStatus).toBe('PARTIALLY_PAID');
    expect((await payments.list(organizationId, bookingId)).map((item) => item.id)).toContain(recorded.id);
  });

  it('keeps generic draft rules versioned and tenant-scoped without calculation', async () => {
    await expect(commissions.createRule(otherOrganizationId, serviceId, { memo: 'Draft' })).rejects.toThrow();
    const rule = await commissions.createRule(organizationId, serviceId, { memo: 'Initial draft' }); ruleId = rule.id;
    expect(rule.status).toBe('DRAFT'); expect(rule.version).toBe(1);
    const changed = await commissions.updateRule(organizationId, rule.id, { memo: 'Revised draft' });
    expect(changed.version).toBe(2);
    await expect(commissions.updateRule(otherOrganizationId, rule.id, {})).rejects.toThrow();
  });

  it('permits one manual earned record only for completed assigned work and freezes source history', async () => {
    const input = { bookingId, bookingServiceId: lineId, staffId, amountMinor: 250, currency: 'MYR', explanation: 'Manually approved earned amount' };
    for (const status of ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'] as const) {
      await prisma.booking.update({ where: { id: bookingId }, data: { status } });
      await expect(commissions.record(organizationId, adminId, input)).rejects.toThrow();
    }
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED' } });
    await expect(commissions.record(organizationId, adminId, { ...input, staffId: randomUUID() })).rejects.toThrow();
    await expect(commissions.record(otherOrganizationId, adminId, input)).rejects.toThrow();
    const earned = await commissions.record(organizationId, adminId, input);
    expect(earned.amountMinor).toBe(250);
    await expect(commissions.record(organizationId, adminId, input)).rejects.toThrow();
    await prisma.service.update({ where: { id: serviceId }, data: { priceMinor: 9999 } });
    await commissions.updateRule(organizationId, ruleId, { memo: 'Later draft revision' });
    const unchanged = await prisma.commissionRecord.findUniqueOrThrow({ where: { id: earned.id } });
    expect(unchanged.sourceSnapshot).toEqual(earned.sourceSnapshot);
    expect(unchanged.amountMinor).toBe(250);
    expect((await commissions.mine(organizationId, staffUserId)).map((item) => item.id)).toContain(earned.id);
    await expect(commissions.mine(otherOrganizationId, staffUserId)).rejects.toThrow();
    expect((await commissions.list(organizationId)).map((item) => item.id)).toContain(earned.id);
  });
});
