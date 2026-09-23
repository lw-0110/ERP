import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
const { prisma } = await import('../auth/prisma.js');
const { ReportService } = await import('./report.service.js');
const { StaffIdentityService } = await import('../staff-operations/staff-identity.service.js');
const { CommissionService } = await import('../finance/commission.service.js');
const { csv } = await import('./csv.js');
const reports = new ReportService(new StaffIdentityService());
const commissions = new CommissionService(new StaffIdentityService());
const tag = `m8-${randomUUID()}`;
const filter = { from: '2030-01-07', to: '2030-01-07' };
let organizationId = '';
let otherOrganizationId = '';
let userId = '';
let staffUserId = '';
let staffId = '';
let serviceId = '';
let bookingId = '';
let commissionDate = '';

beforeAll(async () => {
  const [organization, other, user, staffUser] = await Promise.all([
    prisma.organization.create({ data: { name: tag, slug: tag, timezone: 'Asia/Kuala_Lumpur' } }),
    prisma.organization.create({
      data: { name: `${tag}-other`, slug: `${tag}-other`, timezone: 'Asia/Kuala_Lumpur' },
    }),
    prisma.user.create({ data: { name: tag, email: `${tag}@example.invalid` } }),
    prisma.user.create({ data: { name: `${tag}-staff`, email: `${tag}-staff@example.invalid` } }),
  ]);
  organizationId = organization.id;
  otherOrganizationId = other.id;
  userId = user.id;
  staffUserId = staffUser.id;
  const customer = await prisma.customerProfile.create({
    data: {
      organizationId,
      userId,
      firstName: 'Test',
      lastName: 'Customer',
      displayName: tag,
      email: user.email,
      phone: '1',
    },
  });
  const staff = await prisma.staffProfile.create({
    data: {
      organizationId,
      userId: staffUserId,
      employeeCode: tag,
      displayName: tag,
      email: staffUser.email,
      phone: '1',
    },
  });
  staffId = staff.id;
  const service = await prisma.service.create({
    data: { organizationId, name: tag, durationMinutes: 90, priceMinor: 9000, currency: 'MYR' },
  });
  serviceId = service.id;
  const createBooking = (
    organizationId: string,
    customerId: string,
    startDateTime: string,
    status: 'COMPLETED' | 'CANCELLED' | 'NO_SHOW',
    paymentStatus: 'UNPAID' | 'PAID',
  ) =>
    prisma.booking.create({
      data: {
        organizationId,
        customerId,
        bookingNumber: `${tag}-${randomUUID()}`,
        startDateTime: new Date(startDateTime),
        endDateTime: new Date(new Date(startDateTime).getTime() + 30 * 60_000),
        status,
        paymentStatus,
        createdByUserId: userId,
        services: {
          create: [
            {
              serviceId,
              unitPriceMinorSnapshot: 9000,
              currencySnapshot: 'MYR',
              durationMinutesSnapshot: 30,
              bufferBeforeMinutesSnapshot: 5,
              bufferAfterMinutesSnapshot: 5,
              requiredStaffCountSnapshot: 1,
              requiredSkillIdsSnapshot: [],
              requiredSkillCountsSnapshot: [],
              requiredResourceTypeCountsSnapshot: [],
              quantity: 1,
              lineTotalMinor: 9000,
              sortOrder: 0,
            },
          ],
        },
      },
      include: { services: true },
    });
  const first = await createBooking(
    organizationId,
    customer.id,
    '2030-01-06T16:30:00Z',
    'COMPLETED',
    'PAID',
  );
  bookingId = first.id;
  await createBooking(organizationId, customer.id, '2030-01-06T17:30:00Z', 'CANCELLED', 'UNPAID');
  await createBooking(organizationId, customer.id, '2030-01-06T18:30:00Z', 'NO_SHOW', 'UNPAID');
  await createBooking(organizationId, customer.id, '2030-01-07T16:30:00Z', 'COMPLETED', 'PAID');
  const foreignCustomer = await prisma.customerProfile.create({
    data: {
      organizationId: otherOrganizationId,
      firstName: 'Other',
      lastName: 'Customer',
      displayName: 'Other',
      email: `${tag}-other@example.invalid`,
      phone: '1',
    },
  });
  await prisma.booking.create({
    data: {
      organizationId: otherOrganizationId,
      customerId: foreignCustomer.id,
      bookingNumber: `${tag}-foreign`,
      startDateTime: new Date('2030-01-06T16:30:00Z'),
      endDateTime: new Date('2030-01-06T17:00:00Z'),
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      createdByUserId: userId,
    },
  });
  await prisma.bookingStaff.create({
    data: { bookingServiceId: first.services[0].id, staffId, assignedByUserId: userId },
  });
  await prisma.paymentRecord.createMany({
    data: [
      {
        organizationId,
        bookingId,
        amountMinor: 5000,
        currency: 'MYR',
        paymentMethod: 'Cash',
        paidAt: new Date('2030-01-06T17:00:00Z'),
        recordedByUserId: userId,
      },
      {
        organizationId,
        bookingId,
        amountMinor: 20,
        currency: 'USD',
        paymentMethod: 'Transfer',
        paidAt: new Date('2030-01-06T17:15:00Z'),
        recordedByUserId: userId,
      },
    ],
  });
  const earned = await commissions.record(organizationId, userId, {
    bookingId,
    bookingServiceId: first.services[0].id,
    staffId,
    amountMinor: 3000,
    currency: 'MYR',
    explanation: 'Manual historical earning',
  });
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(earned.createdAt);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  commissionDate = `${part('year')}-${part('month')}-${part('day')}`;
  await prisma.attendanceRecord.createMany({
    data: [
      {
        organizationId,
        staffId,
        workDate: new Date('2030-01-07T00:00:00Z'),
        clockInAt: new Date('2030-01-07T01:00:00Z'),
        clockOutAt: new Date('2030-01-07T02:30:00Z'),
        status: 'PRESENT',
      },
      {
        organizationId,
        staffId,
        workDate: new Date('2030-01-07T00:00:00Z'),
        clockInAt: new Date('2030-01-07T03:00:00Z'),
        status: 'INCOMPLETE',
      },
    ],
  });
  const leaveType = await prisma.leaveType.create({ data: { organizationId, name: tag } });
  await prisma.leaveRequest.create({
    data: {
      organizationId,
      staffId,
      leaveTypeId: leaveType.id,
      startDateTime: new Date('2030-01-06T15:00:00Z'),
      endDateTime: new Date('2030-01-06T18:00:00Z'),
      status: 'PENDING',
    },
  });
});

