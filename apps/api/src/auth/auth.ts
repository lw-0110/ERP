import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma.js';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.WEB_URL ?? 'http://localhost:5173'],
  advanced: { database: { generateId: 'uuid' } },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const slug = process.env.DEFAULT_ORGANIZATION_SLUG;
          if (!slug) throw new Error('DEFAULT_ORGANIZATION_SLUG is required.');
          const organization = await prisma.organization.findUnique({ where: { slug } });
          if (!organization) throw new Error('Configured default organization does not exist.');
          const customerRole = await prisma.role.findFirst({
            where: { organizationId: organization.id, name: 'Customer', status: 'ACTIVE' },
            select: { id: true },
          });
          if (!customerRole) throw new Error('Configured organization has no active default Customer role.');
          await prisma.membership.upsert({
            where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
            update: { status: 'ACTIVE', roleId: customerRole.id },
            create: {
              userId: user.id,
              organizationId: organization.id,
              roleId: customerRole.id,
              status: 'ACTIVE',
            },
          });
        },
      },
    },
  },
});
