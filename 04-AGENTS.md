# 04-AGENTS.md
# Coding Agent Instructions

## 1. Mission

Build a reusable, secure, multi-tenant management platform.

The first implementation is Wellness / Massage Booking, but the core must remain reusable for other industries.

Priorities:

1. Correctness
2. Security
3. Maintainability
4. Reusability
5. Testability
6. Clear architecture
7. Scalability without premature complexity

## 2. Required Stack

Unless approved documentation changes it, use:

```text
TypeScript
React
Vite
Tailwind CSS
shadcn/ui
TanStack Query
NestJS
PostgreSQL
Prisma
Better Auth or approved equivalent
Zod
pnpm
Docker
Docker Compose
Vitest
Playwright
OpenAPI / Swagger
Git / GitHub
```

Architecture:

```text
Monorepo
+
Modular Monolith
```

Do not add microservices, Kubernetes, Kafka, or equivalent complexity without an explicit requirement.

## 3. Read Documentation Before Coding

Read:

```text
01-PROJECT-PLAN.md
02-REQUIREMENTS.md
03-DATABASE-AND-PERMISSIONS.md
04-AGENTS.md
```

If documentation conflicts:

1. Prefer the more specific approved requirement.
2. Prefer newer explicit business decisions.
3. Do not silently invent business rules.
4. Record unresolved conflicts before implementing irreversible behavior.

## 4. Work Milestone by Milestone

Do not generate the entire system in one pass.

Recommended order:

```text
1. Repository / Monorepo
2. Local Infrastructure
3. Database Foundation
4. Authentication
5. Organization / Membership
6. Roles / Permissions
7. Shared UI Shell
8. Locations
9. Customer
10. Staff
11. Services
12. Resources
13. Scheduling
14. Leave
15. Booking Availability
16. Booking
17. Staff Assignment
18. Resource Assignment
19. Attendance
20. Payment Status
21. Reports Foundation
22. Notifications
23. Security Hardening
24. E2E Testing
25. PWA
26. Deployment
```

A milestone is not complete until tests pass.

## 5. Core vs Industry-Specific

Before adding a feature, classify it:

```text
Core
or
Industry-Specific
```

Core examples:

- Authentication
- Authorization
- Organization
- Role
- Permission
- Customer
- Staff
- Location
- Service
- Resource
- Booking
- Scheduling
- Attendance
- Leave
- Notification
- Audit

Do not add wellness-only fields to generic core entities unless there is a strong reusable reason.

## 6. Never Hard-Code Normal Business Data

Do not hard-code:

```text
Room A
Room B
Branch names
Therapist names
Foot Massage
Service price
Opening hours
Cancellation limit
Admin email
```

These belong in configuration/database.

Adding a new room/resource must not require:

- Source-code changes
- Schema changes
- A new module
- Redeployment

## 7. Generic Resource Rule

Use:

```text
ResourceType
Resource
```

Example:

```text
ResourceType = Massage Room
Resource = VIP Room 01
```

Future industries should be able to use the same module.

## 8. Generic Role Rule

Avoid scattered checks like:

```typescript
if (role === "ADMIN") { ... }
```

Prefer permission checks.

Example:

```text
booking.assign_staff
resource.create
role.permission.manage
```

Roles are configurable collections of permissions.

## 9. Authentication Rule

Use one login system for all user categories.

Do not create separate auth systems for Admin, Staff, and Customer.

After login:

```text
User
↓
Membership
↓
Role
↓
Permissions
↓
Authorized UI/API
```

## 10. Authorization Rule

Frontend permission checks are UX only.

Backend must validate:

1. Authentication
2. Active organization
3. Membership or platform role
4. Permission
5. Ownership/assignment where required
6. Target entity belongs to correct organization

## 11. Tenant Isolation Is Mandatory

Every tenant-owned query must derive/validate organization scope.

Never trust `organization_id` directly from user input.

Cross-tenant data access is a critical security failure.

## 12. Platform IT Rule

Platform IT / Super Admin is separate from organization Admin.

Cross-organization support actions must:

- Require platform permission
- Be explicit
- Be audited
- Avoid accidental tenant data exposure

## 13. Approved Booking Rules

### Customer Booking

- Customer does not select a specific staff member.
- Booking is confirmed immediately if availability passes.
- No Admin approval is required.

### Staff Capacity

Only expose a slot if enough eligible staff capacity exists.

### Staff Assignment

Admin may assign specific staff after booking.

### Resource Assignment

Admin may assign room/resource after booking.

### Multiple Services

One Booking may contain multiple Services.

### Multiple Staff

One Booking may contain multiple staff assignments.

Do not simplify relationships to one-service or one-staff assumptions.

## 14. Booking Conflict Rule

Backend must prevent conflicts.

At minimum validate:

- Staff working schedule
- Pending leave
- Approved leave
- Existing bookings
- Required staff count
- Skills
- Branch hours
- Service duration
- Buffer time
- Resource conflicts when resource is assigned

Do not rely only on frontend checks.

Use transaction/locking strategy where needed to reduce race-condition double booking.

## 15. Approved Leave Rule

```text
Staff submits leave
↓
PENDING
↓
Immediately excluded from NEW booking availability
↓
Admin reviews
├── APPROVED → remains unavailable
└── REJECTED → available again
```

Do not change this rule without updated requirements.

## 16. Payment Rule

V1 stores payment status only.

Do not add Stripe, PayPal, FPX, or another gateway unless explicitly requested.

## 17. Commission Rule

Known:

- Commission depends on Service.
- Service has Price.
- Sample values may be used.

Unknown:

- Final production formula.

Therefore:

