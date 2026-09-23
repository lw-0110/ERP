import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { prisma } from '../auth/prisma.js';
import { sequentialDurationMinutes } from './booking-snapshots.js';
import { AvailabilityService } from './availability.service.js';

export type CreateBookingLine = { serviceId: string; quantity: number };
@Injectable()
export class BookingService {
  constructor(@Inject(AvailabilityService) private readonly availability: AvailabilityService) {}

  async checkAvailability(organizationId: string, startDateTime: Date, lines: CreateBookingLine[]) {
    if (
      !Number.isFinite(startDateTime.getTime()) ||
      startDateTime <= new Date() ||
      !lines.length ||
      lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)
    )
      throw new BadRequestException('Invalid booking time or services.');
    const services = await prisma.service.findMany({
      where: { organizationId, id: { in: lines.map((line) => line.serviceId) }, status: 'ACTIVE' },
      include: { requiredResourceTypes: true },
    });
    if (services.length !== lines.length)
      throw new NotFoundException('A requested service is not active in this organization.');
    let cursor = startDateTime.getTime();
    for (const line of lines) {
      const service = services.find((item) => item.id === line.serviceId)!;
      const end = new Date(
        cursor +
          line.quantity *
            (service.durationMinutes + service.bufferBeforeMinutes + service.bufferAfterMinutes) *
            60_000,
      );
      const requirements = service.requiredResourceTypes.map(
        ({ resourceTypeId, requiredCount }) => ({ resourceTypeId, requiredCount }),
      );
      if (
        !(await this.availability.hasCapacity(
          organizationId,
          new Date(cursor),
          end,
          service.requiredStaffCount,
        )) ||
        !(await this.availability.hasResourceCapacity(
          organizationId,
          new Date(cursor),
          end,
          requirements,
        ))
      )
        return { available: false, endDateTime: end };
      cursor = end.getTime();
    }
    return { available: true, endDateTime: new Date(cursor) };
  }

  async createForCustomer(
    organizationId: string,
    userId: string,
    startDateTime: Date,
    lines: CreateBookingLine[],
    customerProfileId?: string,
  ) {
    if (!Number.isFinite(startDateTime.getTime()) || startDateTime <= new Date())
      throw new BadRequestException('Choose a future start time.');
    if (
      !lines.length ||
      lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)
    )
      throw new BadRequestException('Booking services must have positive quantities.');
    const serviceIds = lines.map(({ serviceId }) => serviceId);
    if (new Set(serviceIds).size !== serviceIds.length)
      throw new BadRequestException('Duplicate service lines are not allowed.');
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
        const customer = await tx.customerProfile.findFirst({
          where: { organizationId, ...(customerProfileId ? { id: customerProfileId } : { userId }), status: 'ACTIVE' },
        });
        if (!customer)
          throw new NotFoundException('Complete your customer profile before booking.');
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { bookingNumberPrefix: true },
        });
        const services = await tx.service.findMany({
          where: { id: { in: serviceIds }, organizationId, status: 'ACTIVE' },
          include: { requiredSkills: true, requiredResourceTypes: true },
        });
        if (services.length !== lines.length)
          throw new NotFoundException('A requested service is not active in this organization.');
        const snapshots = lines.map((line, sortOrder) => {
          const service = services.find(({ id }) => id === line.serviceId)!;
          return {
            serviceId: service.id,
            quantity: line.quantity,
            sortOrder,
            unitPriceMinorSnapshot: service.priceMinor,
            currencySnapshot: service.currency,
            durationMinutesSnapshot: service.durationMinutes,
            bufferBeforeMinutesSnapshot: service.bufferBeforeMinutes,
            bufferAfterMinutesSnapshot: service.bufferAfterMinutes,
            requiredStaffCountSnapshot: service.requiredStaffCount,
            requiredSkillIdsSnapshot: service.requiredSkills.map(({ skillId }) => skillId),
            requiredSkillCountsSnapshot: service.requiredSkills.map(
              ({ skillId, requiredCount }) => ({ skillId, requiredCount }),
            ),
            requiredResourceTypeCountsSnapshot: service.requiredResourceTypes.map(
              ({ resourceTypeId, requiredCount }) => ({ resourceTypeId, requiredCount }),
            ),
            lineTotalMinor: service.priceMinor * line.quantity,
          };
        });
        const duration = sequentialDurationMinutes(snapshots);
        if (snapshots.some((line) => !Number.isSafeInteger(line.lineTotalMinor)))
          throw new BadRequestException('Booking total exceeds supported amount.');
        const endDateTime = new Date(startDateTime.getTime() + duration * 60_000);
        let cursor = startDateTime.getTime();
        for (const snapshot of snapshots) {
          const segmentEnd = new Date(
            cursor +
              snapshot.quantity *
                (snapshot.durationMinutesSnapshot +
                  snapshot.bufferBeforeMinutesSnapshot +
                  snapshot.bufferAfterMinutesSnapshot) *
                60_000,
          );
          if (
            !(await this.availability.hasCapacity(
              organizationId,
              new Date(cursor),
              segmentEnd,
              snapshot.requiredStaffCountSnapshot,
              tx,
            )) ||
            !(await this.availability.hasResourceCapacity(
              organizationId,
              new Date(cursor),
              segmentEnd,
              snapshot.requiredResourceTypeCountsSnapshot,
              tx,
            ))
          )
            throw new BadRequestException('Requested time is not available.');
          cursor = segmentEnd.getTime();
        }
        return tx.booking.create({
          data: {
            organizationId,
            customerId: customer.id,
            bookingNumber: `${organization.bookingNumberPrefix}-${randomUUID()}`,
            startDateTime,
            endDateTime,
            createdByUserId: userId,
            services: { create: snapshots },
          },
          include: { services: true },
        });
      },
      { timeout: 15_000 },
    );
  }

  async listOwn(organizationId: string, userId: string) {
    const customer = await prisma.customerProfile.findFirst({ where: { organizationId, userId } });
    if (!customer) return [];
    return prisma.booking.findMany({
      where: { organizationId, customerId: customer.id },
      include: { services: true },
      orderBy: { startDateTime: 'desc' },
      take: 100,
    });
  }
  async listAssigned(organizationId: string, userId: string) {
    const staff = await prisma.staffProfile.findFirst({
      where: { organizationId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) return [];
    return prisma.booking.findMany({
      where: {
        organizationId,
        services: { some: { staffAssignments: { some: { staffId: staff.id, status: 'ACTIVE' } } } },
      },
      include: {
        customer: { select: { displayName: true } },
        services: {
          where: { staffAssignments: { some: { staffId: staff.id, status: 'ACTIVE' } } },
          include: { staffAssignments: { where: { status: 'ACTIVE' } } },
        },
      },
      orderBy: { startDateTime: 'desc' },
      take: 100,
    });
  }
  async getAssigned(organizationId: string, userId: string, id: string) {
    const staff = await prisma.staffProfile.findFirst({
      where: { organizationId, userId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Booking not found.');
    const booking = await prisma.booking.findFirst({
      where: {
        id,
        organizationId,
        services: { some: { staffAssignments: { some: { staffId: staff.id, status: 'ACTIVE' } } } },
      },
      include: {
        customer: { select: { displayName: true } },
        services: { include: { staffAssignments: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }
  async getOwn(organizationId: string, userId: string, id: string) {
    const booking = await prisma.booking.findFirst({
      where: { id, organizationId, customer: { userId } },
      include: { services: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }
  async listAll(organizationId: string) {
    return prisma.booking.findMany({
      where: { organizationId },
      include: {
        customer: true,
        services: {
          include: {
            staffAssignments: { where: { status: 'ACTIVE' }, include: { staff: { select: { displayName: true } } } },
            resourceAssignments: { where: { status: 'ACTIVE' } },
          },
        },
      },
      orderBy: { startDateTime: 'desc' },
      take: 100,
    });
  }
  async get(organizationId: string, id: string) {
    const booking = await prisma.booking.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        services: {
          include: {
            staffAssignments: { where: { status: 'ACTIVE' }, include: { staff: { select: { displayName: true } } } },
            resourceAssignments: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    return booking;
  }
  async setStatus(
    organizationId: string,
    id: string,
    status: 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW',
  ) {
    const booking = await this.get(organizationId, id);
    const transitions: Record<string, string[]> = {
      CONFIRMED: ['CHECKED_IN', 'NO_SHOW'],
      CHECKED_IN: ['IN_PROGRESS'],
      IN_PROGRESS: ['COMPLETED'],
    };
    if (!transitions[booking.status]?.includes(status))
      throw new BadRequestException('This booking status transition is not allowed.');
    return prisma.booking.update({ where: { id }, data: { status } });
  }
}
