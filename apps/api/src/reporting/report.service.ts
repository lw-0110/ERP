import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, LeaveRequestStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { StaffIdentityService } from '../staff-operations/staff-identity.service.js';

export type ReportFilter = {
  from?: string;
  to?: string;
  status?: string;
  staffId?: string;
  serviceId?: string;
  leaveTypeId?: string;
  currency?: string;
};
type Range = { from: string; to: string; timeZone: string; start: Date; end: Date };
const bookingStatuses = Object.values(BookingStatus);
const leaveStatuses = Object.values(LeaveRequestStatus);
const paymentStatuses = Object.values(PaymentStatus);

function localDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
function counts(values: string[]) {
  const grouped = new Map<string, number>();
  for (const value of values) grouped.set(value, (grouped.get(value) ?? 0) + 1);
  return [...grouped.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
function moneyGroups(values: { currency: string; amountMinor: number }[]) {
  const grouped = new Map<string, { currency: string; amountMinor: number; count: number }>();
  for (const value of values) {
    const group = grouped.get(value.currency) ?? {
      currency: value.currency,
      amountMinor: 0,
      count: 0,
    };
    group.amountMinor += value.amountMinor;
    group.count += 1;
    grouped.set(value.currency, group);
  }
  return [...grouped.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

@Injectable()
export class ReportService {
  constructor(@Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService) {}

  async range(organizationId: string, filter: ReportFilter = {}): Promise<Range> {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const today = localDate(new Date(), organization.timezone);
    const from = filter.from ?? today;
    const to = filter.to ?? from;
    if (
      !validDate(from) ||
      !validDate(to) ||
      from > to ||
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 365
    )
      throw new BadRequestException('Choose a valid date range of at most 366 days.');
    const [bounds] = await prisma.$queryRaw<
      { start: Date; end: Date }[]
    >`SELECT (${from}::date::timestamp AT TIME ZONE ${organization.timezone}) AS start, ((${to}::date + 1)::timestamp AT TIME ZONE ${organization.timezone}) AS end`;
    return { from, to, timeZone: organization.timezone, start: bounds.start, end: bounds.end };
  }

  async bookings(organizationId: string, filter: ReportFilter = {}) {
    const range = await this.range(organizationId, filter);
    if (filter.status && !bookingStatuses.includes(filter.status as BookingStatus))
      throw new BadRequestException('Invalid booking status filter.');
    const records = await prisma.booking.findMany({
      where: {
        organizationId,
        startDateTime: { gte: range.start, lt: range.end },
        ...(filter.status ? { status: filter.status as BookingStatus } : {}),
        ...(filter.serviceId ? { services: { some: { serviceId: filter.serviceId } } } : {}),
        ...(filter.staffId
          ? {
              services: {
                some: { staffAssignments: { some: { staffId: filter.staffId, status: 'ACTIVE' } } },
              },
            }
          : {}),
      },
      include: { services: { include: { staffAssignments: { where: { status: 'ACTIVE' } } } } },
      orderBy: { startDateTime: 'asc' },
    });
    const byService = new Map<
      string,
      { serviceId: string; bookingCount: number; executionCount: number }
    >();
    const byStaff = new Map<string, number>();
    let durationMinutes = 0;
    for (const booking of records) {
      for (const line of booking.services) {
        durationMinutes +=
          line.quantity *
          (line.durationMinutesSnapshot +
            line.bufferBeforeMinutesSnapshot +
            line.bufferAfterMinutesSnapshot);
        const service = byService.get(line.serviceId) ?? {
          serviceId: line.serviceId,
          bookingCount: 0,
          executionCount: 0,
        };
        service.bookingCount += 1;
        service.executionCount += line.quantity;
        byService.set(line.serviceId, service);
        for (const assignment of line.staffAssignments)
          byStaff.set(assignment.staffId, (byStaff.get(assignment.staffId) ?? 0) + 1);
      }
    }
    const rows = records.map((booking) => ({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      startDateTime: booking.startDateTime.toISOString(),
      endDateTime: booking.endDateTime.toISOString(),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      durationMinutes: booking.services.reduce(
        (sum, line) =>
          sum +
          line.quantity *
            (line.durationMinutesSnapshot +
              line.bufferBeforeMinutesSnapshot +
              line.bufferAfterMinutesSnapshot),
        0,
      ),
    }));
    return {
      range: { from: range.from, to: range.to, timeZone: range.timeZone },
      totalBookings: records.length,
      durationMinutes,
      byStatus: counts(records.map((booking) => booking.status)),
      byDate: counts(records.map((booking) => localDate(booking.startDateTime, range.timeZone))),
      byService: [...byService.values()].sort((a, b) => a.serviceId.localeCompare(b.serviceId)),
      byStaff: [...byStaff.entries()]
        .map(([staffId, assignmentCount]) => ({ staffId, assignmentCount }))
        .sort((a, b) => a.staffId.localeCompare(b.staffId)),
      completedCount: records.filter((booking) => booking.status === 'COMPLETED').length,
      cancelledCount: records.filter((booking) => booking.status === 'CANCELLED').length,
      noShowCount: records.filter((booking) => booking.status === 'NO_SHOW').length,
      rows,
    };
  }

  async payments(organizationId: string, filter: ReportFilter = {}) {
    const range = await this.range(organizationId, filter);
    if (filter.status && !paymentStatuses.includes(filter.status as PaymentStatus))
      throw new BadRequestException('Invalid payment status filter.');
    const [records, bookings] = await Promise.all([
      prisma.paymentRecord.findMany({
        where: {
          organizationId,
          paidAt: { gte: range.start, lt: range.end },
          ...(filter.currency ? { currency: filter.currency } : {}),
          ...(filter.status ? { booking: { paymentStatus: filter.status as PaymentStatus } } : {}),
        },
        orderBy: { paidAt: 'asc' },
      }),
      prisma.booking.findMany({
        where: {
          organizationId,
          startDateTime: { gte: range.start, lt: range.end },
          ...(filter.status ? { paymentStatus: filter.status as PaymentStatus } : {}),
        },
        select: { paymentStatus: true },
      }),
    ]);
    const method = new Map<
      string,
      { currency: string; paymentMethod: string; amountMinor: number; count: number }
    >();
    for (const item of records) {
      const key = `${item.currency}\0${item.paymentMethod}`;
      const group = method.get(key) ?? {
        currency: item.currency,
        paymentMethod: item.paymentMethod,
        amountMinor: 0,
        count: 0,
      };
      group.amountMinor += item.amountMinor;
      group.count += 1;
      method.set(key, group);
    }
    return {
      range: { from: range.from, to: range.to, timeZone: range.timeZone },
      paymentCount: records.length,
      byCurrency: moneyGroups(
        records.map(({ currency, amountMinor }) => ({ currency, amountMinor })),
      ),
      byMethod: [...method.values()].sort(
        (a, b) =>
          a.currency.localeCompare(b.currency) || a.paymentMethod.localeCompare(b.paymentMethod),
      ),
      bookingPaymentStatusDistribution: counts(bookings.map((booking) => booking.paymentStatus)),
      rows: records.map((item) => ({
        paymentId: item.id,
        bookingId: item.bookingId,
        amountMinor: item.amountMinor,
        currency: item.currency,
        paymentMethod: item.paymentMethod,
        paidAt: item.paidAt.toISOString(),
      })),
    };
  }

  async commissions(organizationId: string, filter: ReportFilter = {}) {
    const range = await this.range(organizationId, filter);
    const records = await prisma.commissionRecord.findMany({
      where: {
        organizationId,
        createdAt: { gte: range.start, lt: range.end },
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
        ...(filter.currency ? { currency: filter.currency } : {}),
        ...(filter.serviceId ? { bookingService: { serviceId: filter.serviceId } } : {}),
      },
      include: { bookingService: { select: { serviceId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const group = new Map<
      string,
      { staffId: string; serviceId: string; currency: string; amountMinor: number; count: number }
    >();
    for (const record of records) {
      const key = `${record.staffId}\0${record.bookingService.serviceId}\0${record.currency}`;
      const current = group.get(key) ?? {
        staffId: record.staffId,
        serviceId: record.bookingService.serviceId,
        currency: record.currency,
        amountMinor: 0,
        count: 0,
      };
      current.amountMinor += record.amountMinor;
      current.count += 1;
      group.set(key, current);
    }
    return {
      range: { from: range.from, to: range.to, timeZone: range.timeZone },
      commissionCount: records.length,
      byCurrency: moneyGroups(
        records.map(({ currency, amountMinor }) => ({ currency, amountMinor })),
      ),
      byStaffAndService: [...group.values()].sort(
        (a, b) =>
          a.staffId.localeCompare(b.staffId) ||
          a.serviceId.localeCompare(b.serviceId) ||
          a.currency.localeCompare(b.currency),
      ),
      rows: records.map((record) => ({
        commissionId: record.id,
        bookingId: record.bookingId,
        bookingServiceId: record.bookingServiceId,
        serviceId: record.bookingService.serviceId,
        staffId: record.staffId,
        amountMinor: record.amountMinor,
        currency: record.currency,
        recordedAt: record.createdAt.toISOString(),
      })),
    };
  }

  async ownCommissions(organizationId: string, userId: string, filter: ReportFilter = {}) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    return this.commissions(organizationId, { ...filter, staffId: staff.id });
  }

  async attendance(organizationId: string, filter: ReportFilter = {}) {
    const range = await this.range(organizationId, filter);
    const rows = await prisma.attendanceRecord.findMany({
      where: {
        organizationId,
        workDate: {
          gte: new Date(`${range.from}T00:00:00Z`),
          lte: new Date(`${range.to}T00:00:00Z`),
        },
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
      },
      orderBy: { clockInAt: 'asc' },
    });
    const currentlyClockedIn = await prisma.attendanceRecord.count({
      where: {
        organizationId,
        clockOutAt: null,
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
      },
    });
    const totalRecordedDurationMs = rows.reduce(
      (sum, row) => sum + (row.clockOutAt ? row.clockOutAt.getTime() - row.clockInAt.getTime() : 0),
      0,
    );
    return {
      range: { from: range.from, to: range.to, timeZone: range.timeZone },
      recordCount: rows.length,
      currentlyClockedIn,
      totalRecordedDurationMs,
      byStaff: counts(rows.map((row) => row.staffId)),
      rows: rows.map((row) => ({
        attendanceId: row.id,
        staffId: row.staffId,
        workDate: row.workDate.toISOString().slice(0, 10),
        clockInAt: row.clockInAt.toISOString(),
        clockOutAt: row.clockOutAt?.toISOString() ?? '',
        status: row.status,
        recordedDurationMs: row.clockOutAt
          ? row.clockOutAt.getTime() - row.clockInAt.getTime()
          : null,
      })),
    };
  }

  async leave(organizationId: string, filter: ReportFilter = {}) {
    const range = await this.range(organizationId, filter);
    if (filter.status && !leaveStatuses.includes(filter.status as LeaveRequestStatus))
      throw new BadRequestException('Invalid leave status filter.');
    const records = await prisma.leaveRequest.findMany({
      where: {
        organizationId,
        startDateTime: { lt: range.end },
        endDateTime: { gt: range.start },
        ...(filter.status ? { status: filter.status as LeaveRequestStatus } : {}),
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
        ...(filter.leaveTypeId ? { leaveTypeId: filter.leaveTypeId } : {}),
      },
      orderBy: { startDateTime: 'asc' },
    });
    return {
      range: { from: range.from, to: range.to, timeZone: range.timeZone },
      requestCount: records.length,
      pendingCount: records.filter((item) => item.status === 'PENDING').length,
      approvedCount: records.filter((item) => item.status === 'APPROVED').length,
      byStatus: counts(records.map((item) => item.status)),
      byType: counts(records.map((item) => item.leaveTypeId)),
      byStaff: counts(records.map((item) => item.staffId)),
      rows: records.map((item) => ({
        leaveRequestId: item.id,
        staffId: item.staffId,
        leaveTypeId: item.leaveTypeId,
        startDateTime: item.startDateTime.toISOString(),
        endDateTime: item.endDateTime.toISOString(),
        status: item.status,
      })),
    };
  }

  async staff(
    organizationId: string,
    staffId: string,
    filter: ReportFilter = {},
    includeFinance = false,
  ) {
    const staff = await prisma.staffProfile.findFirst({
      where: { id: staffId, organizationId },
      select: { id: true, displayName: true },
    });
    if (!staff) throw new NotFoundException('Staff not found.');
    const range = await this.range(organizationId, filter);
    const [assignments, commission, attendance, leave] = await Promise.all([
      prisma.bookingStaff.findMany({
        where: {
          staffId,
          status: 'ACTIVE',
          bookingService: {
            booking: { organizationId, startDateTime: { gte: range.start, lt: range.end } },
          },
        },
        include: { bookingService: { include: { booking: { select: { status: true } } } } },
      }),
      includeFinance
        ? this.commissions(organizationId, { ...filter, staffId })
        : Promise.resolve(null),
      this.attendance(organizationId, { ...filter, staffId }),
      this.leave(organizationId, { ...filter, staffId }),
    ]);
    return {
      staff,
      range: { from: range.from, to: range.to, timeZone: range.timeZone },
      assignedBookingServiceCount: assignments.length,
      completedBookingServiceCount: assignments.filter(
        (item) => item.bookingService.booking.status === 'COMPLETED',
      ).length,
      ...(commission ? { commissionByCurrency: commission.byCurrency } : {}),
      attendanceRecordCount: attendance.recordCount,
      attendanceRecordedDurationMs: attendance.totalRecordedDurationMs,
      leaveByStatus: leave.byStatus,
    };
  }

  async dashboard(organizationId: string, filter: ReportFilter = {}, includeFinance = false) {
    const range = await this.range(organizationId, filter);
    const [bookings, attendance, leave, activeStaff, upcomingBookings, todayBookings, finance] =
      await Promise.all([
        this.bookings(organizationId, filter),
        this.attendance(organizationId, filter),
        this.leave(organizationId, filter),
        prisma.staffProfile.count({ where: { organizationId, status: 'ACTIVE' } }),
        prisma.booking.count({
          where: {
            organizationId,
            status: 'CONFIRMED',
            startDateTime: {
              gte: new Date(Math.max(Date.now(), range.start.getTime())),
              lt: range.end,
            },
          },
        }),
        this.range(organizationId).then((today) =>
          prisma.booking.count({
            where: { organizationId, startDateTime: { gte: today.start, lt: today.end } },
          }),
        ),
        includeFinance
          ? Promise.all([
              this.payments(organizationId, filter),
              this.commissions(organizationId, filter),
            ])
          : Promise.resolve(null),
      ]);
    return {
      range: bookings.range,
      todayBookings,
      bookingsInRange: bookings.totalBookings,
      upcomingBookings,
      completedBookings: bookings.completedCount,
      cancelledBookings: bookings.cancelledCount,
      noShowBookings: bookings.noShowCount,
      activeStaff,
      currentlyClockedIn: attendance.currentlyClockedIn,
      pendingLeaveRequests: leave.pendingCount,
      ...(finance
        ? {
            bookingPaymentStatusDistribution: finance[0].bookingPaymentStatusDistribution,
            recordedPaymentsByCurrency: finance[0].byCurrency,
            recordedCommissionsByCurrency: finance[1].byCurrency,
          }
        : {}),
    };
  }
}
