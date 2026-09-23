import { ForbiddenException, Injectable } from '@nestjs/common';
import { prisma } from '../auth/prisma.js';

@Injectable()
export class StaffIdentityService {
  async own(organizationId: string, userId: string) {
    const staff = await prisma.staffProfile.findFirst({ where: { organizationId, userId, status: 'ACTIVE' } });
    if (!staff) throw new ForbiddenException('An active linked staff profile is required.');
    return staff;
  }
}
