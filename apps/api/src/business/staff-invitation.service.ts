import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import { auth } from '../auth/auth.js';
import { prisma } from '../auth/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../security/application-error.js';
import type { StaffDto } from './dto.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function publicInvitation<T extends { tokenHash: string; status: string; expiresAt: Date }>(invitation: T) {
  const { tokenHash: _tokenHash, ...safe } = invitation;
  void _tokenHash;
  const status = invitation.status === 'ACTIVE' && invitation.expiresAt <= new Date()
    ? ('EXPIRED' as const)
    : invitation.status;
  return { ...safe, status };
}

@Injectable()
export class StaffInvitationService {
  private invitationUrl(token: string) {
    const base = process.env.WEB_URL ?? 'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/staff-invitation?token=${encodeURIComponent(token)}`;
  }

  async createStaffAndInvite(organizationId: string, dto: StaffDto, roleId: string, actorUserId: string) {
    if (!dto.email?.trim()) throw badRequest('STAFF_EMAIL_REQUIRED');
    if (!roleId) throw badRequest('STAFF_ROLE_REQUIRED');
    const rawToken = randomBytes(32).toString('base64url');
    const ttlHours = Number(process.env.STAFF_INVITATION_TTL_HOURS ?? 72);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    try {
      const { staff, invitation } = await prisma.$transaction(async (tx) => {
        const role = await tx.role.findUnique({ where: { id: roleId }, select: { organizationId: true, status: true } });
        if (!role) throw notFound('ROLE_NOT_FOUND');
        if (role.organizationId !== organizationId) throw forbidden('ROLE_CROSS_TENANT');
        if (role.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
        const staff = await tx.staffProfile.create({ data: { ...dto, organizationId, hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined } });
        const invitation = await tx.staffInvitation.create({ data: { organizationId, staffProfileId: staff.id, roleId, email: staff.email.trim().toLowerCase(), tokenHash: hashToken(rawToken), expiresAt, createdByUserId: actorUserId } });
        await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'staff.invitation.created', entityType: 'StaffInvitation', entityId: invitation.id, metadata: { staffProfileId: staff.id, roleId, status: 'ACTIVE' } } });
        return { staff, invitation };
      });
      return { staff, invitation: publicInvitation(invitation), invitationUrl: this.invitationUrl(rawToken) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('BUSINESS_DUPLICATE');
      throw error;
    }
  }

  async create(organizationId: string, staffProfileId: string, roleId: string, actorUserId: string) {
    if (!roleId) throw badRequest('STAFF_ROLE_REQUIRED');
    const staff = await prisma.staffProfile.findFirst({
      where: { id: staffProfileId, organizationId, status: 'ACTIVE' },
    });
    if (!staff) throw new NotFoundException('Active staff profile not found.');
    if (staff.userId) throw conflict('STAFF_ACCOUNT_ALREADY_LINKED');
    if (!staff.email.trim()) throw badRequest('STAFF_EMAIL_REQUIRED');

    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, organizationId: true, status: true } });
    if (!role) throw notFound('ROLE_NOT_FOUND');
    if (role.organizationId !== organizationId) throw forbidden('ROLE_CROSS_TENANT');
    if (role.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');

    const ttlHours = Number(process.env.STAFF_INVITATION_TTL_HOURS ?? 72);
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const invitation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${staffProfileId}))) AS held`;
      const [currentStaff, currentRole] = await Promise.all([
        tx.staffProfile.findUnique({ where: { id: staffProfileId } }),
        tx.role.findUnique({ where: { id: role.id } }),
      ]);
      if (!currentStaff || currentStaff.organizationId !== organizationId || currentStaff.status !== 'ACTIVE' || currentStaff.userId) throw conflict('STAFF_ACCOUNT_ALREADY_LINKED');
      if (!currentRole || currentRole.organizationId !== organizationId || currentRole.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
      await tx.staffInvitation.updateMany({
        where: { organizationId, staffProfileId, status: 'ACTIVE', expiresAt: { lte: new Date() } },
        data: { status: 'EXPIRED' },
      });
      await tx.staffInvitation.updateMany({
        where: { organizationId, staffProfileId, status: 'ACTIVE', roleId: null },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      if (await tx.staffInvitation.count({ where: { organizationId, staffProfileId, status: 'ACTIVE' } })) throw conflict('INVITE_ALREADY_ACTIVE');
      const created = await tx.staffInvitation.create({
        data: {
          organizationId,
          staffProfileId,
          roleId: role.id,
          email: currentStaff.email.trim().toLowerCase(),
          tokenHash: hashToken(rawToken),
          expiresAt,
          createdByUserId: actorUserId,
        },
      });
      await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'staff.invitation.created', entityType: 'StaffInvitation', entityId: created.id, metadata: { staffProfileId, roleId: role.id, status: 'ACTIVE' } } });
      return created;
    });
    return {
      id: invitation.id,
      invitation: publicInvitation(invitation),
      invitationUrl: this.invitationUrl(rawToken),
    };
  }

  async list(organizationId: string, staffProfileId: string) {
    const staff = await prisma.staffProfile.findFirst({
      where: { id: staffProfileId, organizationId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Staff profile not found.');
    const invitations = await prisma.staffInvitation.findMany({
      where: { organizationId, staffProfileId },
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return invitations.map(publicInvitation);
  }

  async revoke(organizationId: string, staffProfileId: string, id: string) {
    const invitation = await prisma.staffInvitation.findFirst({
      where: { id, organizationId, staffProfileId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    if (invitation.status !== 'ACTIVE' || invitation.expiresAt <= new Date())
      throw new BadRequestException('Only an active, unexpired invitation can be revoked.');
    const changedCount = await prisma.staffInvitation.updateMany({ where: { id, organizationId, staffProfileId, status: 'ACTIVE', expiresAt: { gt: new Date() } }, data: { status: 'REVOKED', revokedAt: new Date() } });
    if (changedCount.count !== 1) throw new BadRequestException('Only an active, unexpired invitation can be revoked.');
    const changed = await prisma.staffInvitation.findUniqueOrThrow({ where: { id } });
    return publicInvitation(changed);
  }

  async validate(token: string) {
    const invitation = await prisma.staffInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { staffProfile: { select: { displayName: true, status: true, userId: true } } },
    });
    if (!invitation) throw badRequest('INVITE_INVALID');
    if (invitation.status === 'USED') throw badRequest('INVITE_USED');
    if (invitation.status === 'REVOKED') throw badRequest('INVITE_REVOKED');
    if (invitation.expiresAt <= new Date()) throw badRequest('INVITE_EXPIRED');
    if (invitation.status !== 'ACTIVE') throw badRequest('INVITE_INVALID');
    if (invitation.staffProfile.status !== 'ACTIVE' || invitation.staffProfile.userId)
      throw new BadRequestException('Invitation is invalid or no longer available.');
    const role = invitation.roleId ? await prisma.role.findUnique({ where: { id: invitation.roleId } }) : null;
    if (!role || role.organizationId !== invitation.organizationId || role.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
    const existing = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    return {
      valid: true,
      invitationId: invitation.id,
      staffDisplayName: invitation.staffProfile.displayName,
      maskedEmail: invitation.email.replace(/^(.).+(@.+)$/, '$1***$2'),
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      existingAccount: Boolean(existing),
      roleName: role.name,
    };
  }

  async redeem(
    token: string,
    name: string | undefined,
    password: string | undefined,
    headers: IncomingHttpHeaders,
  ) {
    const tokenHash = hashToken(token);
    const invitation = await prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: { staffProfile: true, organization: true },
    });
    if (!invitation) throw badRequest('INVITE_INVALID');
    if (invitation.status === 'USED') throw badRequest('INVITE_USED');
    if (invitation.status === 'REVOKED') throw badRequest('INVITE_REVOKED');
    if (invitation.expiresAt <= new Date()) throw badRequest('INVITE_EXPIRED');
    if (invitation.status !== 'ACTIVE') throw badRequest('INVITE_INVALID');
    if (
      invitation.staffProfile.status !== 'ACTIVE' ||
      invitation.staffProfile.userId ||
      invitation.staffProfile.organizationId !== invitation.organizationId ||
      invitation.staffProfile.email.trim().toLowerCase() !== invitation.email
    )
      throw new BadRequestException('Invitation is invalid or no longer available.');
    if (invitation.organization.status !== 'ACTIVE')
      throw new ForbiddenException('Organization is not active.');

    const intendedRole = invitation.roleId ? await prisma.role.findUnique({ where: { id: invitation.roleId } }) : null;
    if (!intendedRole || intendedRole.organizationId !== invitation.organizationId || intendedRole.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');

    let user = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (user) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      if (!session || session.user.id !== user.id)
        throw new UnauthorizedException('Sign in to the invited account before accepting this invitation.');
      if (user.status !== 'ACTIVE') throw new ForbiddenException('Account is not active.');
    } else {
      if (!name?.trim() || !password)
        throw new BadRequestException('Name and password are required for a new account.');
      await auth.api.signUpEmail({
        body: { email: invitation.email, name: name.trim(), password },
        headers: new Headers({ origin: process.env.WEB_URL ?? 'http://localhost:5173' }),
      });
      user = await prisma.user.findUnique({ where: { email: invitation.email } });
      if (!user) throw new ConflictException('Account activation could not be completed.');
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${invitation.staffProfileId}))) AS held`;
      await tx.$queryRaw`SELECT id FROM staff_invitations WHERE id = ${invitation.id}::uuid FOR UPDATE`;
      const current = await tx.staffInvitation.findUnique({ where: { id: invitation.id } });
      if (!current) throw badRequest('INVITE_INVALID');
      if (current.status === 'USED') throw badRequest('INVITE_USED');
      if (current.status === 'REVOKED') throw badRequest('INVITE_REVOKED');
      if (current.expiresAt <= now) throw badRequest('INVITE_EXPIRED');
      if (current.status !== 'ACTIVE') throw badRequest('INVITE_INVALID');
      const [currentStaff, currentRole] = await Promise.all([
        tx.staffProfile.findUnique({ where: { id: invitation.staffProfileId } }),
        tx.role.findUnique({ where: { id: intendedRole.id } }),
      ]);
      if (!currentStaff || currentStaff.organizationId !== invitation.organizationId || currentStaff.userId || currentStaff.email.trim().toLowerCase() !== invitation.email) throw conflict('STAFF_ACCOUNT_ALREADY_LINKED');
      if (!currentRole || currentRole.organizationId !== invitation.organizationId || currentRole.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
      const conflictingProfile = await tx.staffProfile.findFirst({
        where: {
          organizationId: invitation.organizationId,
          userId: user.id,
          NOT: { id: invitation.staffProfileId },
        },
        select: { id: true },
      });
      if (conflictingProfile) throw new ConflictException('This account is already linked to another staff profile.');
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
        update: { roleId: intendedRole.id, status: 'ACTIVE' },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          roleId: intendedRole.id,
          status: 'ACTIVE',
        },
      });
      await tx.staffProfile.update({
        where: { id: invitation.staffProfileId },
        data: { userId: user.id },
      });
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: 'USED', usedAt: now, redeemedByUserId: user.id },
      });
      await tx.staffInvitation.updateMany({
        where: {
          organizationId: invitation.organizationId,
          staffProfileId: invitation.staffProfileId,
          status: 'ACTIVE',
          NOT: { id: invitation.id },
        },
        data: { status: 'REVOKED', revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          action: 'staff.invitation.redeemed',
          entityType: 'StaffInvitation',
          entityId: invitation.id,
          metadata: { invitationId: invitation.id, staffProfileId: invitation.staffProfileId, roleId: intendedRole.id },
        },
      });
    });
    return { activated: true, staffProfileId: invitation.staffProfileId };
  }
}
