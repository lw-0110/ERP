import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { StaffIdentityService } from '../staff-operations/staff-identity.service.js';
import { validCurrency } from './payment.service.js';
import { badRequest, conflict, notFound } from '../security/application-error.js';

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

  async record(organizationId: string, actorUserId: string, input: { bookingId: string; bookingServiceId: string; staffId: string; amountMinor: number; currency: string; explanation: string }) {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) throw badRequest('COMMISSION_INVALID_AMOUNT');
    if (!validCurrency(input.currency)) throw badRequest('PAYMENT_INVALID_CURRENCY');
    if (!input.explanation.trim()) throw badRequest('VALIDATION_INVALID_REQUEST');
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${input.bookingId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
      const booking = await tx.booking.findFirst({ where: { id: input.bookingId, organizationId }, select: { id: true, bookingNumber: true, status: true } });
      if (!booking) throw notFound('BOOKING_NOT_FOUND');
      if (booking.status !== 'COMPLETED') throw badRequest('COMMISSION_BOOKING_NOT_COMPLETED');
      const line = await tx.bookingService.findFirst({ where: { id: input.bookingServiceId, bookingId: booking.id }, include: { staffAssignments: { where: { staffId: input.staffId, status: 'ACTIVE' } } } });
      if (!line || !line.staffAssignments.length) throw badRequest('COMMISSION_STAFF_NOT_ASSIGNED');
      const staff = await tx.staffProfile.findFirst({ where: { id: input.staffId, organizationId } });
      if (!staff) throw new BadRequestException('Staff is not in this organization.');
      const assignment = line.staffAssignments[0];
      const sourceSnapshot = { kind: 'MANUAL', explanation: input.explanation.trim(), bookingNumber: booking.bookingNumber, bookingServiceId: line.id, serviceId: line.serviceId, staffId: staff.id, assignmentId: assignment.id, assignedAt: assignment.assignedAt.toISOString(), unitPriceMinorSnapshot: line.unitPriceMinorSnapshot, currencySnapshot: line.currencySnapshot, quantity: line.quantity, lineTotalMinor: line.lineTotalMinor };
      try {
        return await tx.commissionRecord.create({ data: { organizationId, bookingId: booking.id, bookingServiceId: line.id, staffId: staff.id, amountMinor: input.amountMinor, currency: input.currency, sourceSnapshot, recordedByUserId: actorUserId } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('BUSINESS_DUPLICATE');
        throw error;
      }
    }, { timeout: 15_000 });
  }

  async list(organizationId: string) {
    return prisma.commissionRecord.findMany({ where: { organizationId }, include: { staff: { select: { displayName: true } }, booking: { select: { bookingNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async mine(organizationId: string, userId: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    return prisma.commissionRecord.findMany({ where: { organizationId, staffId: staff.id }, include: { booking: { select: { bookingNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
