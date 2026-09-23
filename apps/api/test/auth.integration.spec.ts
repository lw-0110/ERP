import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
process.env.DATABASE_URL = 'postgresql://platform:platform@localhost:5432/platform?schema=public';
process.env.BETTER_AUTH_SECRET = '12345678901234567890123456789012';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:0';
process.env.WEB_URL = 'http://localhost:5173';
process.env.DEFAULT_ORGANIZATION_SLUG = 'development';
const { createApp } = await import('../src/app.factory.js');
const { prisma } = await import('../src/auth/prisma.js');
let url = '';
let cookie = '';
let email = '';
let app: INestApplication | undefined;
beforeAll(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  url = await app.getUrl();
});
afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'itest-' } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  if (ids.length) {
    await prisma.membership.deleteMany({ where: { userId: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.account.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.role.deleteMany({ where: { name: { startsWith: 'itest-' } } });
  await app?.close();
  await prisma.$disconnect();
});
describe('Better Auth HTTP lifecycle', () => {
  it('registers, links membership, evaluates permissions, and logs out', async () => {
    email = `itest-${randomUUID()}@example.test`;
    const r = await fetch(`${url}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Integration', email, password: 'StrongPassw0rd!' }),
    });
    expect(r.ok).toBe(true);
    cookie = r.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect((await fetch(`${url}/_authorization-probe`)).status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { memberships: { include: { organization: true } } },
    });
    const membership = user.memberships[0];
    const defaultRole = await prisma.role.findUniqueOrThrow({ where: { id: membership.roleId! } });
    expect(defaultRole.name).toBe('Customer');
    expect((await fetch(`${url}/_authorization-probe`, { headers: { cookie } })).status).toBe(403);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'role.read' } });
    const role = await prisma.role.create({
      data: { organizationId: membership.organizationId, name: `itest-${randomUUID()}` },
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.membership.update({ where: { id: membership.id }, data: { roleId: role.id } });
    expect((await fetch(`${url}/_authorization-probe`, { headers: { cookie } })).status).toBe(200);
    await prisma.role.update({ where: { id: role.id }, data: { status: 'ARCHIVED' } });
    const me = await (await fetch(`${url}/identity/me`, { headers: { cookie } })).json();
    expect(me.role).toBeNull();
    expect(me.permissions).toEqual([]);
    expect((await fetch(`${url}/_authorization-probe`, { headers: { cookie } })).status).toBe(403);
    await fetch(`${url}/api/auth/sign-out`, { method: 'POST', headers: { cookie } });
    expect((await fetch(`${url}/identity/me`, { headers: { cookie } })).status).toBe(401);
  });
  it('rejects unauthenticated, duplicate and wrong-password requests', async () => {
    expect((await fetch(`${url}/identity/me`)).status).toBe(401);
    const dup = await fetch(`${url}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', email, password: 'StrongPassw0rd!' }),
    });
    expect(dup.ok).toBe(false);
    const bad = await fetch(`${url}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    expect(bad.ok).toBe(false);
  });
});
