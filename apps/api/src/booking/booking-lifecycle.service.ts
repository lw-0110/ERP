import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { badRequest, forbidden, notFound } from '../security/application-error.js';
import { assertCountSnapshots } from './booking-snapshots.js';
import { AvailabilityService, bookingLineWindows } from './availability.service.js';
import { BookingPolicyService } from './booking-policy.service.js';

type ActorKind = 'CUSTOMER' | 'ADMIN';
type Database = Prisma.TransactionClient | typeof prisma;
const activeAssignments = {
  services: {
    include: {
      staffAssignments: { where: { status: 'ACTIVE' as const } },
      resourceAssignments: { where: { status: 'ACTIVE' as const } },
    },
  },
};

@Injectable()
export class BookingLifecycleService {
  constructor(
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(BookingPolicyService) private readonly policies: BookingPolicyService,
  ) {}

  private async target(db: Database, organizationId: string, bookingId: string, userId?: string) {
    const booking = await db.booking.findFirst({
      where: { id: bookingId, organizationId, ...(userId ? { customer: { userId } } : {}) },
      include: activeAssignments,
    });
    if (!booking) throw notFound('BOOKING_NOT_FOUND');
    return booking;
  }

  private cutoffSatisfied(start: Date, cutoffMinutes: number | null, now = new Date()) {
    return cutoffMinutes === null || (start.getTime() - now.getTime()) / 60_000 >= cutoffMinutes;
  }

  async customerEligibility(organizationId: string, userId: string, bookingId: string) {
    const [booking, policy] = await Promise.all([
      this.target(prisma, organizationId, bookingId, userId),
      this.policies.get(organizationId),
    ]);
    const customerRescheduleCount = await prisma.bookingChange.count({
      where: { organizationId, bookingId, type: 'RESCHEDULED', initiatedBy: 'CUSTOMER' },
    });
    const statusAllowed = booking.status === 'CONFIRMED';
    const cancellationCutoffSatisfied = this.cutoffSatisfied(
      booking.startDateTime,
      policy.cancellationCutoffMinutes,
    );
    const rescheduleCutoffSatisfied = this.cutoffSatisfied(
      booking.startDateTime,
      policy.rescheduleCutoffMinutes,
    );
    const belowLimit =
      policy.maxCustomerReschedules === null ||
      customerRescheduleCount < policy.maxCustomerReschedules;
    return {
      cancel: {
        allowed: statusAllowed && policy.customerCancellationEnabled && cancellationCutoffSatisfied,
        reason: !statusAllowed
          ? 'BOOKING_STATUS'
          : !policy.customerCancellationEnabled
            ? 'POLICY_DISABLED'
            : !cancellationCutoffSatisfied
              ? 'CUTOFF'
              : null,
      },
      reschedule: {
        allowed:
          statusAllowed &&
          policy.customerRescheduleEnabled &&
          rescheduleCutoffSatisfied &&
          belowLimit,
        reason: !statusAllowed
          ? 'BOOKING_STATUS'
          : !policy.customerRescheduleEnabled
            ? 'POLICY_DISABLED'
            : !rescheduleCutoffSatisfied
              ? 'CUTOFF'
              : !belowLimit
                ? 'LIMIT_REACHED'
                : null,
        customerRescheduleCount,
        maxCustomerReschedules: policy.maxCustomerReschedules,
      },
    };
  }

