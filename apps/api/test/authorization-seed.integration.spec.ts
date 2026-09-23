import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { PERMISSIONS } from '../src/authorization/permission-catalog.js';

process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
process.env.DEFAULT_ORGANIZATION_SLUG = 'development';
process.env.DEVELOPMENT_ORGANIZATION_NAME = 'Development Organization';

const { prisma } = await import('../src/auth/prisma.js');
const runCommand = promisify(execFile);
const seedPath = fileURLToPath(
  new URL('../../../packages/database/prisma/seed.mjs', import.meta.url),
);
const developmentOrganizationSlug = process.env.DEFAULT_ORGANIZATION_SLUG;
const staffPermissionKeys = [
  'staff.read.own',
  'staff.update.own',
  'booking.read.assigned',
  'booking.update.assigned',
  'attendance.clock.own',
  'attendance.read.own',
  'leave.create.own',
  'leave.read.own',
  'leave.cancel.own',
  'commission.read.own',
];
const customerPermissionKeys = [
  'service.read',
  'booking.create.own',
  'booking.read.own',
  'booking.cancel.own',
  'booking.reschedule.own',
  'customer.read.own',
  'customer.update.own',
  'payment.read.own',
];
const defaultRoleNames = ['Admin', 'Staff', 'Customer'];

let sentinelUserId = '';
let sentinelMembershipId = '';

async function runSeed(): Promise<void> {
  await runCommand(process.execPath, [seedPath], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      DEFAULT_ORGANIZATION_SLUG: developmentOrganizationSlug,
      DEVELOPMENT_ORGANIZATION_NAME: process.env.DEVELOPMENT_ORGANIZATION_NAME,
    },
  });
}

function sorted(keys: Iterable<string>): string[] {
  return [...keys].sort();
}

async function rolePermissionKeys(organizationId: string, name: string): Promise<string[]> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { organizationId_name: { organizationId, name } },
    include: { permissions: { include: { permission: true } } },
  });

  return sorted(role.permissions.map(({ permission }) => permission.key));
}

async function defaultSeedState(organizationId: string) {
  const roles = await prisma.role.findMany({
    where: { organizationId, name: { in: defaultRoleNames } },
    include: { permissions: { select: { permissionId: true } } },
    orderBy: { name: 'asc' },
  });
  const roleIds = roles.map(({ id }) => id);

  return {
    developmentOrganizationCount: await prisma.organization.count({
      where: { slug: developmentOrganizationSlug },
    }),
    permissionCount: await prisma.permission.count(),
    defaultRoleCount: roles.length,
    rolePermissionCount: await prisma.rolePermission.count({
      where: { roleId: { in: roleIds } },
    }),
    roles: roles.map(({ name, permissions }) => ({
      name,
      permissionIds: sorted(permissions.map(({ permissionId }) => permissionId)),
    })),
  };
}

beforeAll(async () => {
  await runSeed();

  const developmentOrganization = await prisma.organization.findUniqueOrThrow({
    where: { slug: developmentOrganizationSlug },
  });
  const tag = `seed-sentinel-${randomUUID()}`;
  const user = await prisma.user.create({
    data: { name: tag, email: `${tag}@seed.invalid` },
  });
  const membership = await prisma.membership.create({
    data: { userId: user.id, organizationId: developmentOrganization.id },
  });

  sentinelUserId = user.id;
  sentinelMembershipId = membership.id;
});

afterAll(async () => {
  if (sentinelMembershipId) {
    await prisma.membership.deleteMany({ where: { id: sentinelMembershipId } });
  }
  if (sentinelUserId) {
    await prisma.session.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.account.deleteMany({ where: { userId: sentinelUserId } });
    await prisma.user.deleteMany({ where: { id: sentinelUserId } });
  }
  await prisma.$disconnect();
});

describe('authorization seed', () => {
  it('seeds every platform-defined permission exactly once', async () => {
    const permissions = await prisma.permission.findMany({ select: { key: true } });
    const seededKeys = permissions.map(({ key }) => key);

    expect(sorted(seededKeys)).toEqual(sorted(PERMISSIONS));
    expect(new Set(seededKeys).size).toBe(seededKeys.length);
  });

  it('seeds the approved default permission sets', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: developmentOrganizationSlug },
    });

    await expect(rolePermissionKeys(organization.id, 'Admin')).resolves.toEqual(
      sorted(PERMISSIONS),
    );
    await expect(rolePermissionKeys(organization.id, 'Staff')).resolves.toEqual(
      sorted(staffPermissionKeys),
    );
    await expect(rolePermissionKeys(organization.id, 'Customer')).resolves.toEqual(
      sorted(customerPermissionKeys),
    );
  });

  it('is idempotent and leaves unrelated null-role memberships unchanged', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: developmentOrganizationSlug },
    });
    const before = await defaultSeedState(organization.id);
    const sentinelBefore = await prisma.membership.findUniqueOrThrow({
      where: { id: sentinelMembershipId },
      select: { roleId: true, updatedAt: true },
    });

    await runSeed();
    await runSeed();

    const after = await defaultSeedState(organization.id);
    const sentinelAfter = await prisma.membership.findUniqueOrThrow({
      where: { id: sentinelMembershipId },
      select: { roleId: true, updatedAt: true },
    });

    expect(after).toEqual(before);
    expect(sentinelAfter.roleId).toBeNull();
    expect(sentinelAfter.updatedAt).toEqual(sentinelBefore.updatedAt);
    expect(await prisma.organization.count({ where: { slug: developmentOrganizationSlug } })).toBe(
      1,
    );
  });
});
