import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
const { prisma } = await import('../auth/prisma.js');
const { AvailabilityService } = await import('./availability.service.js');
const { BookingService } = await import('./booking.service.js');
const { AssignmentService } = await import('./assignment.service.js');
const { SchedulingService } = await import('./scheduling.service.js');
const { CustomerService } = await import('../business/customer.service.js');
const availability = new AvailabilityService();
const bookings = new BookingService(availability);
const assignments = new AssignmentService(availability);
const schedules = new SchedulingService();
const customers = new CustomerService();
const tag = `m5-${randomUUID()}`;
const start = new Date('2030-01-07T02:00:00.000Z');
let organizationId = '';
let otherOrganizationId = '';
let userId = '';
let otherUserId = '';
let serviceId = '';
let staffIds: string[] = [];
let resourceIds: string[] = [];
let skillId = '';
let resourceTypeId = '';
let otherResourceId = '';

beforeAll(async () => {
  const [organization, other, user, otherUser] = await Promise.all([
    prisma.organization.create({ data: { name: tag, slug: tag, timezone: 'Asia/Kuala_Lumpur' } }),
    prisma.organization.create({ data: { name: `${tag}-other`, slug: `${tag}-other` } }),
    prisma.user.create({ data: { name: tag, email: `${tag}@example.invalid` } }),
    prisma.user.create({ data: { name: `${tag}-other`, email: `${tag}-other@example.invalid` } }),
  ]);
  organizationId = organization.id;
  otherOrganizationId = other.id;
  userId = user.id;
  otherUserId = otherUser.id;
  await prisma.membership.createMany({
    data: [
      { userId, organizationId },
      { userId: otherUserId, organizationId: otherOrganizationId },
    ],
  });
  await prisma.customerProfile.create({
    data: {
      organizationId,
      userId,
      firstName: 'Test',
      lastName: 'Customer',
      displayName: 'Test Customer',
      email: user.email,
      phone: '123',
    },
  });
  const resourceType = await prisma.resourceType.create({
    data: { organizationId, name: `${tag}-room` },
  });
  resourceTypeId = resourceType.id;
  const skill = await prisma.skill.create({ data: { organizationId, name: `${tag}-skill` } });
  skillId = skill.id;
  const [one, two, otherResource] = await Promise.all([
    prisma.resource.create({
      data: { organizationId, resourceTypeId, name: `${tag}-one`, capacity: 1 },
    }),
    prisma.resource.create({
      data: { organizationId, resourceTypeId, name: `${tag}-two`, capacity: 1 },
    }),
    prisma.resourceType
      .create({ data: { organizationId: otherOrganizationId, name: `${tag}-other` } })
      .then((type) =>
        prisma.resource.create({
          data: {
            organizationId: otherOrganizationId,
            resourceTypeId: type.id,
            name: `${tag}-foreign`,
            capacity: 1,
          },
        }),
      ),
  ]);
  resourceIds = [one.id, two.id];
  otherResourceId = otherResource.id;
  const [staffOne, staffTwo] = await Promise.all([
    prisma.staffProfile.create({
      data: {
        organizationId,
        employeeCode: `${tag}-1`,
        displayName: 'One',
        email: `${tag}-1@example.invalid`,
        phone: '1',
      },
    }),
    prisma.staffProfile.create({
      data: {
        organizationId,
        employeeCode: `${tag}-2`,
        displayName: 'Two',
        email: `${tag}-2@example.invalid`,
        phone: '2',
      },
    }),
  ]);
  staffIds = [staffOne.id, staffTwo.id];
  await schedules.openingHour(organizationId, start.getUTCDay(), '09:00', '18:00');
  for (const staffId of staffIds)
    await schedules.staffSchedule(organizationId, staffId, start.getUTCDay(), '09:00', '18:00');
  const service = await prisma.service.create({
    data: {
      organizationId,
      name: `${tag}-service`,
      durationMinutes: 30,
      priceMinor: 5000,
      currency: 'MYR',
      requiredStaffCount: 1,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      requiredSkills: { create: [{ skillId, requiredCount: 1 }] },
      requiredResourceTypes: { create: [{ resourceTypeId, requiredCount: 1 }] },
    },
  });
  serviceId = service.id;
});

afterAll(async () => {
  const organizations = [organizationId, otherOrganizationId].filter(Boolean);
  await prisma.booking.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.staffWorkingSchedule.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.organizationOpeningHour.deleteMany({
    where: { organizationId: { in: organizations } },
  });
  await prisma.service.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.resource.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.resourceType.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.staffProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.skill.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.customerProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.membership.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.$disconnect();
});

