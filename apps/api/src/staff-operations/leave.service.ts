import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { overlaps } from '../booking/availability.js';
import { bookingLineWindows } from '../booking/availability.service.js';
import { StaffIdentityService } from './staff-identity.service.js';
import { badRequest, conflict, notFound } from '../security/application-error.js';

@Injectable()
export class LeaveService {
  constructor(@Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService) {}

  async types(organizationId: string) {
    return prisma.leaveType.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
  }

  async createType(organizationId: string, name: string, description?: string) {
    if (!name.trim()) throw new BadRequestException('Leave type name is required.');
    try {
      return await prisma.leaveType.create({ data: { organizationId, name: name.trim(), description } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Leave type name already exists.');
      throw error;
    }
  }

  async archiveType(organizationId: string, id: string) {
    const result = await prisma.leaveType.updateMany({ where: { id, organizationId }, data: { status: 'INACTIVE' } });
    if (!result.count) throw new NotFoundException('Leave type not found.');
    return prisma.leaveType.findUniqueOrThrow({ where: { id } });
  }

  async create(organizationId: string, userId: string, leaveTypeId: string, startDateTime: Date, endDateTime: Date, reason?: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    if (!Number.isFinite(startDateTime.getTime()) || !Number.isFinite(endDateTime.getTime()) || endDateTime <= startDateTime) throw badRequest('LEAVE_INVALID_RANGE');
    const leaveType = await prisma.leaveType.findFirst({ where: { id: leaveTypeId, organizationId, status: 'ACTIVE' } });
    if (!leaveType) throw new BadRequestException('An active leave type in this organization is required.');
    const leave = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${organizationId}))) AS held`;
      return tx.leaveRequest.create({ data: { organizationId, staffId: staff.id, leaveTypeId, startDateTime, endDateTime, reason } });
    });
    return { ...leave, conflicts: await this.conflicts(leave) };
  }

  async mine(organizationId: string, userId: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    return prisma.leaveRequest.findMany({ where: { organizationId, staffId: staff.id }, include: { leaveType: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async own(organizationId: string, userId: string, id: string) {
    const staff = await this.staffIdentity.own(organizationId, userId);
    const leave = await prisma.leaveRequest.findFirst({ where: { id, organizationId, staffId: staff.id }, include: { leaveType: { select: { name: true } } } });
    if (!leave) throw notFound('LEAVE_ACCESS_DENIED');
    return leave;
  }

  async list(organizationId: string) {
    const leaves = await prisma.leaveRequest.findMany({ where: { organizationId }, include: { staff: { select: { id: true, displayName: true } }, leaveType: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
    return Promise.all(leaves.map(async (leave) => ({ ...leave, conflicts: ['PENDING', 'APPROVED'].includes(leave.status) ? await this.conflicts(leave) : [] })));
  }

  async get(organizationId: string, id: string) {
    const leave = await prisma.leaveRequest.findFirst({ where: { id, organizationId }, include: { staff: { select: { id: true, displayName: true } }, leaveType: { select: { name: true } } } });
    if (!leave) throw notFound('LEAVE_NOT_FOUND');
    return { ...leave, conflicts: ['PENDING', 'APPROVED'].includes(leave.status) ? await this.conflicts(leave) : [] };
  }

  async review(organizationId: string, id: string, reviewerUserId: string, decision: 'APPROVED' | 'REJECTED', adminNote?: string) {
    const result = await prisma.leaveRequest.updateMany({ where: { id, organizationId, status: 'PENDING' }, data: { status: decision, reviewedByUserId: reviewerUserId, reviewedAt: new Date(), adminNote } });
    if (!result.count) throw conflict('LEAVE_ALREADY_REVIEWED');
    return this.get(organizationId, id);
  }

  async conflicts(leave: { organizationId: string; staffId: string; startDateTime: Date; endDateTime: Date }) {
    const bookings = await prisma.booking.findMany({ where: { organizationId: leave.organizationId, status: { in: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] }, startDateTime: { lt: leave.endDateTime }, endDateTime: { gt: leave.startDateTime }, services: { some: { staffAssignments: { some: { staffId: leave.staffId, status: 'ACTIVE' } } } } }, include: { services: { include: { staffAssignments: { where: { status: 'ACTIVE' } } } } } });
    return bookings.flatMap((booking) => bookingLineWindows(booking.startDateTime, booking.services).filter((segment) => segment.line.staffAssignments.some((assignment) => assignment.staffId === leave.staffId) && overlaps(segment.start, segment.end, leave.startDateTime, leave.endDateTime)).map((segment) => ({ bookingId: booking.id, bookingNumber: booking.bookingNumber, bookingServiceId: segment.line.id, startDateTime: segment.start, endDateTime: segment.end })));
  }
}
