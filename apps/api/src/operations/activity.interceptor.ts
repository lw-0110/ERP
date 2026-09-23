import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, mergeMap } from 'rxjs';
import { prisma } from '../auth/prisma.js';
import type { TenantRequest } from '../business/tenant-request.js';
import { ActivityService } from './activity.service.js';

const uuidPart = '[0-9a-f-]{36}';
function eventName(method: string, path: string): [string, string] {
  if (method === 'POST' && path === '/bookings') return ['booking.created', 'Booking'];
  if (method === 'PATCH' && new RegExp(`^/bookings/${uuidPart}/status$`, 'i').test(path))
    return ['booking.status.changed', 'Booking'];
  if (method === 'PATCH' && new RegExp(`^/bookings/${uuidPart}/cancel$`, 'i').test(path))
    return ['booking.cancelled.customer', 'Booking'];
  if (method === 'PATCH' && new RegExp(`^/bookings/${uuidPart}/reschedule$`, 'i').test(path))
    return ['booking.rescheduled.customer', 'Booking'];
  if (method === 'PATCH' && new RegExp(`^/admin/bookings/${uuidPart}/cancel$`, 'i').test(path))
    return ['booking.cancelled.admin', 'Booking'];
  if (method === 'PATCH' && new RegExp(`^/admin/bookings/${uuidPart}/reschedule$`, 'i').test(path))
    return ['booking.rescheduled.admin', 'Booking'];
  if (method === 'PATCH' && new RegExp(`^/bookings/${uuidPart}/payment-status$`, 'i').test(path))
    return ['payment.status.changed', 'Booking'];
  if (
    method === 'PUT' &&
    new RegExp(`^/bookings/${uuidPart}/services/${uuidPart}/staff$`, 'i').test(path)
  )
    return ['booking.staff.assigned', 'BookingService'];
  if (
    method === 'PUT' &&
    new RegExp(`^/bookings/${uuidPart}/services/${uuidPart}/resources$`, 'i').test(path)
  )
    return ['booking.resource.assigned', 'BookingService'];
  if (method === 'POST' && path === '/leave-requests') return ['leave.submitted', 'LeaveRequest'];
  if (method === 'PATCH' && /\/leave-requests\/[0-9a-f-]{36}\/(approve|reject)$/i.test(path))
    return ['leave.reviewed', 'LeaveRequest'];
  if (method === 'POST' && path === '/commissions')
    return ['commission.recorded', 'CommissionRecord'];
  if (method === 'POST' && /\/bookings\/[0-9a-f-]{36}\/payments$/i.test(path))
    return ['payment.recorded', 'PaymentRecord'];
  if (method === 'POST' && path === '/clock-in') return ['attendance.clock.in', 'AttendanceRecord'];
  if (method === 'POST' && path === '/clock-out')
    return ['attendance.clock.out', 'AttendanceRecord'];
  if (method === 'PATCH' && path === '/settings/organization')
    return ['organization.settings.changed', 'Organization'];
  if (method === 'PATCH' && path === '/settings/booking-policy')
    return ['booking.policy.changed', 'BookingPolicy'];
  if (path.includes('opening-hours'))
    return ['organization.opening-hours.changed', 'OrganizationOpeningHour'];
  if (path.includes('/schedule')) return ['staff.schedule.changed', 'StaffWorkingSchedule'];
  if (path.includes('commission-rules')) return ['commission.rule.changed', 'CommissionRule'];
  if (method === 'POST' && /\/staff\/[0-9a-f-]{36}\/invitations$/i.test(path))
    return ['staff.invitation.created', 'StaffInvitation'];
  if (method === 'PATCH' && /\/staff\/[0-9a-f-]{36}\/invitations\/[0-9a-f-]{36}\/revoke$/i.test(path))
    return ['staff.invitation.revoked', 'StaffInvitation'];
  const entity = path.split('/').filter(Boolean)[0] ?? 'resource';
  return [`${entity}.${method.toLowerCase()}`, entity];
}

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(@Inject(ActivityService) private readonly activities: ActivityService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<TenantRequest & { requestId?: string }>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || !request.identity)
      return next.handle();
    const { organizationId } = request.identity.membership;
    const actorUserId = request.identity.session.user.id;
    const [action, entityType] = eventName(request.method, request.path);
    const ids =
      request.path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [];
    const entityId = action.includes('assigned') ? ids.at(-1) : ids[0];
    const previousStatus =
      action === 'booking.status.changed' || action === 'payment.status.changed'
        ? await prisma.booking.findFirst({
            where: { id: entityId, organizationId },
            select: { status: true, paymentStatus: true },
          })
        : null;
    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        const record = result as Record<string, unknown> | undefined;
        const sameStatus =
          action === 'booking.status.changed'
            ? previousStatus?.status === record?.status
            : action === 'payment.status.changed' &&
              previousStatus?.paymentStatus === record?.paymentStatus;
        try {
          await this.activities.record({
            organizationId,
            actorUserId,
            action,
            entityType,
            entityId: typeof record?.id === 'string' ? record.id : entityId,
            requestId: request.requestId ?? '',
            notify: !sameStatus,
            result,
          });
        } catch {
          // The business mutation has already committed; do not falsely report that it failed.
          console.error(
            JSON.stringify({
              level: 'error',
              event: 'activity.record.failed',
              requestId: request.requestId,
            }),
          );
        }
        return result;
      }),
    );
  }
}
