import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { StaffIdentityService } from '../staff-operations/staff-identity.service.js';
import { badRequest, notFound } from '../security/application-error.js';

// Called only inside the transaction that completes the booking. It never updates earnings.
export async function createCompletedBookingCommissions(tx: Prisma.TransactionClient, organizationId: string, bookingId: string, actorUserId: string) {
  const booking = await tx.booking.findFirst({
    where: { id: bookingId, organizationId },
    include: { services: { include: { staffAssignments: { where: { status: 'ACTIVE' }, include: { staff: { select: { organizationId: true } } } } } } },
  });
  if (!booking) throw notFound('BOOKING_NOT_FOUND');
  if (booking.status !== 'COMPLETED') throw badRequest('COMMISSION_BOOKING_NOT_COMPLETED');
  const services = await tx.service.findMany({ where: { organizationId, id: { in: booking.services.map((line) => line.serviceId) } } });
  for (const line of booking.services) {
    if (line.staffAssignments.length > 1) throw badRequest('STAFF_ASSIGNMENT_LIMIT');
    const assignment = line.staffAssignments[0];
    if (!assignment) continue;
    if (assignment.staff.organizationId !== organizationId) throw badRequest('STAFF_CROSS_TENANT');
    const service = services.find((item) => item.id === line.serviceId);
    if (!service) throw notFound('BUSINESS_NOT_FOUND');
    const amountMinor = new Prisma.Decimal(line.lineTotalMinor).mul(service.commissionPercentage).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    if (amountMinor === 0) continue;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > 2147483647) throw badRequest('COMMISSION_INVALID_AMOUNT');
    const percentage = service.commissionPercentage.toFixed(2);
    const sourceSnapshot = {
      kind: 'AUTOMATIC', explanation: `Automatic service commission (${percentage}%).`,
      commissionPercentage: percentage, serviceName: service.name,
      bookingNumber: booking.bookingNumber, bookingServiceId: line.id, serviceId: line.serviceId,
      staffId: assignment.staffId, assignmentId: assignment.id, assignedAt: assignment.assignedAt.toISOString(),
      unitPriceMinorSnapshot: line.unitPriceMinorSnapshot, currencySnapshot: line.currencySnapshot,
      quantity: line.quantity, lineTotalMinor: line.lineTotalMinor,
    };
    await tx.commissionRecord.createMany({ data: [{ organizationId, bookingId, bookingServiceId: line.id, staffId: assignment.staffId, amountMinor, currency: line.currencySnapshot, sourceSnapshot, recordedByUserId: actorUserId }], skipDuplicates: true });
  }
}

function draftConfiguration(value: unknown): Prisma.InputJsonValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Commission draft configuration must be a JSON object.');
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > 8192) throw new BadRequestException('Commission draft configuration is too large.');
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Invalid commission draft configuration.');
  }
}

@Injectable()
export class CommissionService {
  constructor(@Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService) {}

  async rules(organizationId: string) {
    return prisma.commissionRule.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100 });
  }

  async createRule(organizationId: string, serviceId: string | undefined, configuration: unknown) {
    if (serviceId && !await prisma.service.findFirst({ where: { id: serviceId, organizationId } })) throw new BadRequestException('Service is not in this organization.');
    return prisma.commissionRule.create({ data: { organizationId, serviceId, configuration: draftConfiguration(configuration) } });
  }

  async updateRule(organizationId: string, id: string, configuration: unknown) {
    const existing = await prisma.commissionRule.findFirst({ where: { id, organizationId, status: 'DRAFT' } });
    if (!existing) throw new NotFoundException('Editable commission draft not found.');
    return prisma.commissionRule.update({ where: { id }, data: { configuration: draftConfiguration(configuration), version: { increment: 1 } } });
  }

  async archiveRule(organizationId: string, id: string) {
    const changed = await prisma.commissionRule.updateMany({ where: { id, organizationId }, data: { status: 'ARCHIVED' } });
    if (!changed.count) throw new NotFoundException('Commission draft not found.');
    return prisma.commissionRule.findUniqueOrThrow({ where: { id } });
  }

  async list(organizationId: string) {
    return prisma.commissionRecord.findMany({ where: { organizationId }, include: { staff: { select: { displayName: true } }, booking: { select: { bookingNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async mine(organizationId: string, userId: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    return prisma.commissionRecord.findMany({ where: { organizationId, staffId: staff.id }, include: { booking: { select: { bookingNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
