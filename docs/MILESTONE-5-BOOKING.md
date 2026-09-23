# Milestone 5 booking foundation

## Historical snapshots and sequencing

Each `BookingService` stores integer minor-unit price, ISO currency, duration, both buffers, staff headcount, skill IDs, skill counts, and resource-type counts when the booking is confirmed. Skill IDs are a UUID array. Skill and resource counts are JSON arrays of `{skillId, requiredCount}` and `{resourceTypeId, requiredCount}` respectively. The API validates UUIDs, unique IDs, and positive integer counts before reading persisted JSON. There is no endpoint for editing a booking-service snapshot.

Lines execute in ascending `sortOrder`. A line reserves `quantity × (durationMinutesSnapshot + bufferBeforeMinutesSnapshot + bufferAfterMinutesSnapshot)`. The next line starts when the preceding line ends. Every duration or requirement calculation for an existing booking reads these immutable snapshots; edits to the Service catalog do not change a confirmed booking.

## Availability and assignment

All reservation windows use half-open intervals: `a.start < b.end && b.start < a.end`. Organization opening hours and each active staff member's weekly schedule must cover the full requested segment in the organization's IANA timezone. A segment crossing a local calendar day is unavailable with this minimal weekly schedule model. No opening hours means closed.

For each overlapping `CONFIRMED` or `IN_PROGRESS` booking-service segment, reserved staff headcount is `max(requiredStaffCountSnapshot, assignedStaffCount)`. The maximum simultaneous demand across overlap boundaries is subtracted from the count of active staff whose schedules cover the full requested segment. Unassigned bookings therefore reserve anonymous headcount. Booking creation checks each sequential segment inside a per-organization PostgreSQL advisory-lock transaction to prevent simultaneous confirmations from exceeding capacity. Skill snapshots do not affect availability. Admin assignment uses them only to return mismatch warnings.

Resource-type counts are the number of distinct resource instances needed for a segment. An active resource instance has `capacity` persons; a V1 self-booking represents one customer, so an instance is eligible when `capacity >= 1`. Availability reserves required instances by resource type for confirmed/in-progress segments even before named resources are assigned. Assignment requires an active same-organization instance of a snapshotted type, does not exceed its snapshotted required count, and rejects overlapping assignments of the same instance. Staff and resource replacement, including removal with an empty ID array, run under the same per-organization lock. Partially assigned requirements remain anonymous reservations until filled.

## API and scope

`POST /availability/check` quotes a requested sequence; `POST /bookings` rechecks it under a lock and confirms only if every segment is feasible. `GET /bookings/my` and `/bookings/my/:id` enforce customer ownership. `GET /bookings` and `/bookings/:id`, status updates, and per-service staff/resource assignment require their platform permission keys. `POST /customers/me` creates or updates the authenticated user's linked profile without accepting a user or organization ID. Resource, opening-hours, and staff-schedule endpoints derive organization scope from the active membership. The web UI uses the same session cookie with `credentials: 'include'`.

Customer cancellation/rescheduling controls and policy remain deferred. Leave, location-specific hours, group booking size, and payment gateway behavior are outside this milestone. The staff skill snapshot is advisory in V1.
