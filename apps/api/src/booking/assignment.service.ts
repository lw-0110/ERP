import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { overlaps } from './availability.js';
import { AvailabilityService, bookingLineWindows } from './availability.service.js';
import { assertCountSnapshots } from './booking-snapshots.js';
import { badRequest, notFound } from '../security/application-error.js';

@Injectable()
export class AssignmentService {
  constructor(@Inject(AvailabilityService) private readonly availability: AvailabilityService) {}

  async eligibleStaff(organizationId: string, bookingServiceId: string) {
    const line = await prisma.bookingService.findFirst({
      where: { id: bookingServiceId, booking: { organizationId } },
      include: { booking: { include: { services: true } } },
    });
    if (!line) throw notFound('BOOKING_NOT_FOUND');
    const segment = bookingLineWindows(line.booking.startDateTime, line.booking.services).find(
      (item) => item.line.id === bookingServiceId,
    )!;
    assertCountSnapshots(line.requiredSkillCountsSnapshot, 'skillId');
    const required = line.requiredSkillCountsSnapshot;
    const staff = await this.availability.scheduleEligibleStaff(organizationId, segment);
    const overlapping = await this.availability.activeSegments(organizationId, segment);
    return staff
      .filter(
        (person) =>
          !overlapping.some(
            (other) =>
              other.line.id !== bookingServiceId && other.assignedStaffIds.includes(person.id),
          ),
      )
      .map((person) => ({
        id: person.id,
        displayName: person.displayName,
        recommended: required.every(({ skillId }) =>
          person.skills.some((skill) => skill.skillId === skillId),
        ),
      }))
      .sort(
        (a, b) =>
          Number(b.recommended) - Number(a.recommended) ||
          a.displayName.localeCompare(b.displayName),
      );
  }