describe('Milestone 5 persisted booking behavior', () => {
  it('searches receptionist customers across phone formats, name and email, and books an active unlinked profile', async () => {
    const profile = await customers.create(organizationId, { firstName: 'Reception', lastName: 'Guest', displayName: 'Reception Guest', email: `${tag}-guest@example.invalid`, phone: '+60123456789' });
    const foreign = await customers.create(otherOrganizationId, { firstName: 'Foreign', lastName: 'Guest', displayName: 'Foreign Guest', email: `${tag}-foreign-guest@example.invalid`, phone: '+60123456789' });
    for (const query of ['0123456789', '012-3456789', '+60123456789', 'Reception Guest', profile.email]) {
      const found = await customers.searchForBooking(organizationId, query);
      expect(found.some((item) => item.id === profile.id)).toBe(true);
      expect(found.some((item) => item.id === foreign.id)).toBe(false);
    }
    await expect(bookings.createForCustomer(organizationId, userId, new Date('2030-01-14T02:00:00Z'), [{ serviceId, quantity: 1 }], foreign.id)).rejects.toThrow();
    const booking = await bookings.createForCustomer(organizationId, userId, new Date('2030-01-14T02:00:00Z'), [{ serviceId, quantity: 1 }], profile.id);
    expect(booking.customerId).toBe(profile.id);
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
    const visited = (await customers.searchForBooking(organizationId, profile.email)).find((item) => item.id === profile.id);
    expect(visited?.completedVisitCount).toBe(1);
    expect(visited?.lastCompletedVisit?.toISOString()).toBe(booking.endDateTime.toISOString());
    await prisma.customerProfile.update({ where: { id: profile.id }, data: { status: 'INACTIVE' } });
    await expect(bookings.createForCustomer(organizationId, userId, new Date('2030-01-21T02:00:00Z'), [{ serviceId, quantity: 1 }], profile.id)).rejects.toThrow();
  });
  it('enforces opening hours and staff schedules', async () => {
    expect(
      await availability.hasCapacity(
        organizationId,
        start,
        new Date(start.getTime() + 40 * 60_000),
        1,
      ),
    ).toBe(true);
    expect(
      await availability.hasCapacity(
        organizationId,
        new Date('2030-01-07T00:00:00Z'),
        new Date('2030-01-07T00:40:00Z'),
        1,
      ),
    ).toBe(false);
    await expect(
      schedules.staffSchedule(organizationId, staffIds[0], 1, '12:00', '11:00'),
    ).rejects.toThrow();
    await expect(
      schedules.staffSchedule(organizationId, randomUUID(), 1, '09:00', '17:00'),
    ).rejects.toThrow();
    await schedules.disableOpeningHour(organizationId, 1);
    expect(
      await availability.hasCapacity(
        organizationId,
        start,
        new Date(start.getTime() + 40 * 60_000),
        1,
      ),
    ).toBe(false);
    await schedules.openingHour(organizationId, 1, '09:00', '18:00');
    await schedules.disableStaffSchedule(organizationId, staffIds[0], 1);
    expect(
      await availability.hasCapacity(
        organizationId,
        start,
        new Date(start.getTime() + 40 * 60_000),
        2,
      ),
    ).toBe(false);
    await schedules.staffSchedule(organizationId, staffIds[0], 1, '09:00', '18:00');
  });
  it('creates immutable sequential snapshots and reserves unassigned capacity', async () => {
    const first = await bookings.createForCustomer(organizationId, userId, start, [
      { serviceId, quantity: 2 },
    ]);
    expect(first.status).toBe('CONFIRMED');
    expect(first.services[0].durationMinutesSnapshot).toBe(30);
    expect(first.services[0].bufferBeforeMinutesSnapshot).toBe(5);
    expect(first.services[0].requiredStaffCountSnapshot).toBe(1);
    expect(first.endDateTime.getTime() - first.startDateTime.getTime()).toBe(80 * 60_000);
    await prisma.service.update({
      where: { id: serviceId },
      data: {
        priceMinor: 9000,
        durationMinutes: 45,
        requiredStaffCount: 2,
        bufferBeforeMinutes: 10,
      },
    });
    const unchanged = await prisma.bookingService.findUniqueOrThrow({
      where: { id: first.services[0].id },
    });
    expect(unchanged.unitPriceMinorSnapshot).toBe(5000);
    expect(unchanged.durationMinutesSnapshot).toBe(30);
    expect(unchanged.requiredSkillCountsSnapshot).toEqual([{ skillId, requiredCount: 1 }]);
    expect(unchanged.requiredResourceTypeCountsSnapshot).toEqual([
      { resourceTypeId, requiredCount: 1 },
    ]);
    expect(
      await availability.hasCapacity(
        organizationId,
        start,
        new Date(start.getTime() + 40 * 60_000),
        2,
      ),
    ).toBe(false);
    expect(
      await availability.hasResourceCapacity(
        organizationId,
        start,
        new Date(start.getTime() + 40 * 60_000),
        [{ resourceTypeId, requiredCount: 2 }],
      ),
    ).toBe(false);
    const secondService = await prisma.service.create({
      data: {
        organizationId,
        name: `${tag}-second`,
        durationMinutes: 20,
        priceMinor: 2000,
        currency: 'MYR',
        requiredStaffCount: 1,
        bufferBeforeMinutes: 2,
        bufferAfterMinutes: 3,
      },
    });
    const later = await bookings.createForCustomer(
      organizationId,
      userId,
      new Date('2030-01-07T05:00:00Z'),
      [
        { serviceId, quantity: 1 },
        { serviceId: secondService.id, quantity: 1 },
      ],
    );
    expect(later.services.map((line) => line.sortOrder)).toEqual([0, 1]);
    expect(later.endDateTime.getTime() - later.startDateTime.getTime()).toBe(85 * 60_000);
    await expect(bookings.getOwn(otherOrganizationId, otherUserId, first.id)).rejects.toThrow();
    await expect(bookings.get(otherOrganizationId, first.id)).rejects.toThrow();
  });
  it('warns for advisory skill mismatch and rejects cross-tenant or conflicting assignments', async () => {
    const first = (await bookings.listOwn(organizationId, userId)).find(
      (booking) => booking.startDateTime.getTime() === start.getTime(),
    )!;
    const line = first.services[0];
    await prisma.service.update({
      where: { id: serviceId },
      data: { requiredStaffCount: 1, durationMinutes: 30, bufferBeforeMinutes: 5 },
    });
    const second = await bookings.createForCustomer(organizationId, userId, start, [
      { serviceId, quantity: 1 },
    ]);
    await expect(
      bookings.createForCustomer(organizationId, userId, start, [{ serviceId, quantity: 1 }]),
    ).rejects.toThrow();
    const result = await assignments.replaceStaff(organizationId, line.id, [staffIds[0]], userId);
    expect(result.warnings.length).toBe(1);
    await prisma.bookingService.update({ where: { id: line.id }, data: { requiredStaffCountSnapshot: 2 } });
    await expect(assignments.replaceStaff(organizationId, line.id, staffIds.slice(0, 2), userId)).rejects.toThrow('Only one staff member');
    expect(await prisma.bookingStaff.count({ where: { bookingServiceId: line.id, status: 'ACTIVE' } })).toBe(1);
    await expect(prisma.bookingStaff.create({ data: { bookingServiceId: line.id, staffId: staffIds[1], assignedByUserId: userId } })).rejects.toThrow();
    await prisma.bookingService.update({ where: { id: line.id }, data: { requiredStaffCountSnapshot: 1 } });
    await expect(
      assignments.replaceStaff(organizationId, line.id, [randomUUID()], userId),
    ).rejects.toThrow();
    await expect(
      assignments.replaceStaff(otherOrganizationId, line.id, [staffIds[0]], otherUserId),
    ).rejects.toThrow();
    await expect(
      assignments.replaceStaff(organizationId, second.services[0].id, [staffIds[0]], userId),
    ).rejects.toThrow();
    expect(
      (await assignments.replaceStaff(organizationId, second.services[0].id, [staffIds[1]], userId))
        .assignments,
    ).toHaveLength(1);
    const resource = await assignments.replaceResources(
      organizationId,
      line.id,
      [resourceIds[0]],
      userId,
    );
    expect(resource.remainingByType[0].remainingCount).toBe(0);
    await expect(
      assignments.replaceResources(organizationId, line.id, [otherResourceId], userId),
    ).rejects.toThrow();
    await expect(
      assignments.replaceResources(organizationId, second.services[0].id, [resourceIds[0]], userId),
    ).rejects.toThrow();
    expect(
      (
        await assignments.replaceResources(
          organizationId,
          second.services[0].id,
          [resourceIds[1]],
          userId,
        )
      ).assignments,
    ).toHaveLength(1);
    await prisma.booking.update({ where: { id: first.id }, data: { status: 'IN_PROGRESS' } });
    expect(
      await availability.hasCapacity(
        organizationId,
        start,
        new Date(start.getTime() + 40 * 60_000),
        1,
      ),
    ).toBe(false);
  });
});
