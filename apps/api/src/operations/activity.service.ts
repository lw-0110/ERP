import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';

export type Activity = {
  organizationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  requestId: string;
  notify?: boolean;
  result?: unknown;
};

type SafeReference = {
  bookingId?: string;
  bookingServiceId?: string;
  leaveRequestId?: string;
  commissionRecordId?: string;
  bookingChangeId?: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeReferences(value: SafeReference): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && uuid.test(entry[1]),
    ),
  ) as Prisma.InputJsonObject;
}

@Injectable()
export class ActivityService {
  async record(event: Activity): Promise<void> {
    const result = event.result as Record<string, unknown> | undefined;
    const invalidated = result?.invalidatedAssignmentIds as
      { staff?: unknown; resources?: unknown } | undefined;
    const ids = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && uuid.test(item))
        : [];
    const metadata: Prisma.InputJsonObject = {
      requestId: event.requestId,
      ...(typeof result?.bookingChangeId === 'string' && uuid.test(result.bookingChangeId)
        ? { bookingChangeId: result.bookingChangeId }
        : {}),
      ...(typeof result?.reasonProvided === 'boolean'
        ? { reasonProvided: result.reasonProvided }
        : {}),
      ...(typeof result?.status === 'string' ? { status: result.status } : {}),
      ...(result?.startDateTime instanceof Date
        ? { startDateTime: result.startDateTime.toISOString() }
        : {}),
      ...(result?.endDateTime instanceof Date
        ? { endDateTime: result.endDateTime.toISOString() }
        : {}),
      ...(ids(invalidated?.staff).length
        ? { invalidatedStaffAssignmentIds: ids(invalidated?.staff) }
        : {}),
      ...(ids(invalidated?.resources).length
        ? { invalidatedResourceAssignmentIds: ids(invalidated?.resources) }
        : {}),
    };
    await prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        actorUserId: event.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId && uuid.test(event.entityId) ? event.entityId : undefined,
        metadata,
      },
    });
    if (event.notify !== false) await this.notifyFor(event);
  }

  private async createNotification(
    organizationId: string,
    userId: string | null | undefined,
    type: string,
    title: string,
    message: string,
    eventKey: string,
    metadata: SafeReference,
  ): Promise<void> {
    if (!userId) return;
    const membership = await prisma.membership.findFirst({
      where: {
        organizationId,
        userId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) return;
    await prisma.notification.createMany({
      data: [
        {
          organizationId,
          userId,
          type,
          title,
          message,
          eventKey,
          metadata: safeReferences(metadata),
        },
      ],
      skipDuplicates: true,
    });
  }

  private async leaveReviewers(organizationId: string) {
    return prisma.membership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        role: {
          is: {
            organizationId,
            status: 'ACTIVE',
            permissions: { some: { permission: { key: 'leave.review' } } },
          },
        },
      },
      select: { userId: true },
    });
  }

  private async permissionRecipients(organizationId: string, permission: string) {
    return prisma.membership.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        role: {
          is: {
            organizationId,
            status: 'ACTIVE',
            permissions: { some: { permission: { key: permission } } },
          },
        },
      },
      select: { userId: true },
    });
  }

  private async notifyFor(event: Activity): Promise<void> {
    const result = event.result as Record<string, unknown> | undefined;
    const id = typeof result?.id === 'string' ? result.id : event.entityId;
    const org = event.organizationId;
    if (
      event.action.startsWith('booking.cancelled.') ||
      event.action.startsWith('booking.rescheduled.')
    ) {
      if (!id) return;
      const booking = await prisma.booking.findFirst({
        where: { id, organizationId: org },
        select: {
          customer: { select: { userId: true } },
          services: {
            select: {
              staffAssignments: {
                where: { status: 'ACTIVE' },
                select: { staff: { select: { userId: true } } },
              },
            },
          },
        },
      });
      const changeId =
        typeof result?.bookingChangeId === 'string' && uuid.test(result.bookingChangeId)
          ? result.bookingChangeId
          : event.requestId;
      const isCustomer = event.action.endsWith('.customer');
      const isReschedule = event.action.includes('rescheduled');
      const recipientIds = new Set<string>();
      if (!isCustomer && booking?.customer.userId) recipientIds.add(booking.customer.userId);
      for (const line of booking?.services ?? [])
        for (const assignment of line.staffAssignments)
          if (assignment.staff.userId) recipientIds.add(assignment.staff.userId);
      const invalidated = result?.invalidatedAssignmentIds as
        { staff?: unknown[]; resources?: unknown[] } | undefined;
      if (
        isCustomer &&
        (!isReschedule || Boolean(invalidated?.staff?.length || invalidated?.resources?.length))
      ) {
        for (const member of await this.permissionRecipients(
          org,
          isReschedule ? 'booking.reschedule.all' : 'booking.cancel.all',
        ))
          recipientIds.add(member.userId);
      }
      for (const userId of recipientIds)
        await this.createNotification(
          org,
          userId,
          event.action,
          isReschedule ? 'Booking rescheduled' : 'Booking cancelled',
          isReschedule ? 'A booking schedule has changed.' : 'A booking has been cancelled.',
          `${event.action}:${changeId}:${userId}`,
          { bookingId: id, ...(uuid.test(changeId) ? { bookingChangeId: changeId } : {}) },
        );
    }
    if (
      (event.action === 'booking.created' ||
        event.action === 'booking.status.changed' ||
        event.action === 'payment.status.changed') &&
      id
    ) {
      const booking = await prisma.booking.findFirst({
        where: { id, organizationId: org },
        select: { customer: { select: { userId: true } } },
      });
      const type = event.action;
      const occurrence = event.action === 'booking.created' ? id : `${id}:${event.requestId}`;
      await this.createNotification(
        org,
        booking?.customer.userId,
        type,
        'Booking update',
        'A booking update is available.',
        `${type}:${occurrence}`,
        { bookingId: id },
      );
    }
    if (event.action === 'booking.staff.assigned' && event.entityId) {
      const assignments = Array.isArray(result?.assignments)
        ? (result.assignments as Array<{ id: string; staffId: string }>)
        : [];
      const staff = await prisma.staffProfile.findMany({
        where: { organizationId: org, id: { in: assignments.map((item) => item.staffId) } },
        select: { id: true, userId: true },
      });
      for (const assignment of assignments) {
        const recipient = staff.find((item) => item.id === assignment.staffId)?.userId;
        await this.createNotification(
          org,
          recipient,
          event.action,
          'Booking assignment',
          'You have been assigned to a booking service.',
          `${event.action}:${assignment.id}`,
          { bookingServiceId: event.entityId },
        );
      }
    }
    if (event.action === 'commission.recorded' && id) {
      const commission = await prisma.commissionRecord.findFirst({
        where: { id, organizationId: org },
        select: { staff: { select: { userId: true } } },
      });
      await this.createNotification(
        org,
        commission?.staff.userId,
        event.action,
        'Commission recorded',
        'A commission record is available.',
        `${event.action}:${id}`,
        { commissionRecordId: id },
      );
    }
    if ((event.action === 'leave.submitted' || event.action === 'leave.reviewed') && id) {
      const leave = await prisma.leaveRequest.findFirst({
        where: { id, organizationId: org },
        select: { staff: { select: { userId: true } } },
      });
      if (event.action === 'leave.reviewed') {
        await this.createNotification(
          org,
          leave?.staff.userId,
          event.action,
          'Leave request update',
          'Your leave request has been reviewed.',
          `${event.action}:${id}:${event.requestId}`,
          { leaveRequestId: id },
        );
      } else {
        for (const reviewer of await this.leaveReviewers(org)) {
          await this.createNotification(
            org,
            reviewer.userId,
            event.action,
            'Leave request submitted',
            'A leave request needs review.',
            `${event.action}:${id}`,
            { leaveRequestId: id },
          );
          const conflicts = Array.isArray(result?.conflicts) ? result.conflicts : [];
          if (conflicts.length)
            await this.createNotification(
              org,
              reviewer.userId,
              'leave.conflict.detected',
              'Leave conflict',
              'A leave request conflicts with assigned work.',
              `leave.conflict.detected:${id}`,
              { leaveRequestId: id },
            );
        }
      }
    }
  }
}
