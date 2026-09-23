import { readFile } from 'node:fs/promises';

export async function seedCore(prisma, slug, name) {
  await prisma.organization.upsert({ where: { slug }, update: {}, create: { slug, name } });
  const organization = await prisma.organization.findUniqueOrThrow({ where: { slug } });
  await prisma.bookingPolicy.upsert({ where: { organizationId: organization.id }, update: {}, create: { organizationId: organization.id } });
  const catalog = await readFile(new URL('../../../apps/api/src/authorization/permission-catalog.ts', import.meta.url), 'utf8');
  const keys = [...catalog.matchAll(/'([a-z_]+\.[a-z_.]+)'/g)].map((match) => match[1]);
  await Promise.all(keys.map((key) => prisma.permission.upsert({ where: { key }, update: {}, create: { key, module: key.split('.')[0], description: key } })));
  const all = await prisma.permission.findMany();
  const defaults = {
    Admin: all,
    Staff: all.filter((permission) => ['staff.read.own','staff.update.own','booking.read.assigned','booking.update.assigned','attendance.clock.own','attendance.read.own','leave.create.own','leave.read.own','leave.cancel.own','commission.read.own'].includes(permission.key)),
    Customer: all.filter((permission) => ['service.read','booking.create.own','booking.read.own','booking.cancel.own','booking.reschedule.own','customer.read.own','customer.update.own','payment.read.own'].includes(permission.key)),
  };
  const roles = {};
  for (const [roleName, selected] of Object.entries(defaults)) {
    const role = await prisma.role.upsert({ where: { organizationId_name: { organizationId: organization.id, name: roleName } }, update: { isSystemDefault: true }, create: { organizationId: organization.id, name: roleName, isSystemDefault: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: selected.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
    roles[roleName] = role;
  }
  await prisma.membership.updateMany({ where: { organizationId: organization.id, roleId: null, user: { email: { contains: '@example.test' } } }, data: { roleId: roles.Customer.id } });
  return { organization, roles, permissions: all };
}
