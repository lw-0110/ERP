import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { StaffIdentityService } from './staff-identity.service.js';
import { badRequest, conflict, notFound } from '../security/application-error.js';

function localWorkDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00.000Z`);
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService) {}

  async clockIn(organizationId: string, userId: string, note?: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const now = new Date();
    try {
      return await prisma.attendanceRecord.create({ data: { organizationId, staffId: staff.id, workDate: localWorkDate(now, organization.timezone), clockInAt: now, note } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('ATTENDANCE_ALREADY_CLOCKED_IN');
      throw error;
    }
  }

  async clockOut(organizationId: string, userId: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    const open = await prisma.attendanceRecord.findFirst({ where: { organizationId, staffId: staff.id, clockOutAt: null }, orderBy: { clockInAt: 'desc' } });
    if (!open) throw badRequest('ATTENDANCE_NO_ACTIVE_CLOCK_IN');
    const now = new Date();
    if (now <= open.clockInAt) throw badRequest('ATTENDANCE_INVALID_CLOCK_OUT');
    const updated = await prisma.attendanceRecord.updateMany({ where: { id: open.id, organizationId, staffId: staff.id, clockOutAt: null }, data: { clockOutAt: now, status: 'PRESENT' } });
    if (!updated.count) throw new ConflictException('This attendance record was already closed.');
    return prisma.attendanceRecord.findUniqueOrThrow({ where: { id: open.id } });
  }

  async mine(organizationId: string, userId: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    return prisma.attendanceRecord.findMany({ where: { organizationId, staffId: staff.id }, orderBy: { clockInAt: 'desc' }, take: 100 });
  }

  list(organizationId: string, staffId?: string) {
    return prisma.attendanceRecord.findMany({ where: { organizationId, ...(staffId ? { staffId } : {}) }, include: { staff: { select: { id: true, displayName: true } } }, orderBy: { clockInAt: 'desc' }, take: 100 });
  }

  async get(organizationId: string, id: string) {
    const record = await prisma.attendanceRecord.findFirst({ where: { id, organizationId }, include: { staff: { select: { id: true, displayName: true } } } });
    if (!record) throw notFound('ATTENDANCE_ACCESS_DENIED');
    return record;
  }
}
