# V1 application security review

This is an application-level review, not a penetration test.

- Better Auth owns password hashing and HttpOnly session cookies. Production configuration requires a 32+ character secret and HTTPS auth/web origins.
- Unsafe cookie-authenticated requests require an approved Origin; credentialed CORS uses one configured origin; Helmet supplies response headers.
- Permission guards derive user, active membership, organization, active same-tenant role, and permissions server-side. Own/assigned/all routes apply ownership rules.
- Staff invitations use 256-bit random tokens and SHA-256 token hashes. Raw tokens exist only in the one-time Admin response and browser URL. Existing accounts must authenticate as the invited email before linking.
- Auth, booking/profile mutations, and invitation validation/redemption use configurable process-local rate limits. A distributed store remains deferred until horizontal scaling.
- Validation pipes reject non-allowlisted fields. UUID parsing is applied to exposed entity identifiers; Prisma errors and stacks are sanitized in production.
- Logs exclude headers, cookies and bodies. Audit and notification metadata contain only allowlisted safe IDs/statuses.
- CSV rendering prefixes formula-leading user strings without changing stored data.
- No file uploads, impersonation, cross-tenant support mutation, payment gateway, card storage, email, SMS, or WhatsApp exist in V1.

Operators must enforce TLS at the reverse proxy, restrict database/network access, rotate secrets, monitor structured logs/request IDs, and maintain tested backups.