  private async cancel(
    organizationId: string,
    actorUserId: string,
    bookingId: string,
    initiatedBy: ActorKind,
    reason?: string,
  ) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
        const booking = await this.target(
          tx,
          organizationId,
          bookingId,
          initiatedBy === 'CUSTOMER' ? actorUserId : undefined,
        );
        if (booking.status !== 'CONFIRMED')
          throw badRequest('BOOKING_INVALID_STATUS');
        if (initiatedBy === 'CUSTOMER') {
          const policy = await this.policies.get(organizationId, tx);
          if (!policy.customerCancellationEnabled)
            throw forbidden('BOOKING_CANCELLATION_DISABLED');
          if (!this.cutoffSatisfied(booking.startDateTime, policy.cancellationCutoffMinutes))
            throw forbidden('BOOKING_CANCELLATION_CUTOFF');
        }
        const now = new Date();
        const change = await tx.bookingChange.create({
          data: {
            organizationId,
            bookingId,
            type: 'CANCELLED',
            initiatedBy,
            actorUserId,
            reason: reason?.trim() || undefined,
            previousStartDateTime: booking.startDateTime,
            previousEndDateTime: booking.endDateTime,
          },
        });
        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED', cancelledAt: now },
          include: activeAssignments,
        });
        return {
          ...updated,
          bookingChangeId: change.id,
          reasonProvided: Boolean(reason?.trim()),
          warnings: ['PARTIALLY_PAID', 'PAID', 'REFUND_PENDING', 'REFUNDED'].includes(
            updated.paymentStatus,
          )
            ? ['Payment history and status were preserved; handle any refund manually.']
            : [],
        };
      },
      { timeout: 15_000 },
    );
  }

  cancelCustomer(organizationId: string, userId: string, bookingId: string, reason?: string) {
    return this.cancel(organizationId, userId, bookingId, 'CUSTOMER', reason);
  }
  cancelAdmin(organizationId: string, userId: string, bookingId: string, reason?: string) {
    return this.cancel(organizationId, userId, bookingId, 'ADMIN', reason);
  }

  private async validateNewSegments(
    tx: Prisma.TransactionClient,
    organizationId: string,
    bookingId: string,
    startDateTime: Date,
    booking: Awaited<ReturnType<BookingLifecycleService['target']>>,
  ) {
    const segments = bookingLineWindows(startDateTime, booking.services);
    for (const segment of segments) {
      assertCountSnapshots(segment.line.requiredResourceTypeCountsSnapshot, 'resourceTypeId');
      if (
        !(await this.availability.hasCapacity(
          organizationId,
          segment.start,
          segment.end,
          segment.line.requiredStaffCountSnapshot,
          tx,
          bookingId,
        ))
      )
        throw badRequest('BOOKING_INSUFFICIENT_STAFF');
      if (
        !(await this.availability.hasResourceCapacity(
          organizationId,
          segment.start,
          segment.end,
          segment.line.requiredResourceTypeCountsSnapshot,
          tx,
          bookingId,
        ))
      )
        throw badRequest('BOOKING_RESOURCE_UNAVAILABLE');
    }
    return segments;
  }

  private async reschedule(
    organizationId: string,
    actorUserId: string,
    bookingId: string,
    initiatedBy: ActorKind,
    startDateTime: Date,
    reason?: string,
  ) {
    if (!Number.isFinite(startDateTime.getTime()) || startDateTime <= new Date())
      throw new BadRequestException('Choose a future start time.');
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
        const booking = await this.target(
          tx,
          organizationId,
          bookingId,
          initiatedBy === 'CUSTOMER' ? actorUserId : undefined,
        );
        if (booking.status !== 'CONFIRMED')
          throw badRequest('BOOKING_INVALID_STATUS');
        if (initiatedBy === 'CUSTOMER') {
          const policy = await this.policies.get(organizationId, tx);
          if (!policy.customerRescheduleEnabled)
            throw forbidden('BOOKING_RESCHEDULE_DISABLED');
          if (!this.cutoffSatisfied(booking.startDateTime, policy.rescheduleCutoffMinutes))
            throw forbidden('BOOKING_RESCHEDULE_CUTOFF');
          if (policy.maxCustomerReschedules !== null) {
            const count = await tx.bookingChange.count({
              where: { organizationId, bookingId, type: 'RESCHEDULED', initiatedBy: 'CUSTOMER' },
            });
            if (count >= policy.maxCustomerReschedules)
              throw forbidden('BOOKING_RESCHEDULE_LIMIT');
          }
        }
        const segments = await this.validateNewSegments(
          tx,
          organizationId,
          bookingId,
          startDateTime,
          booking,
        );
        const invalidStaffIds: string[] = [];
        const invalidResourceIds: string[] = [];
        for (const segment of segments) {
          const current = booking.services.find((line) => line.id === segment.line.id)!;
          assertCountSnapshots(current.requiredResourceTypeCountsSnapshot, 'resourceTypeId');
          const requiredResourceTypes = new Set(
            current.requiredResourceTypeCountsSnapshot.map(({ resourceTypeId }) => resourceTypeId),
          );
          const scheduledStaff = new Set(
            (await this.availability.scheduleEligibleStaff(organizationId, segment, tx)).map(
              ({ id }) => id,
            ),
          );
          const otherSegments = await this.availability.activeSegments(
            organizationId,
            segment,
            tx,
            bookingId,
          );
          for (const assignment of current.staffAssignments)
            if (
              !scheduledStaff.has(assignment.staffId) ||
              otherSegments.some((other) => other.assignedStaffIds.includes(assignment.staffId))
            )
              invalidStaffIds.push(assignment.id);
          const resources = await tx.resource.findMany({
            where: {
              id: { in: current.resourceAssignments.map(({ resourceId }) => resourceId) },
              organizationId,
              resourceTypeId: { in: [...requiredResourceTypes] },
              status: 'ACTIVE',
              resourceType: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          const validResources = new Set(resources.map(({ id }) => id));
          for (const assignment of current.resourceAssignments)
            if (
              !validResources.has(assignment.resourceId) ||
              otherSegments.some((other) =>
                other.assignedResourceIds.includes(assignment.resourceId),
              )
            )
              invalidResourceIds.push(assignment.id);
        }
        const invalidatedAt = new Date();
        if (invalidStaffIds.length)
          await tx.bookingStaff.updateMany({
            where: { id: { in: invalidStaffIds }, status: 'ACTIVE' },
            data: {
              status: 'INVALIDATED',
              invalidatedAt,
              invalidationReason: 'RESCHEDULE_CONFLICT',
            },
          });
        if (invalidResourceIds.length)
          await tx.bookingResource.updateMany({
            where: { id: { in: invalidResourceIds }, status: 'ACTIVE' },
            data: {
              status: 'INVALIDATED',
              invalidatedAt,
              invalidationReason: 'RESCHEDULE_CONFLICT',
            },
          });
        const endDateTime = segments.at(-1)?.end ?? startDateTime;
        const change = await tx.bookingChange.create({
          data: {
            organizationId,
            bookingId,
            type: 'RESCHEDULED',
            initiatedBy,
            actorUserId,
            reason: reason?.trim() || undefined,
            previousStartDateTime: booking.startDateTime,
            previousEndDateTime: booking.endDateTime,
            newStartDateTime: startDateTime,
            newEndDateTime: endDateTime,
          },
        });
        const updated = await tx.booking.update({
          where: { id: bookingId },
          data: { startDateTime, endDateTime },
          include: activeAssignments,
        });
        return {
          ...updated,
          bookingChangeId: change.id,
          reasonProvided: Boolean(reason?.trim()),
          invalidatedAssignmentIds: { staff: invalidStaffIds, resources: invalidResourceIds },
          warnings: [
            ...(invalidStaffIds.length
              ? ['One or more staff assignments require reassignment.']
              : []),
            ...(invalidResourceIds.length
              ? ['One or more resource assignments require reassignment.']
              : []),
          ],
        };
      },
      { timeout: 15_000 },
    );
  }

  rescheduleCustomer(
    organizationId: string,
    userId: string,
    bookingId: string,
    start: Date,
    reason?: string,
  ) {
    return this.reschedule(organizationId, userId, bookingId, 'CUSTOMER', start, reason);
  }
  rescheduleAdmin(
    organizationId: string,
    userId: string,
    bookingId: string,
    start: Date,
    reason?: string,
  ) {
    return this.reschedule(organizationId, userId, bookingId, 'ADMIN', start, reason);
  }
}
