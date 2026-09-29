# Milestone 11 V1 UAT plan

Use only synthetic UAT data. Record `Pass`, `Fail`, or `Blocked` and evidence in the final two columns. Negative permission tests must call the API directly as well as hiding UI actions.

| ID | Role | Preconditions | Steps | Expected result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| AUTH-01 | Customer | Demo seed applied | Register, sign out, sign in | Customer role and permissions work without reseeding | | |
| AUTH-02 | Any | Signed in | Reload browser | Session and current organization restore | | |
| AUTH-03 | Any | Signed in | Sign out, revisit protected area | Session is invalid and login is shown | | |
| STAFF-01 | Admin | Unlinked active StaffProfile | Create invitation and copy URL | URL appears once; list shows ACTIVE without token | | |
| STAFF-02 | Staff | Valid invitation | Open URL, set account details, redeem | Staff account/profile/membership link; role is Staff | | |
| STAFF-03 | Staff | Used/expired/revoked invitation | Attempt redemption | Safe rejection; no profile or membership mutation | | |
| STAFF-04 | Admin | Active invitation | Revoke invitation | Status is REVOKED and redemption fails | | |
| STAFF-05 | Staff | Assigned booking exists | Open Assigned work | Only active assignments for this staff user appear | | |
| CUST-01 | Customer | Signed in, no profile | Complete required profile | Profile links to current user and tenant | | |
| CUST-02 | Customer | Completed profile | Browse active services | Tenant services display with duration and price | | |
| BOOK-01 | Customer | Open hours and capacity configured | Check slot and create multi-service booking | Booking confirms; snapshots and sequential times are fixed | | |
| BOOK-02 | Customer | Closed/full slot | Attempt booking | Safe availability error; nothing is created | | |
| BOOK-03 | Customer | Own and another customer's bookings exist | Open/list/call detail APIs | Own succeeds; other customer's booking is hidden/denied | | |
| BOOK-04 | Customer | Policy allows action | Cancel/reschedule own confirmed booking | Policy cutoff/count and availability are enforced | | |
| BOOK-05 | Admin | Confirmed booking | Assign staff/resource | Conflicts rejected; successful assignments remain tenant scoped | | |
| BOOK-06 | Admin | Booking workflow ready | Check in, start, complete | Only approved transitions succeed | | |
| ATT-01 | Staff | Linked profile | Clock in, repeat, clock out | Duplicate open clock-in rejected; duration recorded | | |
| LEAVE-01 | Staff/Admin | Leave type exists | Submit and review leave | Pending blocks new capacity; decision and notification appear | | |
| PAY-01 | Admin/Customer | Booking exists | Record payment, manually change status, view summary | Append-only history and per-currency summary are correct | | |
| COMM-01 | Admin/Staff | Service RM100 with 30% commission; one staff assigned | Complete booking and view My Commission | Assigned staff sees RM30.00 automatically; another staff cannot read it | | |
| COMM-02 | Admin | Multiple service lines assigned to different staff | Complete, retry completion, then change Service price/rate | One earned record per assigned line; retry creates no duplicates; history stays unchanged | | |
| COMM-03 | Admin | BookingService exists | Submit two staff IDs directly to assignment API | Rejected; current assignment is preserved | | |
| COMM-04 | Admin | Services with 0% and fractional percentages | Complete assigned work | Zero produces no record; fractional calculations round half up to minor units | | |
| REPORT-01 | Admin | Mixed demo history | Filter dashboard/reports | Tenant/date filters and totals are correct | | |
| EXPORT-01 | Admin | User text begins `=`, `+`, `-`, or `@` | Export CSV | Exported cells are formula-neutralized; stored value unchanged | | |
| NOTIF-01 | Each | A recipient event occurs | Open notifications/read one/read all | Only intended tenant/user receives it; unread count changes | | |
| AUDIT-01 | Admin | Audit permission | Perform mutation and open audit | Allowlisted metadata appears; no body/token/PII appears | | |
| SETTINGS-01 | Admin | Settings permission | Change organization/policy/opening hours | Future behavior changes; historical snapshots do not | | |
| SEC-01 | Customer | Direct API client | Call Admin endpoints | 403; frontend visibility is not relied on | | |
| SEC-02 | Org A user | Org B IDs known | Request/mutate Org B records | Not found/forbidden with no data disclosure | | |
| SEC-03 | Any | Malformed UUID/date/JSON | Submit invalid requests | 400-class safe error with request ID | | |
| MOBILE-01 | Each | 360px viewport | Complete primary journey | Navigation, forms and records remain operable | | |
| A11Y-01 | Each | Keyboard only | Navigate/login/submit/dialog actions | Visible focus, labels, headings, status/error announcements work | | |

UAT sign-off requires no open severity-1/2 defects, documented disposition of lower-severity defects, a verified backup/restore rehearsal, and completion of `V1-RELEASE-CHECKLIST.md`.
