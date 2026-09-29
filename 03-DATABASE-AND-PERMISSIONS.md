# 03-DATABASE-AND-PERMISSIONS.md
# Database & Permission Design

## 1. Database Principles

Use PostgreSQL + Prisma.

Rules:

- Tenant-owned business entities must include `organization_id`.
- Do not hard-code normal business configuration.
- Use migrations for schema changes.
- Preserve historical business data.
- Prefer status/archive over destructive delete when records are referenced historically.
- Use constraints and indexes where practical.
- Use audit logs for sensitive changes.

## 2. Platform Identity

### User

Suggested fields:

```text
id
email
username (optional)
auth credentials/provider reference
email_verified_at
status
last_login_at
created_at
updated_at
```

### Organization

```text
id
name
slug
industry_type
status
timezone
default_currency
created_at
updated_at
```

### Membership

Links User to Organization.

```text
id
user_id
organization_id
role_id
status
joined_at
created_at
updated_at
```

Suggested unique key:

```text
user_id + organization_id
```

## 3. Platform-Level IT Access

Platform Super Admin / IT must be separate from ordinary organization roles.

Possible model:

```text
User
↓
PlatformRoleAssignment
↓
PlatformRole
↓
PlatformPermission
```

Do not model Platform Super Admin as a normal tenant Admin role.

## 4. Organization Roles and Permissions

### Role

```text
id
organization_id
name
description
is_system_default
status
created_at
updated_at
```

### Permission

```text
id
key
module
description
```

### RolePermission

```text
role_id
permission_id
```

Roles are configurable collections of permissions.

## 5. Location / Branch

### Location

```text
id
organization_id
name
code
address
phone
email
timezone
status
created_at
updated_at
```

One Organization → many Locations.

## 6. Customer

### CustomerProfile

```text
id
organization_id
user_id (nullable when profile exists before account linking)
first_name
last_name
display_name
phone
email
date_of_birth (optional)
notes
status
created_at
updated_at
```

Customer ownership checks must protect customer-accessible data.

## 7. Staff

### StaffProfile

```text
id
organization_id
user_id
employee_code
display_name
phone
email
status
hire_date
created_at
updated_at
```

### StaffLocation

```text
staff_id
location_id
```

### Skill

Use configurable capabilities instead of hard-coding "Therapist".

```text
id
organization_id
name
status
```

### StaffSkill

```text
staff_id
skill_id
```

## 8. Services

### ServiceCategory

```text
id
organization_id
name
description
status
```

### Service

```text
id
organization_id
category_id
name
description
duration_minutes
price
required_staff_count
buffer_before_minutes
buffer_after_minutes
status
created_at
updated_at
```

### ServiceLocation

```text
service_id
location_id
```

### ServiceRequiredSkill

```text
service_id
skill_id
required_count
```

### Service commission percentage

`Service.commissionPercentage` is a decimal percentage (0–100, two decimal places). Automatic earnings reuse `CommissionRecord` and its source snapshot; Draft JSON Commission Rules do not calculate earnings.

Each BookingService has at most one ACTIVE BookingStaff row, enforced by a partial unique index. Invalidated assignment history remains available. Each assigned staff receives the full commission when the booking completes.

## 9. Resources / Rooms

### ResourceType

```text
id
organization_id
name
description
status
```

Examples:

```text
Massage Room
Treatment Bed
Machine
Consultation Room
```

### Resource

```text
id
organization_id
location_id
resource_type_id
name
code
capacity
status
created_at
updated_at
```

Adding a room means inserting a Resource record, not modifying code.

## 10. Scheduling

### StaffWorkingSchedule

```text
id
organization_id
staff_id
location_id
day_of_week
start_time
end_time
effective_from
effective_to
status
```

### LocationOpeningHour

```text
id
organization_id
location_id
day_of_week
open_time
close_time
status
```

### ClosureDate

```text
id
organization_id
location_id (nullable for org-wide)
date
name
start_time (optional)
end_time (optional)
status
```

## 11. Leave

### LeaveType

```text
id
organization_id
name
description
status
```

### LeaveRequest

```text
id
organization_id
staff_id
leave_type_id
start_datetime
end_datetime
reason
status
reviewed_by_user_id
reviewed_at
review_note
created_at
updated_at
```

Statuses:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

Availability behavior:

```text
PENDING   → blocks new booking availability
APPROVED  → blocks new booking availability
REJECTED  → does not block availability
CANCELLED → does not block availability
```

## 12. Booking

### Booking

```text
id
organization_id
location_id
customer_id
booking_number
start_datetime
end_datetime
status
payment_status
customer_note
internal_note
created_by_user_id
cancelled_at
created_at
updated_at
```

Normal customer-created booking starts as:

```text
CONFIRMED
```

### BookingService

Supports multiple services per booking.

```text
id
booking_id
service_id
quantity
unit_price_snapshot
duration_minutes_snapshot
line_total
sort_order
```

Snapshots are required so historical bookings do not change when Service price/duration changes later.

### BookingStaff

Supports multiple staff assignments.

```text
id
booking_id
staff_id
assigned_by_user_id
assigned_at
status
```

A booking may be confirmed before exact staff assignment, but availability must verify enough eligible staff capacity before confirmation.

### BookingResource

```text
id
booking_id
resource_id
assigned_by_user_id
assigned_at
status
```

Resources/rooms may be assigned after booking by Admin.

## 13. Booking Capacity Requirement

Before confirming a booking, the system must determine whether enough eligible staff capacity exists for the selected service combination.

The engine must consider:

- Required staff count
- Skills
- Staff working schedules
- Existing assigned work
- Pending leave
- Approved leave
- Branch availability
- Service duration
- Buffers

