import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
const { prisma } = await import('../auth/prisma.js');
const { AttendanceService } = await import('./attendance.service.js');
const { LeaveService } = await import('./leave.service.js');
const { StaffIdentityService } = await import('./staff-identity.service.js');
const { AvailabilityService } = await import('../booking/availability.service.js');
const { AssignmentService } = await import('../booking/assignment.service.js');
const { BookingService } = await import('../booking/booking.service.js');
const { SchedulingService } = await import('../booking/scheduling.service.js');

const tag = `m6-${randomUUID()}`;
const staffIdentity = new StaffIdentityService();
const attendance = new AttendanceService(staffIdentity);
const leave = new LeaveService(staffIdentity);
const availability = new AvailabilityService();
const bookings = new BookingService(availability);
const assignments = new AssignmentService(availability);
const scheduling = new SchedulingService();
const start = new Date('2030-01-07T02:00:00.000Z');
let organizationId = ''; let otherOrganizationId = ''; let userId = ''; let otherUserId = '';
let staffId = ''; let secondStaffId = ''; let leaveTypeId = ''; let serviceId = ''; let bookingId = ''; let lineId = '';

beforeAll(async () => {
  const [organization, otherOrganization, user, otherUser] = await Promise.all([
    prisma.organization.create({ data: { name: tag, slug: tag, timezone: 'Asia/Kuala_Lumpur' } }),
    prisma.organization.create({ data: { name: `${tag}-other`, slug: `${tag}-other` } }),
    prisma.user.create({ data: { name: tag, email: `${tag}@example.invalid` } }),
    prisma.user.create({ data: { name: `${tag}-other`, email: `${tag}-other@example.invalid` } }),
  ]);
  organizationId = organization.id; otherOrganizationId = otherOrganization.id; userId = user.id; otherUserId = otherUser.id;
  await prisma.membership.createMany({ data: [{ organizationId, userId }, { organizationId: otherOrganizationId, userId: otherUserId }] });
  const [staff, second] = await Promise.all([
    prisma.staffProfile.create({ data: { organizationId, userId, employeeCode: `${tag}-1`, displayName: 'Staff One', email: user.email, phone: '1' } }),
    prisma.staffProfile.create({ data: { organizationId, employeeCode: `${tag}-2`, displayName: 'Staff Two', email: `${tag}-2@example.invalid`, phone: '2' } }),
  ]);
  staffId = staff.id; secondStaffId = second.id;
  const type = await prisma.leaveType.create({ data: { organizationId, name: `${tag}-type` } }); leaveTypeId = type.id;
  await prisma.customerProfile.create({ data: { organizationId, userId, firstName: 'Test', lastName: 'Customer', displayName: 'Test Customer', email: user.email, phone: '1' } });
  const service = await prisma.service.create({ data: { organizationId, name: `${tag}-service`, durationMinutes: 30, priceMinor: 100, currency: 'MYR', requiredStaffCount: 1 } }); serviceId = service.id;
  await scheduling.openingHour(organizationId, 1, '09:00', '18:00');
  await scheduling.staffSchedule(organizationId, staffId, 1, '09:00', '18:00');
  await scheduling.staffSchedule(organizationId, secondStaffId, 1, '09:00', '18:00');
});

afterAll(async () => {
  const organizations = [organizationId, otherOrganizationId].filter(Boolean);
  await prisma.leaveRequest.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.attendanceRecord.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.staffWorkingSchedule.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.organizationOpeningHour.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.service.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.customerProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.staffProfile.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.leaveType.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.membership.deleteMany({ where: { organizationId: { in: organizations } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
  await prisma.$disconnect();
});

describe('Milestone 6 PostgreSQL-backed staff operations', () => {
  it('clocks in and out once, records local work date, and enforces self/tenant access', async () => {
    const record = await attendance.clockIn(organizationId, userId);
    expect(record.status).toBe('INCOMPLETE'); expect(record.clockOutAt).toBeNull();
    expect(record.workDate.toISOString().slice(0, 10)).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(record.clockInAt));
    await expect(attendance.clockIn(organizationId, userId)).rejects.toThrow();
    expect((await attendance.mine(organizationId, userId)).map((item) => item.id)).toContain(record.id);
    await expect(attendance.mine(otherOrganizationId, userId)).rejects.toThrow();
    await expect(attendance.get(otherOrganizationId, record.id)).rejects.toThrow();
    const closed = await attendance.clockOut(organizationId, userId);
    expect(closed.status).toBe('PRESENT'); expect(closed.clockOutAt!.getTime()).toBeGreaterThan(closed.clockInAt.getTime());
    await expect(attendance.clockOut(organizationId, userId)).rejects.toThrow();
  });

  it('blocks pending and approved leave, restores availability after rejection, and scopes ownership', async () => {
    const end = new Date(start.getTime() + 30 * 60_000);
    expect(await availability.hasCapacity(organizationId, start, end, 2)).toBe(true);
    const pending = await leave.create(organizationId, userId, leaveTypeId, start, end, 'Test leave');
    expect(pending.status).toBe('PENDING'); expect(await availability.hasCapacity(organizationId, start, end, 2)).toBe(false);
    expect((await leave.mine(organizationId, userId)).map((item) => item.id)).toContain(pending.id);
    await expect(leave.own(otherOrganizationId, otherUserId, pending.id)).rejects.toThrow();
    await expect(leave.create(otherOrganizationId, otherUserId, leaveTypeId, start, end)).rejects.toThrow();
    const approved = await leave.review(organizationId, pending.id, userId, 'APPROVED');
    expect(approved.status).toBe('APPROVED'); expect(await availability.hasCapacity(organizationId, start, end, 2)).toBe(false);
    const second = await leave.create(organizationId, userId, leaveTypeId, new Date('2030-01-07T04:00:00Z'), new Date('2030-01-07T04:30:00Z'));
    expect(await availability.hasCapacity(organizationId, new Date('2030-01-07T04:00:00Z'), new Date('2030-01-07T04:30:00Z'), 2)).toBe(false);
    await leave.review(organizationId, second.id, userId, 'REJECTED');
    expect(await availability.hasCapacity(organizationId, new Date('2030-01-07T04:00:00Z'), new Date('2030-01-07T04:30:00Z'), 2)).toBe(true);
  });

  it('keeps assigned bookings intact, reports leave conflicts, and rejects new assignment during leave', async () => {
    const first = await bookings.createForCustomer(organizationId, userId, new Date('2030-01-07T05:00:00Z'), [{ serviceId, quantity: 1 }]);
    bookingId = first.id; lineId = first.services[0].id;
    await assignments.replaceStaff(organizationId, lineId, [staffId], userId);
    const second = await bookings.createForCustomer(organizationId, userId, new Date('2030-01-07T06:00:00Z'), [{ serviceId, quantity: 1 }]);
    const submitted = await leave.create(organizationId, userId, leaveTypeId, new Date('2030-01-07T05:00:00Z'), new Date('2030-01-07T07:00:00Z'));
    expect(submitted.conflicts.map((item) => item.bookingId)).toContain(bookingId);
    expect((await leave.get(organizationId, submitted.id)).conflicts).toHaveLength(1);
    expect(await prisma.bookingStaff.count({ where: { bookingServiceId: lineId, staffId } })).toBe(1);
    await expect(assignments.replaceStaff(organizationId, second.services[0].id, [staffId], userId)).rejects.toThrow();
    expect((await assignments.replaceStaff(organizationId, second.services[0].id, [secondStaffId], userId)).assignments).toHaveLength(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('CONFIRMED');
  });
});
