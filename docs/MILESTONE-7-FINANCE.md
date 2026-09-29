# Milestone 7 payment status and commission foundation

This is tenant-owned tracking, not a payment gateway or payroll engine. Money is stored in positive integer minor units with a validated ISO 4217 currency code. Booking lines may have different currencies, so payment summaries group booked and recorded amounts by currency rather than inventing a single total or exchange rate.

## Payments

`PaymentRecord` is append-only in the API. It stores the booking, organization, amount, currency, free-text payment method, optional reference/note, paid timestamp, recording user, and timestamps. There is no edit, delete, card-data, refund calculation, or gateway route. `Booking.paymentStatus` remains independent: recording a payment never changes it. Only an authorized explicit `PATCH /bookings/:id/payment-status` changes the status. This can differ from the recorded totals by design in V1.

Admin routes: `GET/POST /bookings/:id/payments`, `GET /bookings/:id/payment-summary`, `PATCH /bookings/:id/payment-status`. Customer route: `GET /bookings/my/:id/payment-summary`, which verifies the booking's linked CustomerProfile belongs to the authenticated user. All queries derive organization scope from the active membership.

## Commission

`CommissionRule` stores organization, optional service, version, JSON configuration, and `DRAFT` or `ARCHIVED` status. It is a configuration draft only: no type, percentage, fixed amount, hourly formula, activation, or automatic calculation is implied. Rule edits increment the version. Admin routes list/create/update/archive these drafts.

Each Service stores `commissionPercentage` (0–100, at most two decimal places, default 0). The existing Service create/update APIs accept this optional field; setting it additionally requires `service.commission.manage`. Omitting it on update preserves the stored percentage.

On the existing booking transition from `IN_PROGRESS` to `COMPLETED`, commission is generated in the same database transaction. Each BookingService may have at most one ACTIVE staff assignment; replacement retains INVALIDATED assignment history. Both assignment validation and a partial unique database index enforce this limit, regardless of older required-staff-count snapshots. A booking can still contain multiple services assigned to different staff. There is no separate BookingService completion status.

For each assigned line, commission is the booked `lineTotalMinor` (saved unit price × quantity) multiplied by the Service percentage read at completion, divided by 100. The sole assigned staff member receives that full amount. Decimal arithmetic rounds half up to the nearest minor unit. Unassigned lines and calculations rounding to zero (including 0% rates) produce no commission record. Completion does not depend on payment status.

The existing `CommissionRecord` stores the resulting integer amount and booking-line currency. Its `sourceSnapshot` captures `AUTOMATIC`, Service name, percentage, booking/line/staff/assignment identifiers, assignment time, and price/quantity snapshots. `recordedByUserId` identifies the user who completed the booking. Later Service price/rate edits do not alter these earnings. Transaction locking and the existing line/staff unique key prevent duplicate records; repeated completion retains the existing invalid-transition response.

`GET /commissions` requires `commission.read.all`. `GET /commissions/my` requires `commission.read.own` and resolves the authenticated user's active linked StaffProfile. The manual `POST /commissions` route and `commission.record` permission are retired. Service and Commission screens display currency amounts such as RM30.00 while storage stays in minor units. Draft Commission Rules remain independent of calculation. Adjustments, reversals and payouts remain deferred.

### Existing data and deployment

Apply the Prisma migration before starting the updated API. Existing Services default to 0%; configure their rates before completing future bookings. Existing commission records remain readable and unchanged, and previously completed bookings are not backfilled. The migration rejects existing BookingServices with multiple active staff assignments: resolve those assignments explicitly before retrying the migration; no staff member is chosen automatically.

Fresh demo data uses a 12.5% Service rate and the same automatic calculator (RM120.00 → RM15.00). `seed:demo` builds the API first. Rerunning it preserves existing completed bookings, commission history and configured Service rates.
