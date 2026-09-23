# Milestone 7 payment status and commission foundation

This is tenant-owned tracking, not a payment gateway or payroll engine. Money is stored in positive integer minor units with a validated ISO 4217 currency code. Booking lines may have different currencies, so payment summaries group booked and recorded amounts by currency rather than inventing a single total or exchange rate.

## Payments

`PaymentRecord` is append-only in the API. It stores the booking, organization, amount, currency, free-text payment method, optional reference/note, paid timestamp, recording user, and timestamps. There is no edit, delete, card-data, refund calculation, or gateway route. `Booking.paymentStatus` remains independent: recording a payment never changes it. Only an authorized explicit `PATCH /bookings/:id/payment-status` changes the status. This can differ from the recorded totals by design in V1.

Admin routes: `GET/POST /bookings/:id/payments`, `GET /bookings/:id/payment-summary`, `PATCH /bookings/:id/payment-status`. Customer route: `GET /bookings/my/:id/payment-summary`, which verifies the booking's linked CustomerProfile belongs to the authenticated user. All queries derive organization scope from the active membership.

## Commission

`CommissionRule` stores organization, optional service, version, JSON configuration, and `DRAFT` or `ARCHIVED` status. It is a configuration draft only: no type, percentage, fixed amount, hourly formula, activation, or automatic calculation is implied. Rule edits increment the version. Admin routes list/create/update/archive these drafts.

`CommissionRecord` is an append-only manual earned amount for one assigned staff member and BookingService. Creation requires the booking to be `COMPLETED` and the staff member to be currently assigned to that line in the same organization; a transaction and the organization advisory lock protect this check. One normal earned record per line/staff pair is permitted. Its immutable `sourceSnapshot` contains the manual explanation and captured booking number, line/service/staff/assignment identifiers, assignment time, and historical booking-line money snapshots. Updating a Service or draft CommissionRule does not alter recorded earnings. There are no adjustment, reversal, payout, or automatic calculation routes.

Admin routes: `GET/POST /commissions`, `GET/POST /commission-rules`, `PATCH /commission-rules/:id`, `PATCH /commission-rules/:id/archive`. Staff route: `GET /commissions/my` resolves the authenticated user's active linked StaffProfile. New platform-defined permission keys control each read/record/manage operation; role names are not used for authorization.
