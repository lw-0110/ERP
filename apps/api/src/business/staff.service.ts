import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import type { PaginationDto, SkillDto, StaffDto } from './dto.js';

@Injectable()
export class StaffService {
  private async validateUser(organizationId: string, userId?: string) { if (!userId) return; if (!await prisma.membership.findFirst({ where: { userId, organizationId, status: 'ACTIVE' } })) throw new NotFoundException('User is not an active member of this organization.'); }
  async create(organizationId: string, dto: StaffDto) { await this.validateUser(organizationId, dto.userId); try { return await prisma.staffProfile.create({ data: { ...dto, organizationId, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Staff employee code or profile already exists in this organization.'); throw error; } }
  async list(organizationId: string, query: PaginationDto) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where = { organizationId, ...(query.search ? { OR: [{ displayName: { contains: query.search, mode: 'insensitive' as const } }, { employeeCode: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await prisma.$transaction([prisma.staffProfile.findMany({ where, include: { skills: { include: { skill: true } } }, orderBy: { displayName: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }), prisma.staffProfile.count({ where })]);
    const [memberships, invitations] = await Promise.all([
      prisma.membership.findMany({ where: { organizationId, userId: { in: items.flatMap((item) => item.userId ? [item.userId] : []) } }, select: { id: true, userId: true, roleId: true, role: { select: { name: true } } } }),
      prisma.staffInvitation.findMany({ where: { organizationId, staffProfileId: { in: items.map((item) => item.id) } }, select: { staffProfileId: true, roleId: true, role: { select: { name: true } }, status: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { items: items.map((item) => {
      const membership = memberships.find((entry) => entry.userId === item.userId);
      const invitation = invitations.find((entry) => entry.staffProfileId === item.id);
      const activeInvite = invitation?.status === 'ACTIVE' && invitation.expiresAt > new Date() ? invitation : null;
      const accountStatus = item.userId ? 'Account Active' : activeInvite ? 'Invitation Active' : invitation?.status === 'ACTIVE' || invitation?.status === 'EXPIRED' ? 'Invitation Expired' : invitation?.status === 'REVOKED' ? 'Invitation Revoked' : 'No Account';
      return { ...item, membershipId: membership?.id ?? null, roleId: membership?.roleId ?? activeInvite?.roleId ?? null, roleName: membership?.role?.name ?? activeInvite?.role?.name ?? null, accountStatus };
    }), total, page, pageSize };
  }
  async get(organizationId: string, id: string) { const result = await prisma.staffProfile.findFirst({ where: { id, organizationId }, include: { skills: { include: { skill: true } } } }); if (!result) throw new NotFoundException('Staff profile not found.'); return result; }
  async getOwn(organizationId: string, userId: string) { const result = await prisma.staffProfile.findFirst({ where: { organizationId, userId }, include: { skills: { include: { skill: true } } } }); if (!result) throw new NotFoundException('Staff profile not found.'); return result; }
  async update(organizationId: string, id: string, dto: StaffDto) { await this.get(organizationId, id); await this.validateUser(organizationId, dto.userId); return prisma.staffProfile.update({ where: { id }, data: { ...dto, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined } }); }
  async setStatus(organizationId: string, id: string, status: 'ACTIVE' | 'INACTIVE') { await this.get(organizationId, id); return prisma.staffProfile.update({ where: { id }, data: { status } }); }
  async createSkill(organizationId: string, dto: SkillDto) { try { return await prisma.skill.create({ data: { ...dto, organizationId } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Skill already exists in this organization.'); throw error; } }
  async listSkills(organizationId: string) { return prisma.skill.findMany({ where: { organizationId }, orderBy: { name: 'asc' }, take: 100 }); }
  async updateSkill(organizationId: string, id: string, dto: SkillDto) { const skill = await prisma.skill.findFirst({ where: { id, organizationId } }); if (!skill) throw new NotFoundException('Skill not found.'); return prisma.skill.update({ where: { id }, data: dto }); }
  async replaceSkills(organizationId: string, staffId: string, skillIds: string[]) { await this.get(organizationId, staffId); const unique = [...new Set(skillIds)]; const skills = await prisma.skill.findMany({ where: { id: { in: unique }, organizationId, status: 'ACTIVE' } }); if (skills.length !== unique.length) throw new NotFoundException('One or more skills are not active in this organization.'); return prisma.$transaction(async (tx) => { await tx.staffSkill.deleteMany({ where: { staffId } }); await tx.staffSkill.createMany({ data: unique.map((skillId) => ({ staffId, skillId })) }); return this.get(organizationId, staffId); }); }
}