  async eligibleResources(organizationId: string, bookingServiceId: string) {
    const line = await prisma.bookingService.findFirst({
      where: { id: bookingServiceId, booking: { organizationId } },
      include: { booking: { include: { services: true } } },
    });
    if (!line) throw notFound('BOOKING_NOT_FOUND');
    const segment = bookingLineWindows(line.booking.startDateTime, line.booking.services).find(
      (item) => item.line.id === bookingServiceId,
    )!;
    assertCountSnapshots(line.requiredResourceTypeCountsSnapshot, 'resourceTypeId');
    const typeIds = line.requiredResourceTypeCountsSnapshot.map(
      ({ resourceTypeId }) => resourceTypeId,
    );
    const resources = await prisma.resource.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        capacity: { gte: 1 },
        resourceTypeId: { in: typeIds },
        resourceType: { status: 'ACTIVE' },
      },
    });
    const overlapping = await this.availability.activeSegments(organizationId, segment);
    return resources
      .filter(
        (resource) =>
          !overlapping.some(
            (other) =>
              other.line.id !== bookingServiceId && other.assignedResourceIds.includes(resource.id),
          ),
      )
      .map(({ id, name, resourceTypeId, capacity }) => ({ id, name, resourceTypeId, capacity }));
  }

  private async target(
    db: Prisma.TransactionClient,
    organizationId: string,
    bookingServiceId: string,
  ) {
    const line = await db.bookingService.findFirst({
      where: { id: bookingServiceId, booking: { organizationId } },
      include: { booking: { include: { services: true } } },
    });
    if (!line) throw notFound('BOOKING_NOT_FOUND');
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(line.booking.status))
      throw badRequest('BOOKING_INVALID_STATUS');
    const segment = bookingLineWindows(line.booking.startDateTime, line.booking.services).find(
      (item) => item.line.id === bookingServiceId,
    )!;
    return { line, window: { start: segment.start, end: segment.end } };
  }

  async replaceStaff(
    organizationId: string,
    bookingServiceId: string,
    staffIds: string[],
    actorUserId: string,
  ) {
    if (staffIds.length > 1) throw badRequest('STAFF_ASSIGNMENT_LIMIT');
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
        const { line, window } = await this.target(tx, organizationId, bookingServiceId);
        const unique = [...new Set(staffIds)];
        if (unique.length !== staffIds.length || unique.length > line.requiredStaffCountSnapshot)
          throw badRequest('STAFF_ASSIGNMENT_CONFLICT');
        const eligible = await this.availability.scheduleEligibleStaff(organizationId, window, tx);
        const selected = eligible.filter((staff) => unique.includes(staff.id));
        if (selected.length !== unique.length)
          throw badRequest('STAFF_NOT_AVAILABLE');
        const overlapping = await this.availability.activeSegments(organizationId, window, tx);
        if (
          overlapping.some(
            (segment) =>
              segment.line.id !== bookingServiceId &&
              overlaps(window.start, window.end, segment.start, segment.end) &&
              segment.assignedStaffIds.some((id) => unique.includes(id)),
          )
        )
          throw badRequest('STAFF_ASSIGNMENT_CONFLICT');
        assertCountSnapshots(line.requiredSkillCountsSnapshot, 'skillId');
        const required = line.requiredSkillCountsSnapshot;
        const warnings = selected.flatMap((staff) => {
          const owned = new Set(staff.skills.map(({ skillId }) => skillId));
          return required
            .filter(({ skillId }) => !owned.has(skillId))
            .map(({ skillId }) => `Staff ${staff.id} does not have recommended skill ${skillId}.`);
        });
        await tx.bookingStaff.updateMany({
          where: { bookingServiceId, status: 'ACTIVE' },
          data: {
            status: 'INVALIDATED',
            invalidatedAt: new Date(),
            invalidationReason: 'REPLACED',
          },
        });
        if (unique.length)
          await tx.bookingStaff.createMany({
            data: unique.map((staffId) => ({
              bookingServiceId,
              staffId,
              assignedByUserId: actorUserId,
            })),
          });
        return {
          assignments: await tx.bookingStaff.findMany({
            where: { bookingServiceId, status: 'ACTIVE' },
          }),
          warnings,
          remainingHeadcount: line.requiredStaffCountSnapshot - unique.length,
        };
      },
      { timeout: 15_000 },
    );
  }

  async replaceResources(
    organizationId: string,
    bookingServiceId: string,
    resourceIds: string[],
    actorUserId: string,
  ) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
        const { line, window } = await this.target(tx, organizationId, bookingServiceId);
        const unique = [...new Set(resourceIds)];
        if (unique.length !== resourceIds.length)
          throw badRequest('RESOURCE_CONFLICT');
        assertCountSnapshots(line.requiredResourceTypeCountsSnapshot, 'resourceTypeId');
        const requirements = line.requiredResourceTypeCountsSnapshot;
        const resources = await tx.resource.findMany({
          where: {
            id: { in: unique },
            organizationId,
            status: 'ACTIVE',
            capacity: { gte: 1 },
            resourceType: { status: 'ACTIVE' },
          },
        });
        if (resources.length !== unique.length)
          throw badRequest('RESOURCE_UNAVAILABLE');
        for (const requirement of requirements)
          if (
            resources.filter((resource) => resource.resourceTypeId === requirement.resourceTypeId)
              .length > requirement.requiredCount
          )
            throw badRequest('RESOURCE_CAPACITY_INSUFFICIENT');
        if (
          resources.some(
            (resource) =>
              !requirements.some(
                ({ resourceTypeId }) => resourceTypeId === resource.resourceTypeId,
              ),
          )
        )
          throw badRequest('RESOURCE_TYPE_MISMATCH');
        const overlapping = await this.availability.activeSegments(organizationId, window, tx);
        if (
          overlapping.some(
            (segment) =>
              segment.line.id !== bookingServiceId &&
              overlaps(window.start, window.end, segment.start, segment.end) &&
              segment.assignedResourceIds.some((id) => unique.includes(id)),
          )
        )
          throw badRequest('RESOURCE_CONFLICT');
        await tx.bookingResource.updateMany({
          where: { bookingServiceId, status: 'ACTIVE' },
          data: {
            status: 'INVALIDATED',
            invalidatedAt: new Date(),
            invalidationReason: 'REPLACED',
          },
        });
        if (unique.length)
          await tx.bookingResource.createMany({
            data: unique.map((resourceId) => ({
              bookingServiceId,
              resourceId,
              assignedByUserId: actorUserId,
            })),
          });
        return {
          assignments: await tx.bookingResource.findMany({
            where: { bookingServiceId, status: 'ACTIVE' },
          }),
          remainingByType: requirements.map(({ resourceTypeId, requiredCount }) => ({
            resourceTypeId,
            remainingCount:
              requiredCount -
              resources.filter((resource) => resource.resourceTypeId === resourceTypeId).length,
          })),
        };
      },
      { timeout: 15_000 },
    );
  }
}
