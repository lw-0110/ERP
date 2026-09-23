# Milestone 9 operations and security foundation

## Notifications

Notifications are in-app, tenant-owned, private to the recipient, newest-first, and paginated. `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, and `PATCH /notifications/read-all` derive both user and organization from the active session. No administrator bulk-read capability exists. Event keys prevent retry duplicates while a genuinely new state-change request has a distinct key. Metadata is limited to UUID references such as booking, booking-service, leave-request, or commission-record IDs.

Recipients follow the approved matrix: booking creation/status and payment-status changes notify a linked customer; staff assignments and commissions notify linked staff; leave submissions and conflicts notify active members whose active same-tenant role grants `leave.review`; leave decisions notify linked submitting staff. Missing linked users produce no notification. Email, SMS, WhatsApp, push delivery, and cross-tenant delivery are not implemented.

## Audit and application logging

`AuditLog` is append-only through the application: only list/detail read APIs exist, protected by `audit.read`, and no update/delete endpoint exists. State-changing Nest routes are captured after successful completion. Explicit event names cover bookings, assignment, attendance, leave, finance, settings, and schedules; other successful mutations use a generic resource/action name. Role assignment records transactionally in `RoleAssignmentService`. Better Auth sign-in/sign-up/sign-out attempts are recorded without credentials. Audit metadata uses an allowlist and never stores bodies, passwords, cookies, authorization headers, session tokens, finance notes, customer contact data, or stack traces. Authentication failures may be platform-level records with no actor or tenant because credentials are deliberately not inspected.

The request logger emits one JSON record containing timestamp, level, request ID, method, path, status and duration, plus server-resolved user/organization IDs when available. It never logs headers or request bodies. Operational log transport and retention remain deployment concerns.

## Errors, health, and HTTP security

Every Nest error response has `{ code, message, requestId }`; production/internal failures use a generic message and do not expose Prisma errors, paths, stack traces, or environment data. `X-Request-ID` correlates the response and structured log. Better Auth owns responses below `/api/auth/*` but still receives the request ID header.

`GET /health` and `/health/live` report process liveness plus the safe application version. `GET /health/ready` performs `SELECT 1` and returns readiness plus the same version. It does not expose credentials, migrations, or environment values. Migration status is an operator/deployment gate rather than a per-request health query.

Helmet supplies CSP, content-type protection, referrer policy, frame protection, and other standard headers. HSTS is enabled only in production. Credentialed CORS accepts the one explicitly configured frontend origin—never a wildcard. Better Auth continues to issue HttpOnly, SameSite=Lax cookies and uses Secure cookies with the approved HTTPS production base URL. Unsafe cookie-authenticated requests also require an allowed `Origin` in production. This origin check plus SameSite=Lax mitigates CSRF for the current first-party browser architecture; a token system should be reconsidered before allowing cross-site clients.

Rate limiting is process-local and focused on auth credential endpoints, booking creation, customer profile completion, and notification mutations. Development fallbacks are intentionally permissive. Production must explicitly supply `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX`, and `RATE_LIMIT_MUTATION_MAX`; values are chosen by operators based on deployment needs. A shared store is deferred until horizontal API deployment requires it.

Production startup requires `DATABASE_URL`, a 32+ character `BETTER_AUTH_SECRET`, HTTPS `BETTER_AUTH_URL` and `WEB_URL`, `DEFAULT_ORGANIZATION_SLUG`, the Staff invitation TTL, and all rate-limit settings (including invitation validation/redemption). Validation fails without printing values. Platform-wide cross-organization support/impersonation is deferred because no safe platform-role model is implemented; ordinary tenant roles cannot cross organization boundaries.

## PostgreSQL backup, restore, and migration operations

Operators should set backup frequency and retention based on business recovery objectives; the application performs no automatic deletion of notifications, audit records, or logs. Retention remains configurable/TBD.

Example backup using operator-supplied environment configuration:

```powershell
pg_dump --format=custom --no-owner --no-acl --file platform.dump $env:DATABASE_URL
pg_restore --list platform.dump
```

Test restoration in an isolated database before relying on a backup:

```powershell
createdb platform_restore_test
pg_restore --no-owner --no-acl --dbname platform_restore_test platform.dump
```

For production migrations: verify a recent restorable off-site backup, stop incompatible writers if the migration requires it, deploy the same application artifact and migration set, run `prisma migrate deploy`, then run `prisma validate` and readiness/smoke checks. Never run `prisma migrate reset` in production. Prisma migrations are forward-oriented; recovery means correcting forward when safe or restoring the verified pre-migration backup and compatible application release. Preserve the migration table with the database backup.

## Authorization review and deferrals

All new tenant queries use the active membership organization; notification ownership adds the active user. Audit filters cannot accept an organization ID. Existing permission guards continue to resolve active same-organization roles and `RolePermission` rows rather than role names. The identity response now suppresses cross-tenant assigned-role data as well as its permissions. Regression tests cover notification ownership, audit authorization/tenant scope, safe errors, health, and production configuration.

Deferred: external notification providers, background delivery/retries, automatic retention, distributed rate limiting, full platform-super-admin operations, tenant impersonation, observability vendor integration, and custom backup automation.
