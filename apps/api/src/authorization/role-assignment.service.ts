import { Injectable } from '@nestjs/common';
import { prisma } from '../auth/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../security/application-error.js';
import { SELF_MANAGEMENT_KEYS } from './role-management.service.js';

@Injectable()
export class RoleAssignmentService {
  async assign({ membershipId, roleId, organizationId, actorUserId }: { membershipId: string; roleId: string; organizationId: string; actorUserId?: string }) {
    const [membership, role] = await Promise.all([prisma.membership.findUnique({ where: { id: membershipId } }), prisma.role.findUnique({ where: { id: roleId } })]);
    if (!membership || membership.organizationId !== organizationId) throw notFound('MEMBERSHIP_NOT_FOUND');
    if (!role) throw notFound('ROLE_NOT_FOUND');
    if (role.organizationId !== organizationId) throw forbidden('ROLE_CROSS_TENANT');
    if (role.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
    if (actorUserId && membership.userId === actorUserId && membership.roleId !== role.id) {
      const [current, next] = await Promise.all([
        membership.roleId ? prisma.rolePermission.findMany({ where: { roleId: membership.roleId }, select: { permission: { select: { key: true } } } }) : Promise.resolve([]),
        prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permission: { select: { key: true } } } }),
      ]);
      const held = new Set(current.map(({ permission }) => permission.key));
      const target = new Set(next.map(({ permission }) => permission.key));
      if (SELF_MANAGEMENT_KEYS.some((key) => held.has(key) && !target.has(key))) throw conflict('ROLE_SELF_LOCKOUT');
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({ where: { id: membershipId }, data: { roleId: role.id } });
      await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'role.assigned', entityType: 'Membership', entityId: membershipId, metadata: { roleId } } });
      return updated;
    });
  }
}
