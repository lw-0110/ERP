# Security baseline

The platform validates environment configuration, exposes safe liveness/readiness endpoints, assigns request IDs, sanitizes errors, emits redacted structured request logs, applies configurable rate limits, and keeps secrets out of source control. Tenant authorization, private notifications, and append-only application audit behavior are documented in `MILESTONE-9-OPERATIONS.md`.

Milestone 11 adds hashed one-time Staff invitations, guarded production bootstrap/demo operations, CSV formula-injection regression coverage, consistent UUID boundary validation, and production Docker/deployment guidance. See `V1-SECURITY-REVIEW.md`.
