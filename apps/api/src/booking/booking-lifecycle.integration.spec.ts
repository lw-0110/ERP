import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
const { prisma } = await import('../auth/prisma.js');
const { AvailabilityService } = await import('./availability.service.js');
const { AssignmentService } = await import('./assignment.service.js');
const { BookingLifecycleService } = await import('./booking-lifecycle.service.js');
const { BookingPolicyService } = await import('./booking-policy.service.js');
const { BookingService } = await import('./booking.service.js');
const { SchedulingService } = await import('./scheduling.service.js');

const availability = new AvailabilityService();
const policies = new BookingPolicyService();
const lifecycle = new BookingLifecycleService(availability, policies);
const bookings = new BookingService(availability);
const assignments = new AssignmentService(availability);
const schedules = new SchedulingService();
const tag = `m10-${randomUUID()}`;
let organizationId = '';
let otherOrganizationId = '';
let userId = '';
let otherUserId = '';
let serviceId = '';
let resourceTypeId = '';
let staffIds: string[] = [];
let resourceIds: string[] = [];
const monday = new Date('2030-01-07T02:00:00.000Z');

beforeAll(async () => {
  const [organization, otherOrganization, user, otherUser] = await Promise.all([
    prisma.organization.create({
      data: { name: tag, slug: tag, timezone: 'Asia/Kuala_Lumpur', bookingNumberPrefix: 'TEST' },
    }),
    prisma.organization.create({ data: { name: `${tag}-other`, slug: `${tag}-other` } }),
    prisma.user.create({ data: { name: tag, email: `${tag}@example.invalid` } }),
    prisma.user.create({ data: { name: `${tag}-other`, email: `${tag}-other@example.invalid` } }),
  ]);
  organizationId = organization.id;
  otherOrganizationId = otherOrganization.id;
  userId = user.id;
  otherUserId = otherUser.id;
  await prisma.membership.createMany({
    data: [
      { organizationId, userId },
      { organizationId: otherOrganizationId, userId: otherUserId },
    ],
  });
  const customer = await prisma.customerProfile.create({
    data: {
      organizationId,
      userId,
      firstName: 'Lifecycle',
      lastName: 'Customer',
      displayName: tag,
      email: user.email,
      phone: '1',
    },
  });
  expect(customer.id).toBeTruthy();
  const resourceType = await prisma.resourceType.create({ data: { organizationId, name: tag } });
  resourceTypeId = resourceType.id;
  const resources = await Promise.all(
    [1, 2].map((number) =>
      prisma.resource.create({
        data: { organizationId, resourceTypeId, name: `${tag}-resource-${number}`, capacity: 1 },
      }),
    ),
  );
  resourceIds = resources.map(({ id }) => id);
  const staff = await Promise.all(
    [1, 2].map((number) =>
      prisma.staffProfile.create({
        data: {
          organizationId,
          employeeCode: `${tag}-${number}`,
          displayName: `${tag}-${number}`,
          email: `${tag}-${number}@example.invalid`,
          phone: '1',
        },
      }),
    ),
  );
  staffIds = staff.map(({ id }) => id);
  await schedules.openingHour(organizationId, 1, '09:00', '18:00');
  for (const staffId of staffIds)
    await schedules.staffSchedule(organizationId, staffId, 1, '09:00', '18:00');
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
  const organizationIds = [organizationId, otherOrganizationId].filter(Boolean);
  await prisma.bookingChange.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.paymentRecord.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.commissionRecord.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.bookingPolicy.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.staffWorkingSchedule.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.organizationOpeningHour.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.service.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.resource.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.resourceType.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.staffProfile.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.customerProfile.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  await prisma.$disconnect();
});

