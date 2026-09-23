# Architecture

The platform is a TypeScript pnpm monorepo and NestJS modular monolith. `apps/web` is the responsive React/PWA client; `apps/api` is the REST API; `packages/database` owns Prisma schema and generated client; shared non-business contracts live in `packages/contracts`.

The PWA layer is deliberately minimal: manifest, installable icon, and same-origin static-shell caching only. API/auth traffic is never cached by the service worker. Production has separate multi-stage API and static-web images plus a provider-neutral Compose path.

V1 is deployed for one organization, but tenant-owned future entities will carry `organization_id` and APIs will derive organization scope server-side. Platform support must be explicit and audited. No microservices or desktop wrapper are included.

Customer registration receives the active seeded Customer role immediately. Staff profiles may remain unlinked; normal activation uses an Admin-created, tenant-scoped, hashed, expiring, single-use invitation. The guarded operator command exists only for first Admin bootstrap/recovery.
