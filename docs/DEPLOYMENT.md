# V1 deployment and recovery

## Infrastructure

Use Node.js 22 or the supplied containers, PostgreSQL 17, and an HTTPS reverse proxy/hosting layer. The API and web origins must be stable HTTPS URLs. The production Compose file is a provider-neutral single-instance path, not an HA design.

## Configuration

Copy `.env.example` to an operator-managed `.env.production`; replace every development value and secret. Required production categories include `DATABASE_URL`, `NODE_ENV=production`, `API_PORT`, `BETTER_AUTH_SECRET`, HTTPS `BETTER_AUTH_URL`/`WEB_URL`, default organization slug, all rate limits, invitation TTL, and release version. Set `PUBLIC_API_URL` for the web image. Keep `DEMO_SEED_ENABLED=false`. Never store `.env.production` in source control.

## Initial deployment

1. Provision PostgreSQL and verify network/TLS policy.
2. Create and verify a pre-deployment custom-format backup.
3. Build immutable images with `docker compose -f docker-compose.production.yml build`.
4. Run `prisma migrate deploy` from the matching release image before starting new writers. Never use `migrate reset` in production.
5. Start API/web and verify `/health/live`, `/health/ready`, the safe version, HTTPS, headers, CORS, login and logs.
6. For a new installation, run the guarded bootstrap command with `BOOTSTRAP_CONFIRMED=yes`, organization/email/name variables, and a strong secret `BOOTSTRAP_ADMIN_PASSWORD`. The command uses Better Auth and assigns the seeded Admin role; it never prints the password.
7. The production Admin creates StaffProfiles and one-time Staff invitation URLs in the application. Normal Staff activation never requires shell access.

## Backup and restore rehearsal

Create a custom-format backup:

```powershell
pg_dump --format=custom --no-owner --no-acl --file platform.dump $env:DATABASE_URL
pg_restore --list platform.dump
```

Restore only into a separately named database, then set `DATABASE_URL` to that database and run `prisma migrate status`, a row-count sanity query, `/health/ready`, and release smoke tests. Never restore over the working database during rehearsal.

## Upgrade and rollback

Back up first, record the application/database release, deploy migrations, deploy the matching application, then smoke test. Prefer a forward corrective migration. If rollback requires an incompatible schema, stop writers and restore the verified pre-deployment backup together with the compatible application image. Preserve `_prisma_migrations`.

## Operations

Use JSON request logs and `X-Request-ID` for correlation. Poll `/health/live` for process liveness and `/health/ready` for database readiness. Configure external uptime/log monitoring at the hosting layer; a metrics stack is deferred.