describe('Milestone 10 booking lifecycle', () => {
  it('keeps customer actions disabled by default, enforces cutoff, and preserves paid booking records on cancellation', async () => {
    const booking = await bookings.createForCustomer(organizationId, userId, monday, [
      { serviceId, quantity: 1 },
    ]);
    expect(booking.bookingNumber.startsWith('TEST-')).toBe(true);
    await expect(lifecycle.cancelCustomer(organizationId, userId, booking.id)).rejects.toThrow(
      'disabled',
    );
    await policies.update(organizationId, {
      customerCancellationEnabled: true,
      customerRescheduleEnabled: false,
      cancellationCutoffMinutes: 10_000_000,
      rescheduleCutoffMinutes: null,
      maxCustomerReschedules: null,
    });
    await expect(lifecycle.cancelCustomer(organizationId, userId, booking.id)).rejects.toThrow(
      'cutoff',
    );
    await policies.update(organizationId, {
      customerCancellationEnabled: true,
      customerRescheduleEnabled: false,
      cancellationCutoffMinutes: null,
      rescheduleCutoffMinutes: null,
      maxCustomerReschedules: null,
    });
    await prisma.paymentRecord.create({
      data: {
        organizationId,
        bookingId: booking.id,
        amountMinor: 500,
        currency: 'MYR',
        paymentMethod: 'cash',
        paidAt: new Date(),
        recordedByUserId: userId,
      },
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: 'PARTIALLY_PAID' },
    });
    const cancelled = await lifecycle.cancelCustomer(
      organizationId,
      userId,
      booking.id,
      'Changed plans',
    );
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.warnings).toHaveLength(1);
    expect(await prisma.paymentRecord.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(
      await prisma.bookingChange.count({
        where: { bookingId: booking.id, type: 'CANCELLED', initiatedBy: 'CUSTOMER' },
      }),
    ).toBe(1);
    expect(
      (
        await bookings.createForCustomer(organizationId, userId, monday, [
          { serviceId, quantity: 1 },
        ])
      ).status,
    ).toBe('CONFIRMED');
  });

  it('reschedules from immutable snapshots, excludes itself, keeps valid assignments, and invalidates conflicts', async () => {
    await policies.update(organizationId, {
      customerCancellationEnabled: true,
      customerRescheduleEnabled: true,
      cancellationCutoffMinutes: null,
      rescheduleCutoffMinutes: null,
      maxCustomerReschedules: 1,
    });
    const oldStart = new Date('2030-01-07T04:00:00.000Z');
    const newStart = new Date('2030-01-07T05:00:00.000Z');
    const moving = await bookings.createForCustomer(organizationId, userId, oldStart, [
      { serviceId, quantity: 1 },
    ]);
    const other = await bookings.createForCustomer(organizationId, userId, newStart, [
      { serviceId, quantity: 1 },
    ]);
    await assignments.replaceStaff(organizationId, moving.services[0].id, [staffIds[0]], userId);
    await assignments.replaceResources(
      organizationId,
      moving.services[0].id,
      [resourceIds[0]],
      userId,
    );
    await assignments.replaceStaff(organizationId, moving.services[0].id, [staffIds[0]], userId);
    await assignments.replaceResources(
      organizationId,
      moving.services[0].id,
      [resourceIds[0]],
      userId,
    );
    expect(
      await prisma.bookingStaff.count({
        where: {
          bookingServiceId: moving.services[0].id,
          status: 'INVALIDATED',
          invalidationReason: 'REPLACED',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.bookingResource.count({
        where: {
          bookingServiceId: moving.services[0].id,
          status: 'INVALIDATED',
          invalidationReason: 'REPLACED',
        },
      }),
    ).toBe(1);
    await assignments.replaceStaff(organizationId, other.services[0].id, [staffIds[0]], userId);
    await assignments.replaceResources(
      organizationId,
      other.services[0].id,
      [resourceIds[0]],
      userId,
    );
    const before = await prisma.bookingService.findUniqueOrThrow({
      where: { id: moving.services[0].id },
    });
    const moved = await lifecycle.rescheduleCustomer(
      organizationId,
      userId,
      moving.id,
      newStart,
      'Later works',
    );
    const after = await prisma.bookingService.findUniqueOrThrow({
      where: { id: moving.services[0].id },
    });
    expect(moved.startDateTime).toEqual(newStart);
    expect(moved.invalidatedAssignmentIds.staff).toHaveLength(1);
    expect(moved.invalidatedAssignmentIds.resources).toHaveLength(1);
    expect(after).toMatchObject({
      durationMinutesSnapshot: before.durationMinutesSnapshot,
      requiredStaffCountSnapshot: before.requiredStaffCountSnapshot,
      requiredSkillCountsSnapshot: before.requiredSkillCountsSnapshot,
      requiredResourceTypeCountsSnapshot: before.requiredResourceTypeCountsSnapshot,
    });
    expect(
      await prisma.bookingStaff.count({
        where: {
          bookingServiceId: moving.services[0].id,
          status: 'INVALIDATED',
          invalidationReason: 'RESCHEDULE_CONFLICT',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.bookingResource.count({
        where: {
          bookingServiceId: moving.services[0].id,
          status: 'INVALIDATED',
          invalidationReason: 'RESCHEDULE_CONFLICT',
        },
      }),
    ).toBe(1);
    await expect(
      lifecycle.rescheduleCustomer(organizationId, userId, moving.id, oldStart),
    ).rejects.toThrow('limit');
  });

  it('enforces ownership, confirmed-only cancellation, admin policy bypass, and centralized status transitions', async () => {
    const start = new Date('2030-01-07T06:00:00.000Z');
    const booking = await bookings.createForCustomer(organizationId, userId, start, [
      { serviceId, quantity: 1 },
    ]);
    await expect(lifecycle.cancelCustomer(organizationId, otherUserId, booking.id)).rejects.toThrow(
      'not found',
    );
    await policies.update(organizationId, {
      customerCancellationEnabled: false,
      customerRescheduleEnabled: false,
      cancellationCutoffMinutes: null,
      rescheduleCutoffMinutes: null,
      maxCustomerReschedules: null,
    });
    expect((await lifecycle.cancelAdmin(organizationId, userId, booking.id)).status).toBe(
      'CANCELLED',
    );
    await expect(lifecycle.cancelAdmin(organizationId, userId, booking.id)).rejects.toThrow(
      'confirmed',
    );
    const statusBooking = await bookings.createForCustomer(
      organizationId,
      userId,
      new Date('2030-01-07T07:00:00.000Z'),
      [{ serviceId, quantity: 1 }],
    );
    await expect(bookings.setStatus(organizationId, statusBooking.id, 'COMPLETED', userId)).rejects.toThrow(
      'not allowed',
    );
    expect((await bookings.setStatus(organizationId, statusBooking.id, 'CHECKED_IN')).status).toBe(
      'CHECKED_IN',
    );
    expect((await bookings.setStatus(organizationId, statusBooking.id, 'IN_PROGRESS')).status).toBe(
      'IN_PROGRESS',
    );
    expect((await bookings.setStatus(organizationId, statusBooking.id, 'COMPLETED', userId)).status).toBe(
      'COMPLETED',
    );
  });
});