afterAll(async () => {
  const organizations = [organizationId, otherOrganizationId].filter(Boolean);
  await prisma.commissionRecord.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.paymentRecord.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.leaveRequest.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.attendanceRecord.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.leaveType.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.service.deleteMany({ where: { id: serviceId } });
  await prisma.staffProfile.deleteMany({ where: { id: staffId } });
  await prisma.customerProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, staffUserId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.$disconnect();
});

describe('Milestone 8 PostgreSQL reports', () => {
  it('uses organization-local date boundaries and historical BookingService snapshots', async () => {
    const bookings = await reports.bookings(organizationId, filter);
    expect(bookings.totalBookings).toBe(3);
    expect(bookings.completedCount).toBe(1);
    expect(bookings.cancelledCount).toBe(1);
    expect(bookings.noShowCount).toBe(1);
    expect(bookings.durationMinutes).toBe(120);
    expect(bookings.byService).toEqual([{ serviceId, bookingCount: 3, executionCount: 3 }]);
    expect(bookings.byStaff).toEqual([{ staffId, assignmentCount: 1 }]);
    await prisma.service.update({
      where: { id: serviceId },
      data: { durationMinutes: 180, priceMinor: 15000 },
    });
    expect((await reports.bookings(organizationId, filter)).durationMinutes).toBe(120);
    expect((await reports.bookings(otherOrganizationId, filter)).totalBookings).toBe(1);
    await expect(reports.bookings(organizationId, { from: '2030-02-30' })).rejects.toThrow();
  });

  it('separates currencies and recorded values from manual payment status and current rules', async () => {
    const payments = await reports.payments(organizationId, filter);
    expect(payments.byCurrency).toEqual([
      { currency: 'MYR', amountMinor: 5000, count: 1 },
      { currency: 'USD', amountMinor: 20, count: 1 },
    ]);
    expect(payments.bookingPaymentStatusDistribution).toEqual([
      { key: 'PAID', count: 1 },
      { key: 'UNPAID', count: 2 },
    ]);
    expect(
      (await reports.payments(organizationId, { ...filter, currency: 'USD' })).byCurrency,
    ).toEqual([{ currency: 'USD', amountMinor: 20, count: 1 }]);
    expect(
      (await reports.payments(organizationId, { ...filter, status: 'UNPAID' })).paymentCount,
    ).toBe(0);
    const commissionFilter = { from: commissionDate, to: commissionDate };
    const commission = await reports.commissions(organizationId, commissionFilter);
    expect(commission.byCurrency).toEqual([{ currency: 'MYR', amountMinor: 3000, count: 1 }]);
    expect(commission.byStaffAndService[0].staffId).toBe(staffId);
    expect(
      (await reports.ownCommissions(organizationId, staffUserId, commissionFilter)).commissionCount,
    ).toBe(1);
    await expect(
      reports.ownCommissions(otherOrganizationId, staffUserId, commissionFilter),
    ).rejects.toThrow();
    expect((await reports.commissions(otherOrganizationId, commissionFilter)).commissionCount).toBe(
      0,
    );
  });

  it('reports raw recorded attendance duration, open clock-ins, leave overlap, and staff summary', async () => {
    const attendance = await reports.attendance(organizationId, filter);
    expect(attendance.recordCount).toBe(2);
    expect(attendance.totalRecordedDurationMs).toBe(90 * 60_000);
    expect(attendance.currentlyClockedIn).toBe(1);
    const leave = await reports.leave(organizationId, filter);
    expect(leave.pendingCount).toBe(1);
    expect(leave.requestCount).toBe(1);
    expect(
      (await reports.leave(organizationId, { ...filter, status: 'REJECTED' })).requestCount,
    ).toBe(0);
    expect(
      (
        await reports.leave(organizationId, {
          ...filter,
          staffId,
          leaveTypeId: leave.rows[0].leaveTypeId,
        })
      ).requestCount,
    ).toBe(1);
    expect(
      (await reports.leave(organizationId, { ...filter, staffId: randomUUID() })).requestCount,
    ).toBe(0);
    const staff = await reports.staff(organizationId, staffId, filter);
    expect(staff.assignedBookingServiceCount).toBe(1);
    expect(staff.completedBookingServiceCount).toBe(1);
    expect('commissionByCurrency' in staff).toBe(false);
    expect(
      (
        await reports.staff(
          organizationId,
          staffId,
          { from: commissionDate, to: commissionDate },
          true,
        )
      ).commissionByCurrency?.[0].amountMinor,
    ).toBe(3000);
    await expect(reports.staff(otherOrganizationId, staffId, filter)).rejects.toThrow();
    const dashboard = await reports.dashboard(organizationId, filter, true);
    expect(dashboard.bookingsInRange).toBe(3);
    expect(dashboard.pendingLeaveRequests).toBe(1);
    expect(dashboard.recordedPaymentsByCurrency).toHaveLength(2);
    expect(
      'recordedPaymentsByCurrency' in (await reports.dashboard(organizationId, filter, false)),
    ).toBe(false);
  });

  it('emits stable UTF-8-safe CSV columns and neutralizes formula cells', () => {
    const exported = csv(
      ['bookingNumber', 'status'],
      [{ bookingNumber: '=1+1', status: 'CONFIRMED' }],
    );
    expect(exported.startsWith('\uFEFF"bookingNumber","status"\r\n')).toBe(true);
    expect(exported).toContain('"\'=1+1"');
  });
});