If service combinations create ambiguous sequential/parallel scheduling behavior, do not invent a permanent rule. Keep implementation explicit and document the decision before locking it in.

## 14. Attendance

### AttendanceRecord

```text
id
organization_id
staff_id
location_id
attendance_date
clock_in_at
clock_out_at
status
created_at
updated_at
```

Potential status examples:

```text
PRESENT
INCOMPLETE
MANUALLY_ADJUSTED
```

Late/overtime logic is not required yet.

## 15. Payment Status

V1 records status only.

Recommended values:

```text
UNPAID
PARTIALLY_PAID
PAID
REFUND_PENDING
REFUNDED
```

No payment gateway transaction model is required yet.

## 16. Organization Settings

Use structured settings, for example:

```text
allow_customer_cancellation
cancellation_cutoff_hours
allow_customer_reschedule
reschedule_cutoff_hours
booking_interval_minutes
```

Avoid scattered hard-coded rules.

## 17. Notifications

### Notification

```text
id
organization_id
user_id
type
title
message
read_at
created_at
```

V1 can start with in-app notifications.

## 18. Audit Log

### AuditLog

```text
id
organization_id (nullable for platform event)
actor_user_id
action
entity_type
entity_id
old_value_json
new_value_json
ip_address
user_agent
created_at
```

Audit at least:

- Role changes
- Permission changes
- Booking cancellation
- Staff assignment
- Resource assignment
- Leave approval/rejection
- Organization settings changes
- Cross-organization IT support actions

## 19. Recommended Permission Keys

### Platform

```text
platform.organization.read
platform.organization.create
platform.organization.update
platform.organization.disable
platform.support.access
platform.audit.read
```

### Organization

```text
organization.read
organization.update
organization.settings.manage
```

### Role

```text
role.read
role.create
role.update
role.delete
role.permission.manage
```

### Customer

```text
customer.create
customer.read.own
customer.read.assigned
customer.read.all
customer.update.own
customer.update.all
customer.disable
```

### Staff

```text
staff.read.own
staff.read.all
staff.create
staff.update.own
staff.update.all
staff.disable
staff.invite
staff.schedule.manage
```

### Service

```text
service.read
service.create
service.update
service.disable
service.category.manage
service.commission.manage
```

### Location

```text
location.read
location.create
location.update
location.disable
```

### Resource

```text
resource.read
resource.create
resource.update
resource.disable
resource.type.manage
```

### Booking

```text
booking.create.own
booking.create.all
booking.read.own
booking.read.assigned
booking.read.all
booking.update.own
booking.update.assigned
booking.update.all
booking.cancel.own
booking.cancel.all
booking.reschedule.own
booking.reschedule.all
booking.assign_staff
booking.assign_resource
booking.status.update
```

### Attendance

```text
attendance.clock.own
attendance.read.own
attendance.read.all
attendance.adjust
```

### Leave

```text
leave.create.own
leave.read.own
leave.read.all
leave.cancel.own
leave.review
leave.type.manage
```

### Reports

```text
report.view
report.export
```

### Audit

```text
audit.read
```

## 20. Default Role Permission Matrix

| Capability | IT / Platform Admin | Organization Admin | Staff | Customer |
|---|---:|---:|---:|---:|
| Manage platform organizations | Yes | No | No | No |
| Cross-org support access | Controlled + audited | No | No | No |
| Manage organization settings | Controlled | Yes | No | No |
| Manage roles/permissions | Controlled | Yes | No | No |
| Manage branches | Controlled | Yes | No | No |
| Manage resources | Controlled | Yes | No | No |
| Manage services | Controlled | Yes | No | No |
| Manage staff | Controlled | Yes | No | No |
| Manage customers | Controlled | Yes | Limited | Own only |
| Create own booking | No | Yes | Optional permission | Yes |
| View all bookings | Controlled | Yes | No | No |
| View assigned bookings | Controlled | Yes | Yes | No |
| View own bookings | No | Yes | Optional | Yes |
| Assign staff | Controlled | Yes | No | No |
| Assign room/resource | Controlled | Yes | No | No |
| Clock own attendance | No | Optional | Yes | No |
| View all attendance | Controlled | Yes | No | No |
| Apply own leave | No | Optional | Yes | No |
| Review leave | Controlled | Yes | No | No |
| View reports | Controlled | Yes | Optional | No |
| View audit logs | Yes | Yes | No | No |

## 21. Ownership Rules

Permission checks must also validate ownership/assignment.

Examples:

```text
booking.read.own
→ booking.customer_id must belong to authenticated customer
```

```text
attendance.read.own
→ attendance.staff_id must belong to authenticated staff
```

```text
booking.read.assigned
→ authenticated staff must exist in BookingStaff
```

## 22. Tenant Isolation Rule

Every tenant-owned query must scope to the active organization.

Never trust an `organization_id` supplied by the browser without validating membership/authorization.

Required negative tests:

```text
Org A user requests Org B booking → denied
Org A admin edits Org B customer → denied
Customer changes URL ID to another customer's booking → denied
```

## 23. Index Recommendations

Consider indexes for:

```text
organization_id
user_id
customer_id
staff_id
location_id
service_id
booking_number
booking start/end datetime
booking status
leave start/end datetime
attendance date
email
```

## 24. Soft Delete / Historical Integrity

Prefer inactive/archive state for records referenced by history.

Examples:

- Service
- Staff
- Customer
- Resource
- Location

Changing current master data must not rewrite historical booking facts.

## 25. Confirmed Commission Formula

Booked service-line price (saved unit price × quantity) × Service commission percentage at completion, rounded half up to minor units. Store the calculated amount and source snapshot when completing the booking; future Service changes do not recalculate completed earnings. No commission splitting or rules engine is required.
