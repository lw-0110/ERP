# V1 Error Handling

## Response contract

API errors use a stable envelope:

```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Email or password is incorrect.",
  "requestId": "...",
  "details": { "fields": ["email must be an email"] }
}
```

`requestId` is safe to show as a support reference and is also returned in
`X-Request-ID`. Unexpected errors are logged server-side with that identifier;
stack traces, Prisma errors, SQL, tokens, secrets, and Better Auth internals
are never returned to clients.

## Stable codes

The API owns stable codes for authentication, validation, booking, assignment,
attendance, invitations, rate limiting, and internal failures. The frontend
maps codes to safe user-facing text in `apps/web/src/error-messages.ts`.
Unknown codes and malformed responses use:

> Something went wrong. Please try again.

Authentication deliberately uses one message for invalid email and password
to prevent account enumeration. Session failures use a separate expiry message
and the UI returns to the sign-in state when the session is no longer valid.

## HTTP conventions

- `400`: validation or malformed request state
- `401`: missing, expired, or invalid authentication
- `403`: authenticated but not permitted
- `404`: resource unavailable within the authorized scope
- `409`: duplicate or concurrency conflict
- `429`: rate limited
- `500`: unexpected server failure

Existing status codes remain unchanged unless a flow already has a stronger
domain-specific contract. Field validation should be represented in `details`
when the framework provides field-level information; the UI may render those
details beside the relevant form field.

## Success and loading feedback

Important mutations should report a stable success message and disable their
submit control while the request is running. This prevents duplicate booking,
staff, payment, leave, and invitation submissions.

## Security review rule

When adding an error, prefer a stable code and a safe actionable message. Do
not pass through exception messages from Prisma, database constraints, raw
Better Auth responses, stack traces, or request secrets.

## Domain catalogue

The following catalogue is the intended public vocabulary. Domain exceptions
use the listed HTTP status and the frontend renders the listed message.

| Group | Code | Status | User-facing message |
| --- | --- | ---: | --- |
| AUTH | `AUTH_INVALID_CREDENTIALS` | 401 | Email or password is incorrect. |
| AUTH | `AUTH_SESSION_EXPIRED` | 401 | Your session has expired. Please sign in again. |
| BOOKING | `BOOKING_SLOT_UNAVAILABLE` | 400 | This time slot is no longer available. Please choose another time. |
| BOOKING | `BOOKING_INSUFFICIENT_STAFF` | 400 | There are not enough available staff for this time. |
| BOOKING | `BOOKING_RESOURCE_UNAVAILABLE` | 400 | A required resource is not available at the selected time. |
| BOOKING | `BOOKING_INVALID_STATUS` | 400 | Only confirmed bookings can use this action. |
| BOOKING | `BOOKING_CANCELLATION_DISABLED` | 403 | Customer cancellation is currently disabled. |
| BOOKING | `BOOKING_CANCELLATION_CUTOFF` | 403 | This booking can no longer be cancelled because the cancellation cutoff has passed. |
| BOOKING | `BOOKING_RESCHEDULE_DISABLED` | 403 | Customer rescheduling is currently disabled. |
| BOOKING | `BOOKING_RESCHEDULE_CUTOFF` | 403 | This booking can no longer be rescheduled because the reschedule cutoff has passed. |
| BOOKING | `BOOKING_RESCHEDULE_LIMIT` | 403 | You have reached the reschedule limit for this booking. |
| STAFF | `STAFF_NOT_AVAILABLE` | 400 | This staff member is not available at the selected time. |
| STAFF | `STAFF_ASSIGNMENT_CONFLICT` | 400 | This staff member already has another assignment during this time. |
| STAFF | `STAFF_CROSS_TENANT` | 400 | The selected staff member is not available for this organization. |
| RESOURCE | `RESOURCE_UNAVAILABLE` | 400 | This resource is not available at the selected time. |
| RESOURCE | `RESOURCE_CONFLICT` | 400 | This resource is already in use during this time. |
| RESOURCE | `RESOURCE_TYPE_MISMATCH` | 400 | This resource does not match the required resource type. |
| RESOURCE | `RESOURCE_CAPACITY_INSUFFICIENT` | 400 | This resource does not have enough capacity for this service. |
| ATTENDANCE | `ATTENDANCE_ALREADY_CLOCKED_IN` | 409 | You are already clocked in. |
| ATTENDANCE | `ATTENDANCE_NO_ACTIVE_CLOCK_IN` | 400 | No active clock-in was found. |
| ATTENDANCE | `ATTENDANCE_INVALID_CLOCK_OUT` | 400 | Clock-out time must be after clock-in time. |
| LEAVE | `LEAVE_INVALID_RANGE` | 400 | Leave start time must be earlier than leave end time. |
| LEAVE | `LEAVE_ALREADY_REVIEWED` | 409 | This leave request has already been reviewed. |
| LEAVE | `LEAVE_ASSIGNMENT_CONFLICT` | 200 | This leave request overlaps an existing booking assignment. |
| PAYMENT | `PAYMENT_INVALID_AMOUNT` | 400 | Payment amount must be greater than zero. |
| PAYMENT | `PAYMENT_INVALID_CURRENCY` | 400 | Enter a valid currency code. |
| PAYMENT | `PAYMENT_BOOKING_NOT_FOUND` | 404 | The booking for this payment could not be found. |
| COMMISSION | `COMMISSION_INVALID_AMOUNT` | 400 | Commission amount must be greater than zero. |
| COMMISSION | `COMMISSION_BOOKING_NOT_COMPLETED` | 400 | Commission can only be recorded after the booking is completed. |
| COMMISSION | `COMMISSION_STAFF_NOT_ASSIGNED` | 400 | Commission can only be recorded for staff assigned to this service. |
| SETTINGS | `SETTINGS_INVALID_TIMEZONE` | 400 | Select a valid timezone. |
| SETTINGS | `SETTINGS_INVALID_BOOKING_PREFIX` | 400 | Booking prefix may contain only letters, numbers, and hyphens. |
| SETTINGS | `SETTINGS_INVALID_POLICY` | 400 | One or more booking policy values are invalid. |
| INVITATION | `INVITE_INVALID` | 400 | This invitation is invalid. |
| INVITATION | `INVITE_EXPIRED` | 400 | This invitation has expired. Please request a new invitation. |
| INVITATION | `INVITE_USED` | 400 | This invitation has already been used. |
| INVITATION | `INVITE_REVOKED` | 400 | This invitation is no longer valid. |

The HTTP status follows existing service behavior; no domain rule or payment,
commission, booking, or leave side effect is changed by this catalogue.