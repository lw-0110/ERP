import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../auth/prisma.js';
function valid(start: string, end: string) {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
    start >= end
  )
    throw new BadRequestException('Start time must be before end time.');
}
@Injectable()
export class SchedulingService {
  async openingHour(
    organizationId: string,
    dayOfWeek: number,
    openTime: string,
    closeTime: string,
  ) {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
      throw new BadRequestException('Invalid day of week.');
    valid(openTime, closeTime);
    return prisma.organizationOpeningHour.upsert({
      where: { organizationId_dayOfWeek: { organizationId, dayOfWeek } },
      update: { openTime, closeTime, status: 'ACTIVE' },
      create: { organizationId, dayOfWeek, openTime, closeTime },
    });
  }
  async staffSchedule(
    organizationId: string,
    staffId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
  ) {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
      throw new BadRequestException('Invalid day of week.');
    valid(startTime, endTime);
    if (!(await prisma.staffProfile.findFirst({ where: { id: staffId, organizationId } })))
      throw new NotFoundException('Staff profile not found.');
    return prisma.staffWorkingSchedule.upsert({
      where: { staffId_dayOfWeek: { staffId, dayOfWeek } },
      update: { startTime, endTime, status: 'ACTIVE', organizationId },
      create: { organizationId, staffId, dayOfWeek, startTime, endTime },
    });
  }
  async disableOpeningHour(organizationId: string, dayOfWeek: number) {
    const hour = await prisma.organizationOpeningHour.findUnique({
      where: { organizationId_dayOfWeek: { organizationId, dayOfWeek } },
    });
    if (!hour) throw new NotFoundException('Opening hour not found.');
    return prisma.organizationOpeningHour.update({
      where: { id: hour.id },
      data: { status: 'INACTIVE' },
    });
  }
  async disableStaffSchedule(organizationId: string, staffId: string, dayOfWeek: number) {
    const schedule = await prisma.staffWorkingSchedule.findFirst({
      where: { organizationId, staffId, dayOfWeek },
    });
    if (!schedule) throw new NotFoundException('Staff schedule not found.');
    return prisma.staffWorkingSchedule.update({
      where: { id: schedule.id },
      data: { status: 'INACTIVE' },
    });
  }
}
