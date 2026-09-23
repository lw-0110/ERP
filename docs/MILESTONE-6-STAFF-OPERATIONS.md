# Milestone 6 attendance and leave

Attendance and leave are tenant-owned core staff operations. A self-service request resolves the active `StaffProfile` linked to the authenticated user within the active membership's organization. An unlinked or inactive staff profile cannot use self-service operations. Client-supplied staff or organization IDs are not accepted for clock-in, clock-out, or leave submission.

## Attendance

`AttendanceRecord.workDate` is the organization-local date at clock-in, stored as a PostgreSQL `date`; clock times are `timestamptz`. Clock-in creates an `INCOMPLETE` record. Clock-out sets `PRESENT` and must be later than clock-in. A partial unique database index permits only one open record per staff, including concurrent requests. This status is a record-completion indicator, not a payroll, lateness, or shift-compliance judgment. Multiple completed records on a date are permitted; only simultaneous open records are forbidden.

Staff routes: `POST /attendance/clock-in`, `POST /attendance/clock-out`, `GET /attendance/my`. Admin routes: `GET /attendance` (optional `staffId` filter), `GET /attendance/:id`. Admin clock-on-behalf and attendance adjustment are not in this milestone.

## Leave

`LeaveType` is an archive-safe organization configuration record. `LeaveRequest` refers to one active type on submission, stores a half-open `[startDateTime, endDateTime)` interval in `timestamptz`, and starts `PENDING`. The stored statuses are `PENDING`, `APPROVED`, `REJECTED`, and `CANCELLED`; only pending requests may be approved or rejected by the review route. Both `PENDING` and `APPROVED` exclude that staff member from new booking availability and new staff assignment for overlapping segments. `REJECTED` and `CANCELLED` do not block. Booking snapshots, existing bookings, and existing assignments are never rewritten on leave submission or review. Leave submission uses the same per-organization advisory lock as booking creation and assignment.

Conflict details are computed from existing assigned BookingService segments rebuilt from immutable snapshots, with half-open overlap. Submission response and admin leave list/detail include conflict entries with booking and line IDs. This is a warning, not an automatic cancellation or unassignment.

Staff routes: `GET /leave-types`, `POST /leave-requests`, `GET /leave-requests/my`, `GET /leave-requests/:id`. Admin routes: `POST /leave-types`, `PATCH /leave-types/:id/archive`, `GET /leave-requests`, `GET /leave-requests/:id`, `PATCH /leave-requests/:id/approve`, `PATCH /leave-requests/:id/reject`. The detail route accepts either own-read or all-read permission and applies ownership unless the latter is granted. Routes use existing platform-defined permission keys and server-derived tenant context. Leave cancellation is intentionally deferred because no permitted status/timing policy was approved; there is no cancellation control or endpoint yet. No payroll, late/overtime calculation, or automatic booking modification is included.
