import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import type { CustomerDto, PaginationDto } from './dto.js';

@Injectable()
export class CustomerService {
  async searchForBooking(organizationId: string, input: string) {
    const query = input.trim().slice(0, 120);
    if (!query) return [];
    const digits = query.replace(/\D/g, '');
    const normalized = digits.startsWith('0') ? `60${digits.slice(1)}` : digits;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM customer_profiles
      WHERE organization_id = ${organizationId}::uuid
        AND (
          display_name ILIKE ${`%${query}%`}
          OR email ILIKE ${`%${query}%`}
          OR (${normalized.length >= 4} AND
            (CASE WHEN left(regexp_replace(phone, '[^0-9]', '', 'g'), 1) = '0'
              THEN '60' || substring(regexp_replace(phone, '[^0-9]', '', 'g') from 2)
              ELSE regexp_replace(phone, '[^0-9]', '', 'g') END) LIKE ${`%${normalized}%`})
        )
      ORDER BY display_name LIMIT 20`;
    if (!ids.length) return [];
    const customers = await prisma.customerProfile.findMany({
      where: { organizationId, id: { in: ids.map(({ id }) => id) } },
      include: { _count: { select: { bookings: { where: { status: 'COMPLETED' } } } }, bookings: { where: { status: 'COMPLETED' }, orderBy: { endDateTime: 'desc' }, take: 1, select: { endDateTime: true } } },
      orderBy: { displayName: 'asc' },
    });
    return customers.map(({ _count, bookings, ...customer }) => ({ ...customer, completedVisitCount: _count.bookings, lastCompletedVisit: bookings[0]?.endDateTime ?? null }));
  }
  async completeOwn(organizationId: string, userId: string, firstName: string, lastName: string, phone: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const existing = await prisma.customerProfile.findFirst({ where: { organizationId, userId } });
    if (existing?.status === 'INACTIVE') throw new BadRequestException('Customer profile is inactive.');
    const data = { firstName, lastName, displayName: `${firstName} ${lastName}`.trim(), phone, email: user.email };
    return prisma.customerProfile.upsert({ where: { organizationId_userId: { organizationId, userId } }, create: { ...data, organizationId, userId }, update: data });
  }
  private async validateUser(organizationId: string, userId?: string) {
    if (!userId) return;
    const membership = await prisma.membership.findFirst({ where: { userId, organizationId, status: 'ACTIVE' } });
    if (!membership) throw new NotFoundException('User is not an active member of this organization.');
  }
  async create(organizationId: string, dto: CustomerDto) {
    await this.validateUser(organizationId, dto.userId);
    try { return await prisma.customerProfile.create({ data: { ...dto, organizationId, dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined } }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Customer profile already exists in this organization.'); throw error; }
  }
  async list(organizationId: string, query: PaginationDto) {
    const where = { organizationId, ...(query.search ? { OR: [{ displayName: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }, { phone: { contains: query.search, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await prisma.$transaction([prisma.customerProfile.findMany({ where, orderBy: { displayName: 'asc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.customerProfile.count({ where })]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async get(organizationId: string, id: string) { const result = await prisma.customerProfile.findFirst({ where: { id, organizationId } }); if (!result) throw new NotFoundException('Customer not found.'); return result; }
  async getOwn(organizationId: string, userId: string) { const result = await prisma.customerProfile.findFirst({ where: { organizationId, userId } }); if (!result) throw new NotFoundException('Customer profile not found.'); return result; }
  async update(organizationId: string, id: string, dto: CustomerDto) { await this.get(organizationId, id); await this.validateUser(organizationId, dto.userId); return prisma.customerProfile.update({ where: { id }, data: { ...dto, dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined } }); }
  async setStatus(organizationId: string, id: string, status: 'ACTIVE' | 'INACTIVE') { await this.get(organizationId, id); return prisma.customerProfile.update({ where: { id }, data: { status } }); }
}
