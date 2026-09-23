import { Injectable } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { badRequest, notFound } from '../security/application-error.js';

export function validCurrency(currency: string) {
  return /^[A-Z]{3}$/.test(currency) && Intl.supportedValuesOf('currency').includes(currency);
}

@Injectable()
export class PaymentService {
  private async booking(organizationId: string, bookingId: string, userId?: string) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, organizationId, ...(userId ? { customer: { userId } } : {}) }, include: { services: true } });
    if (!booking) throw notFound('PAYMENT_BOOKING_NOT_FOUND');
    return booking;
  }

  async list(organizationId: string, bookingId: string) {
    await this.booking(organizationId, bookingId);
    return prisma.paymentRecord.findMany({ where: { organizationId, bookingId }, orderBy: { paidAt: 'desc' }, take: 100 });
  }

  async record(organizationId: string, bookingId: string, actorUserId: string, input: { amountMinor: number; currency: string; paymentMethod: string; reference?: string; note?: string; paidAt: Date }) {
    await this.booking(organizationId, bookingId);
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) throw badRequest('PAYMENT_INVALID_AMOUNT');
    if (!validCurrency(input.currency)) throw badRequest('PAYMENT_INVALID_CURRENCY');
    if (!input.paymentMethod.trim() || !Number.isFinite(input.paidAt.getTime())) throw badRequest('VALIDATION_INVALID_REQUEST');
    return prisma.paymentRecord.create({ data: { organizationId, bookingId, amountMinor: input.amountMinor, currency: input.currency, paymentMethod: input.paymentMethod.trim(), reference: input.reference, note: input.note, paidAt: input.paidAt, recordedByUserId: actorUserId } });
  }

  async setStatus(organizationId: string, bookingId: string, status: PaymentStatus) {
    await this.booking(organizationId, bookingId);
    return prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: status } });
  }

  async summary(organizationId: string, bookingId: string, userId?: string) {
    const booking = await this.booking(organizationId, bookingId, userId);
    const payments = await prisma.paymentRecord.findMany({ where: { organizationId, bookingId }, orderBy: { paidAt: 'desc' }, take: 100 });
    const totals = new Map<string, { currency: string; bookedMinor: number; paidMinor: number }>();
    for (const line of booking.services) {
      const current = totals.get(line.currencySnapshot) ?? { currency: line.currencySnapshot, bookedMinor: 0, paidMinor: 0 };
      current.bookedMinor += line.lineTotalMinor; totals.set(line.currencySnapshot, current);
    }
    for (const payment of payments) {
      const current = totals.get(payment.currency) ?? { currency: payment.currency, bookedMinor: 0, paidMinor: 0 };
      current.paidMinor += payment.amountMinor; totals.set(payment.currency, current);
    }
    return { bookingId, paymentStatus: booking.paymentStatus, totalsByCurrency: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)), payments };
  }
}
