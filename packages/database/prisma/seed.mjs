import { PrismaClient } from '@prisma/client';
import { seedCore } from './seed-core.mjs';
const slug = process.env.DEFAULT_ORGANIZATION_SLUG;
const name = process.env.DEVELOPMENT_ORGANIZATION_NAME;
if (!slug || !name) throw new Error('DEFAULT_ORGANIZATION_SLUG and DEVELOPMENT_ORGANIZATION_NAME are required.');
const prisma = new PrismaClient();
try { await seedCore(prisma, slug, name); }
finally { await prisma.$disconnect(); }
