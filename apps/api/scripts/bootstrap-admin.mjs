import { seedCore } from '../../../packages/database/prisma/seed-core.mjs';
import { ensureUser, prisma } from './auth-runtime.mjs';

const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; };
if (process.env.BOOTSTRAP_CONFIRMED !== 'yes') throw new Error('Set BOOTSTRAP_CONFIRMED=yes for this one-time controlled operation.');
const slug = required('DEFAULT_ORGANIZATION_SLUG');
const organizationName = required('BOOTSTRAP_ORGANIZATION_NAME');
const email = required('BOOTSTRAP_ADMIN_EMAIL').trim().toLowerCase();
const name = required('BOOTSTRAP_ADMIN_NAME');
const password = required('BOOTSTRAP_ADMIN_PASSWORD');
if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.');
try {
  const seeded = await seedCore(prisma, slug, organizationName);
  const user = await ensureUser(email, name, password);
  await prisma.membership.upsert({ where: { userId_organizationId: { userId: user.id, organizationId: seeded.organization.id } }, update: { roleId: seeded.roles.Admin.id, status: 'ACTIVE' }, create: { userId: user.id, organizationId: seeded.organization.id, roleId: seeded.roles.Admin.id, status: 'ACTIVE' } });
  await prisma.auditLog.create({ data: { organizationId: seeded.organization.id, actorUserId: user.id, action: 'bootstrap.admin.completed', entityType: 'Membership', metadata: { organizationId: seeded.organization.id, userId: user.id } } });
  console.info(`Production bootstrap complete for organization ${seeded.organization.slug} and admin ${email}.`);
} finally { await prisma.$disconnect(); }
