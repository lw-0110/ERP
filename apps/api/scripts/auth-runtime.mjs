import { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

export const prisma = new PrismaClient();
export const operationalAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  trustedOrigins: [process.env.WEB_URL ?? 'http://localhost:5173'],
  advanced: { database: { generateId: 'uuid' } },
});

export async function ensureUser(email, name, password) {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) return existing;
  await operationalAuth.api.signUpEmail({ body: { email: normalized, name, password }, headers: new Headers({ origin: process.env.WEB_URL ?? 'http://localhost:5173' }) });
  return prisma.user.findUniqueOrThrow({ where: { email: normalized } });
}