- Do not hard-code percentage-only logic.
- Do not hard-code fixed-only logic.
- Keep commission configuration extensible.
- Mark exact formula as TBD until confirmed.

## 18. Database Rules

Use Prisma migrations.

Do not manually change production schema outside the migration process.

Store snapshots for historical booking values where required.

Example:

```text
BookingService.unit_price_snapshot
```

Changing a Service price must not rewrite past booking totals.

## 19. Soft Delete / Archive Rule

Avoid destructive deletion for records referenced by history.

Prefer statuses such as:

```text
ACTIVE
INACTIVE
ARCHIVED
```

## 20. API Rules

Use REST API unless architecture docs explicitly change.

Requirements:

- Clear naming
- DTO/schema validation
- Consistent error format
- Pagination
- Filtering
- Sorting
- OpenAPI docs
- Authorization guards
- Tenant scoping

## 21. Validation Rule

Validate all untrusted input.

Examples:

- Required fields
- IDs
- Dates
- Time ranges
- Price
- Status values
- Pagination
- Search/filter inputs
- Uploaded files

Never trust frontend validation alone.

## 22. Security Rules

Do not:

- Store plaintext passwords
- Build custom cryptography
- Commit secrets
- Trust client role claims
- Trust tenant IDs from request body
- Skip backend authorization
- Build SQL strings from untrusted input
- Expose stack traces in production
- Allow unrestricted uploads

Must include:

- Proven auth/password handling
- Secure sessions
- Rate limiting
- Input validation
- CSRF protection where applicable
- XSS protection
- Security headers
- Tenant isolation
- Audit logs
- Least privilege

## 23. Environment Variables

Real secrets belong in `.env`.

Commit only `.env.example`.

Examples:

```text
DATABASE_URL
AUTH_SECRET
APP_URL
API_URL
```

## 24. Error Handling

Use centralized error handling.

User-facing errors must be clear but non-sensitive.

Do not expose:

- Secrets
- Tokens
- Database credentials
- Internal paths
- Production stack traces

## 25. Logging

Log useful operational and security events.

Do not log plaintext passwords, tokens, or secrets.

## 26. Testing Requirements

A feature is incomplete without appropriate tests.

Use:

- Unit tests
- Integration tests
- E2E tests

## 27. Mandatory Security Tests

Test at least:

```text
Customer cannot read another customer's booking
Customer cannot edit another customer's profile
Staff cannot access unauthorized bookings
Organization A cannot access Organization B data
Organization Admin cannot become Platform Super Admin
Direct API call is blocked even if frontend button is hidden
```

## 28. Mandatory Booking Tests

Test:

```text
Valid slot can be booked
Closed/invalid slot cannot be booked
Pending leave reduces availability
Approved leave reduces availability
Rejected leave restores availability
Insufficient staff capacity blocks slot
Multiple-service booking works
Multiple-staff assignment model works
Resource double assignment is blocked
```

## 29. Code Quality Rules

Use:

- Strict TypeScript where practical
- Small cohesive functions
- Clear naming
- Modular services
- Dependency injection
- Reusable components
- Consistent formatting/linting
- No unexplained magic values
- No duplicated business rules across layers

Avoid giant files/components.

## 30. Frontend Rules

Use reusable shared components where appropriate.

Support:

- Mobile
- Tablet
- Desktop

Handle:

- Loading
- Empty state
- Error state
- Permission denied
- Responsive navigation

## 31. Navigation Rule

Navigation should be permission-driven.

```text
Menu Item
↓
Required Permission
↓
Has Permission?
├── Yes → show
└── No  → hide
```

Backend still enforces authorization.

## 32. Admin Configuration Rule

Admin UI should manage common configuration:

- Locations
- Resources
- Resource Types
- Services
- Categories
- Staff
- Skills
- Roles
- Permissions
- Opening hours
- Closure dates
- Leave types
- Cancellation policy
- Reschedule policy

Ordinary business changes should not require a developer.

## 33. Performance Rules

Use when appropriate:

- Pagination
- Database indexes
- Avoid N+1 queries
- Query only required fields
- Lazy loading/code splitting
- Caching only where useful

Do not prematurely add complex infrastructure.

## 34. Scalability Rule

Start with a modular monolith.

Keep module boundaries clean so services can be extracted later if actual load requires it.

## 35. Git / Quality Gate

Before a milestone is complete, these must pass:

```text
lint
typecheck
tests
build
```

Keep commits focused and meaningful.

## 36. Documentation Rule

When changing:

- Architecture
- Database relationships
- Permissions
- Business rules
- API contracts

update documentation in the same change.

## 37. Definition of Done

A feature is complete only when:

- Requirement is implemented
- Tenant isolation is correct
- Permission checks exist
- Validation exists
- Error handling exists
- Tests exist
- Responsive UI exists if user-facing
- Migration exists if schema changed
- Documentation is updated
- No secrets are committed
- Lint/typecheck/tests/build pass

## 38. When a Requirement Is Missing

Do not invent important business behavior.

If a missing decision changes business behavior, mark it unresolved and wait for an explicit product decision before locking in irreversible logic.

Examples:

- Final commission formula
- Refund calculation
- Payroll
- Cancellation penalty
- Complex service sequencing
- Booking on behalf of another person

Purely technical decisions that do not alter business behavior may use a standard maintainable solution.

## 39. Current Explicit TBD

### Commission Formula

Do not finalize a permanent formula until explicitly defined.

Current implementation should support service-level commission configuration and sample values only.

## 40. Primary Principle

> Build the platform once. Configure or extend it for each industry.

A new customer should usually require configuration plus optional industry-specific modules, not a full rewrite.
