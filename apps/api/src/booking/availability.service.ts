import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type BookingService as BookingLine } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { hasHeadcountCapacity, overlaps, type ReservationSegment } from './availability.js';
import { assertCountSnapshots, assertSkillIds } from './booking-snapshots.js';

type Database = Prisma.TransactionClient | typeof prisma;
type Window = { start: Date; end: Date };
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    day: weekdays.indexOf(get('weekday')),
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function bookingLineWindows<T extends BookingLine>(start: Date, lines: T[]) {
  let cursor = start.getTime();
  return [...lines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => {
      assertSkillIds(line.requiredSkillIdsSnapshot);
      assertCountSnapshots(line.requiredSkillCountsSnapshot, 'skillId');
      assertCountSnapshots(line.requiredResourceTypeCountsSnapshot, 'resourceTypeId');
      const minutes =
        line.quantity *
        (line.durationMinutesSnapshot +
          line.bufferBeforeMinutesSnapshot +
          line.bufferAfterMinutesSnapshot);
      if (!Number.isSafeInteger(minutes) || minutes < 1 || line.requiredStaffCountSnapshot < 1)
        throw new BadRequestException('Invalid booking snapshot duration or headcount.');
      const window = { line, start: new Date(cursor), end: new Date(cursor + minutes * 60_000) };
      cursor = window.end.getTime();
      return window;
    });
}

@Injectable()
export class AvailabilityService {
  async scheduleEligibleStaff(organizationId: string, window: Window, db: Database = prisma) {
    if (
      !Number.isFinite(window.start.getTime()) ||
      !Number.isFinite(window.end.getTime()) ||
      window.end <= window.start
    )
      return [];
    const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const first = localParts(window.start, organization.timezone);
    const last = localParts(new Date(window.end.getTime() - 1), organization.timezone);
    if (first.date !== last.date) return [];
    const endLocal = localParts(window.end, organization.timezone).time;
    const opening = await db.organizationOpeningHour.findFirst({
      where: {
        organizationId,
        dayOfWeek: first.day,
        status: 'ACTIVE',
        openTime: { lte: first.time },
        closeTime: { gte: endLocal },
      },
    });
    if (!opening) return [];
    return db.staffProfile.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        schedules: {
          some: {
            organizationId,
            dayOfWeek: first.day,
            status: 'ACTIVE',
            startTime: { lte: first.time },
            endTime: { gte: endLocal },
          },
        },
        leaveRequests: {
          none: {
            organizationId,
            status: { in: ['PENDING', 'APPROVED'] },
            startDateTime: { lt: window.end },
            endDateTime: { gt: window.start },
          },
        },
      },
      include: { skills: true },
    });
  }

  async activeSegments(
    organizationId: string,
    window: Window,
    db: Database = prisma,
    excludedBookingId?: string,
  ) {
    const bookings = await db.booking.findMany({
      where: {
        organizationId,
        id: excludedBookingId ? { not: excludedBookingId } : undefined,
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        startDateTime: { lt: window.end },
        endDateTime: { gt: window.start },
      },
      include: {
        services: {
          include: {
            staffAssignments: { where: { status: 'ACTIVE' } },
            resourceAssignments: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    return bookings.flatMap((booking) =>
      bookingLineWindows(booking.startDateTime, booking.services)
        .filter((segment) => overlaps(window.start, window.end, segment.start, segment.end))
        .map((segment) => ({
          ...segment,
          bookingId: booking.id,
          status: booking.status as 'CONFIRMED' | 'IN_PROGRESS',
          assignedStaffIds: segment.line.staffAssignments.map((assignment) => assignment.staffId),
          assignedResourceIds: segment.line.resourceAssignments.map(
            (assignment) => assignment.resourceId,
          ),
        })),
    );
  }

  async hasCapacity(
    organizationId: string,
    start: Date,
    end: Date,
    requiredStaffCount: number,
    db: Database = prisma,
    excludedBookingId?: string,
  ) {
    const window = { start, end };
    const staff = await this.scheduleEligibleStaff(organizationId, window, db);
    if (staff.length < requiredStaffCount) return false;
    const segments = await this.activeSegments(organizationId, window, db, excludedBookingId);
    const reservations: ReservationSegment[] = segments.map((segment) => ({
      start: segment.start,
      end: segment.end,
      status: segment.status,
      requiredStaffCount: segment.line.requiredStaffCountSnapshot,
      assignedStaffCount: segment.assignedStaffIds.length,
    }));
    return hasHeadcountCapacity(start, end, requiredStaffCount, staff.length, reservations);
  }

  async hasResourceCapacity(
    organizationId: string,
    start: Date,
    end: Date,
    requirements: { resourceTypeId: string; requiredCount: number }[],
    db: Database = prisma,
    excludedBookingId?: string,
  ) {
    const window = { start, end };
    const resources = await db.resource.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        capacity: { gte: 1 },
        resourceType: { status: 'ACTIVE' },
      },
    });
    const segments = await this.activeSegments(organizationId, window, db, excludedBookingId);
    for (const requirement of requirements) {
      const eligible = resources.filter(
        (resource) => resource.resourceTypeId === requirement.resourceTypeId,
      ).length;
      const sameType = segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        count:
          (
            segment.line.requiredResourceTypeCountsSnapshot as unknown as {
              resourceTypeId: string;
              requiredCount: number;
            }[]
          ).find((item) => item.resourceTypeId === requirement.resourceTypeId)?.requiredCount ?? 0,
      }));
      const boundaries = [
        start.getTime(),
        ...sameType.map((item) => Math.max(start.getTime(), item.start.getTime())),
      ];
      const highest = Math.max(
        0,
        ...boundaries.map((point) =>
          sameType
            .filter((item) => item.start.getTime() <= point && point < item.end.getTime())
            .reduce((total, item) => total + item.count, 0),
        ),
      );
      if (eligible - highest < requirement.requiredCount) return false;
    }
    return true;
  }
}
