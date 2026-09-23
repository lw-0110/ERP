# V1 release checklist

## Code
- [ ] Prisma generate and validate pass
- [ ] Lint and typecheck pass
- [ ] Unit/integration/full tests pass
- [ ] Production build and browser smoke pass

## Database
- [ ] All migrations apply cleanly from zero
- [ ] Existing database reports up to date without reset
- [ ] Demo seed is idempotent in UAT and blocked in production
- [ ] Production bootstrap is guarded and verified
- [ ] Backup created and isolated restore read successfully

## Security
- [ ] Secrets are operator-provided and absent from repository/logs
- [ ] HTTPS, cookie, CORS, CSRF-origin, headers and rate limits verified
- [ ] Permission matrix and cross-tenant/own/assigned regressions pass
- [ ] Staff invitation token hash, expiry, one-time use and revocation pass
- [ ] CSV formula-injection regression passes

## Operations
- [ ] `/health/live` and `/health/ready` pass and expose safe version only
- [ ] Structured logs and request IDs visible
- [ ] Production environment validation fails safely when incomplete
- [ ] Migration, backup, restore, upgrade and recovery runbooks reviewed

## Business and UX
- [ ] Customer booking/cancel/reschedule journey passes UAT
- [ ] Staff assigned work/attendance/leave/commission journey passes UAT
- [ ] Admin operations, finance, reports, export, settings, notifications and audit pass UAT
- [ ] Desktop/tablet/mobile, loading/empty/error states and accessibility basics reviewed

## Release
- [ ] UAT results signed off with no severity-1/2 blocker
- [ ] Production Admin created through guarded bootstrap
- [ ] Post-deployment smoke tests pass
- [ ] Rollback owner and change window confirmed
