# Milestone 10 — Booking lifecycle

Milestone 10 adds tenant-owned customer cancellation and rescheduling policy, customer and Admin lifecycle actions, assignment history, booking-number prefixes, notifications, audit coverage, and responsive workflow controls. It does not add fees, refunds, commission reversal, customer cancellation of leave, payment processing, waiting lists, or recurring bookings.

## Policy

Each organization has at most one `BookingPolicy`. Existing organizations are migrated with customer cancellation and rescheduling disabled. A null cutoff means no time-based cutoff. A zero cutoff permits the customer action until the booking start instant. The server blocks only when the remaining time is strictly less than the configured number of minutes. A null reschedule maximum is unlimited; zero permits no customer-initiated reschedules. Policy management is tenant-scoped and requires `organization.settings.manage`.

Customers may cancel or reschedule only their own `CONFIRMED` booking. Admin actions require `booking.cancel.all` or `booking.reschedule.all`, bypass customer policy limits, and are also limited to `CONFIRMED`. Cancellation preserves payment status, payment records, commission records, booking services, and immutable snapshots. No refund or commission adjustment is inferred.

## Rescheduling and capacity

Rescheduling keeps the existing Booking and BookingService rows. Sequential segments are rebuilt exclusively from immutable duration, buffer, staff-headcount, and resource-requirement snapshots. Validation uses organization opening hours, IANA timezone, active staff schedules, pending/approved leave, headcount reservations, and resource reservations. The current booking ID is excluded from overlap queries while other bookings continue to reserve capacity. The organization advisory transaction lock covers validation and persistence.

Staff skills remain advisory metadata. They do not become a hard availability condition.

## Assignment history

`BookingStaff` and `BookingResource` use `ACTIVE` or `INVALIDATED`. Manual replacement invalidates active rows with `REPLACED`; a reschedule invalidates only assignments that no longer satisfy schedule, status, tenant, required resource type, or overlap rules with `RESCHEDULE_CONFLICT`. Valid assignments remain active. PostgreSQL partial unique indexes prevent duplicate active assignments while allowing historical rows. Availability, commission eligibility, reporting, leave conflicts, and APIs explicitly use active assignments.

## History, numbering, notifications, and audit

Every successful cancellation or reschedule appends a `BookingChange` with tenant, booking, actor, initiator, optional reason, and previous/new schedule. Customer reschedule limits count only customer-initiated reschedule records.

`Organization.bookingNumberPrefix` defaults to `BK`, is normalized to uppercase, accepts 1–16 letters/digits/hyphens, and prefixes a UUID. Changes affect future bookings only.

Lifecycle notifications use the `BookingChange` ID as their event occurrence key. Delivery remains tenant/user scoped and includes only safe booking/change references. Audit metadata is allowlisted to request/change IDs, resulting status/schedule, reason-presence, and invalidated assignment IDs; free-text reasons are never copied into audit metadata.

The generic status endpoint cannot cancel a booking. Allowed operational transitions are `CONFIRMED -> CHECKED_IN`, `CONFIRMED -> NO_SHOW`, `CHECKED_IN -> IN_PROGRESS`, and `IN_PROGRESS -> COMPLETED`.
