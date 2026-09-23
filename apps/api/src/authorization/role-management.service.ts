import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { prisma } from '../auth/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../security/application-error.js';
import { PERMISSIONS } from './permission-catalog.js';

export const SELF_MANAGEMENT_KEYS = ['role.read', 'role.update', 'role.permission.manage'] as const;

@Injectable()
export class RoleManagementService {
  permissions() {
    return prisma.permission.findMany({ where: { key: { in: [...PERMISSIONS] } }, select: { id: true, key: true, module: true, description: true }, orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  }

  roles(organizationId: string) {
    return prisma.role.findMany({ where: { organizationId }, include: { permissions: { include: { permission: { select: { key: true } } } }, _count: { select: { memberships: true } } }, orderBy: { name: 'asc' } }).then((roles) => roles.map(({ permissions, _count, ...role }) => ({ ...role, permissionKeys: permissions.map(({ permission }) => permission.key), permissionCount: permissions.length, memberCount: _count.memberships })));
  }

  memberships(organizationId: string) {
    return prisma.membership.findMany({ where: { organizationId }, select: { id: true, userId: true, roleId: true, status: true, joinedAt: true, user: { select: { name: true, email: true } }, role: { select: { name: true, status: true } } }, orderBy: { joinedAt: 'asc' } });
  }

  private async validPermissions(keys: string[]) {
    if (new Set(keys).size !== keys.length || keys.some((key) => !(PERMISSIONS as readonly string[]).includes(key))) throw badRequest('PERMISSION_INVALID');
    const found = await prisma.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
    if (found.length !== keys.length) throw badRequest('PERMISSION_INVALID');
    return found;
  }

  private async role(organizationId: string, id: string) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw notFound('ROLE_NOT_FOUND');
    if (role.organizationId !== organizationId) throw forbidden('ROLE_CROSS_TENANT');
    return role;
  }

  private async protectSelf(organizationId: string, actorUserId: string, roleId: string, nextKeys: string[]) {
    const own = await prisma.membership.findFirst({ where: { organizationId, userId: actorUserId, status: 'ACTIVE', roleId } });
    if (!own) return;
    const current = await prisma.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { key: true } } } });
    const held = new Set(current.map(({ permission }) => permission.key));
    if (SELF_MANAGEMENT_KEYS.some((key) => held.has(key) && !nextKeys.includes(key))) throw conflict('ROLE_SELF_LOCKOUT');
  }

  async create(organizationId: string, actorUserId: string, input: { name: string; description?: string; permissionKeys: string[] }) {
    const name = input.name.trim();
    if (!name) throw badRequest('VALIDATION_INVALID_REQUEST');
    const permissions = await this.validPermissions(input.permissionKeys);
    try {
      return await prisma.$transaction(async (tx) => {
        const role = await tx.role.create({ data: { organizationId, name, description: input.description?.trim() || null } });
        if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
        await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'role.created', entityType: 'Role', entityId: role.id, metadata: { permissionCount: permissions.length } } });
        return role;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('ROLE_NAME_DUPLICATE');
      throw error;
    }
  }

  async update(organizationId: string, actorUserId: string, id: string, input: { name: string; description?: string; permissionKeys: string[] }, canManagePermissions: boolean) {
    const existing = await this.role(organizationId, id);
    if (existing.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
    const name = input.name.trim();
    if (!name) throw badRequest('VALIDATION_INVALID_REQUEST');
    const permissions = await this.validPermissions(input.permissionKeys);
    const before = await prisma.rolePermission.findMany({ where: { roleId: id }, select: { permission: { select: { key: true } } } });
    const oldKeys = before.map(({ permission }) => permission.key);
    const changed = oldKeys.length !== input.permissionKeys.length || oldKeys.some((key) => !input.permissionKeys.includes(key));
    if (changed && !canManagePermissions) throw forbidden('AUTH_ACCESS_DENIED');
    await this.protectSelf(organizationId, actorUserId, id, input.permissionKeys);
    try {
      return await prisma.$transaction(async (tx) => {
        const role = await tx.role.update({ where: { id }, data: { name, description: input.description?.trim() || null } });
        if (changed) {
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          if (permissions.length) await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: id, permissionId: permission.id })) });
        }
        await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'role.updated', entityType: 'Role', entityId: id, metadata: { permissionCount: permissions.length } } });
        if (changed) await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'role.permissions.changed', entityType: 'Role', entityId: id, metadata: { permissionCount: permissions.length } } });
        return role;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('ROLE_NAME_DUPLICATE');
      throw error;
    }
  }

  async archive(organizationId: string, actorUserId: string, id: string) {
    const role = await this.role(organizationId, id);
    if (role.status !== 'ACTIVE') throw badRequest('ROLE_INACTIVE');
    if (await prisma.membership.count({ where: { roleId: id, organizationId, userId: actorUserId, status: 'ACTIVE' } })) throw conflict('ROLE_SELF_LOCKOUT');
    if (await prisma.membership.count({ where: { roleId: id, organizationId } })) throw conflict('ROLE_IN_USE');
    return prisma.$transaction(async (tx) => {
      const archived = await tx.role.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await tx.auditLog.create({ data: { organizationId, actorUserId, action: 'role.archived', entityType: 'Role', entityId: id, metadata: {} } });
      return archived;
    });
  }
}
