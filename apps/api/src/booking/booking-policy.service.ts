import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { badRequest } from '../security/application-error.js';

export type BookingPolicyInput = {
  customerCancellationEnabled: boolean;
  customerRescheduleEnabled: boolean;
  cancellationCutoffMinutes: number | null;
  rescheduleCutoffMinutes: number | null;
  maxCustomerReschedules: number | null;
};

export const DEFAULT_BOOKING_POLICY: BookingPolicyInput = {
  customerCancellationEnabled: false,
  customerRescheduleEnabled: false,
  cancellationCutoffMinutes: null,
  rescheduleCutoffMinutes: null,
  maxCustomerReschedules: null,
};

type Database = Prisma.TransactionClient | typeof prisma;

@Injectable()
export class BookingPolicyService {
  private validate(input: BookingPolicyInput) {
    for (const value of [
      input.cancellationCutoffMinutes,
      input.rescheduleCutoffMinutes,
      input.maxCustomerReschedules,
    ]) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0))
        throw badRequest('SETTINGS_INVALID_POLICY');
    }
  }

  async get(organizationId: string, db: Database = prisma) {
    const stored = await db.bookingPolicy.findUnique({ where: { organizationId } });
    return (
      stored ?? {
        id: null,
        organizationId,
        ...DEFAULT_BOOKING_POLICY,
        createdAt: null,
        updatedAt: null,
      }
    );
  }

  async update(organizationId: string, input: BookingPolicyInput) {
    this.validate(input);
    return prisma.bookingPolicy.upsert({
      where: { organizationId },
      create: { organizationId, ...input },
      update: input,
    });
  }
}
