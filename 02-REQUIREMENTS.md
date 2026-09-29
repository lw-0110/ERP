# 02-REQUIREMENTS.md
# Reusable Management System Foundation — Functional Requirements

## 1. Purpose

This document defines the V1 requirements for a reusable, multi-tenant management and booking platform.

The first implementation is for a Wellness / Massage business, but the foundation must be reusable for other industries such as clinics, salons, workshops, training centres, maintenance companies, and other appointment/service businesses.

## 2. Core Product Goals

The system must support:

- Responsive web app
- Desktop and mobile browsers
- PWA support
- Future desktop/mobile packaging via Tauri
- Multiple organizations
- Multiple branches
- Configurable roles and permissions
- Customers
- Staff
- Services
- Resources / rooms
- Booking and scheduling
- Attendance
- Leave approval
- Payment status tracking
- Audit logging
- Security
- Reusable modules
- Configuration-driven business data

## 3. Configuration-Driven Rule

Common business changes must not require source-code changes.

Admin must be able to configure normal business data through the UI, including:

- Branches / locations
- Rooms / resources
- Resource types
- Services
- Service categories
- Staff
- Skills / staff types
- Roles
- Permissions
- Opening hours
- Holiday / closure dates
- Leave types
- Booking settings
- Cancellation settings
- Reschedule settings

Adding a new room, branch, service, staff member, role, or category must not require:

- A new module
- A database schema change
- Source-code edits
- Redeployment

## 4. Multi-Tenant Requirement

The platform is intended to serve multiple companies.

```text
Platform
├── Organization A
├── Organization B
└── Organization C
```

Requirements:

- Each organization has isolated business data.
- Organization A must never access Organization B's protected data.
- Business records must carry organization ownership.
- Organization-specific settings must be independent.
- Multiple branches are supported from V1.

## 5. User Types

Initial user categories:

```text
IT / Platform Super Admin
Organization Admin
Staff
Customer
```

However, business access must be based on configurable Roles + Permissions, not only hard-coded role names.

Future roles may include:

- Owner
- Manager
- Receptionist
- Supervisor
- Therapist
- Cleaner
- Cashier
- Doctor
- Technician

## 6. Login and Authentication

Use one login page.

```text
Email / Username
Password
```

Do not ask users to select Admin / Staff / Customer during login.

Login flow:

```text
Credentials
↓
Authenticate
↓
Load User
↓
Load Organization Membership
↓
Load Role
↓
Load Permissions
↓
Create Session
↓
Open allowed dashboard/features
```

V1 authentication must include:

- Register
- Login
- Logout
- Session management
- Forgot password
- Reset password
- Email verification
- Disabled account support
- Secure password hashing
- Rate limiting
- Secure session/cookie handling
- Input validation

## 7. Account-Based Customer Identity

For V1, customer identity is based on the authenticated account.

- The logged-in account provides the customer's profile information.
- A booking belongs to that authenticated customer account.
- A separate "book on behalf of another person" flow is not defined in V1.

## 8. Customer Registration

Support both:

1. Customer self-registration
2. Admin-created customer account/profile

## 9. Staff Account Creation

Support both:

1. Admin directly creates staff account
2. Admin sends an invitation and staff completes account setup

## 10. Authorization Model

Use:

```text
User
↓
Organization Membership
↓
Role
↓
Permissions
```

Frontend may hide unavailable actions, but backend must always enforce permission checks.

## 11. IT / Platform Super Admin

The IT role is a platform-level role above normal organization Admin.

Capabilities may include:

- Manage organizations
- Create/disable organizations
- Platform support
- Platform-level settings
- Authorized troubleshooting
- Platform audit access

Cross-organization support access must be explicit and audited.

A normal organization Admin must never automatically gain platform-level access.

## 12. Organization Admin

Admin can manage organization operations, including:

- Bookings
- Customers
- Staff
- Services
- Branches
- Resources
- Schedules
- Attendance
- Leave approval
- Staff assignment
- Resource assignment
- Roles and permissions
- Reports
- Settings
- Audit logs

## 13. Staff

Staff can:

- Login
- View own dashboard
- View own schedule
- View assigned bookings
- View permitted customer information
- Clock in
- Clock out
- View attendance history
- Apply leave
- View leave status
- View own commission information
- Update own profile where allowed

## 14. Customer

Customer can:

- Register
- Login
- View services
- View available dates/times
- Create booking
- View own bookings
- Cancel according to settings
- Reschedule according to settings
- View booking status
- View payment status
- Update profile
- Receive in-app notifications

## 15. Booking Confirmation Rule

Customer booking does not require Admin approval.

A booking is immediately confirmed when the system determines the slot is valid.

```text
Customer selects services/date/time
↓
System checks availability
↓
Enough eligible staff capacity exists
↓
Booking rules pass
↓
Booking created as Confirmed
```

## 16. Staff Selection and Assignment

Customer does not choose a specific staff member in V1.

```text
Customer books an available slot
↓
System confirms enough eligible staff capacity exists
↓
Booking confirmed
↓
Admin assigns specific staff later
```

If a booking requires 2 staff, the slot must not be offered unless at least 2 eligible staff are available.

## 17. Room / Resource Assignment

Customer does not select a room.

```text
Booking confirmed
↓
Admin assigns room/resource
```

Rooms must use a generic Resource model rather than a hard-coded MassageRoom module.

Example:

```text
Resource Type: Massage Room
Resource: VIP Room 01
Branch: Permas Jaya
Capacity: 2
Status: Active
```

## 18. Multiple Services Per Booking

A Booking can contain multiple Services.

Example:

```text
Foot Massage — 60 min
Shoulder Massage — 30 min
```

The booking engine must derive relevant:

- Duration
- Price
- Required staff capacity
- Required skills
- Required resources

## 19. Multiple Staff Per Booking

A Booking may require multiple staff.

Example:

```text
Couple Massage
Required Staff: 2
```

Database and business logic must support many staff assignments per booking.

## 20. Multi-Branch Support

Multiple branches are required from V1.

Example:

```text
Permas Jaya Branch
Mount Austin Branch
Bukit Indah Branch
```

Admin must be able to add a branch through the UI without code changes.

Each branch may have:

- Opening hours
- Services
- Staff
- Resources
- Booking availability

## 21. Service Management

Suggested Service data:

```text
Name
Description
Category
Duration
Price
Required Staff Count
Required Skill(s)
Required Resource Type(s)
Buffer Before
Buffer After
Status
Available Locations
Commission Configuration
```

Service prices are stored as data.

Initial demo/seed records may use sample prices.

## 22. Commission

- Each Service has a configurable commission percentage from 0 to 100, with at most two decimal places.
- Each BookingService has at most one active assigned Staff. A booking may contain multiple services with different staff.
- On booking completion, the assigned Staff earns the full booked service-line price × the Service percentage at completion. Quantity is included; amounts round half up to minor units.
- Unassigned services and zero calculated amounts do not create earnings.
- Completed earnings retain their price, percentage, assignment and amount snapshots after later Service edits.
- Staff can read their own commission; broader visibility follows existing permissions. Manual entry is retired.

## 23. Attendance

Attendance is required in V1.

Features:

- Clock In
- Clock Out
- Attendance date
- Clock-in time
- Clock-out time
- Attendance status
- Staff attendance history
- Admin attendance view

GPS, overtime, late calculation, and shift penalties are not required unless separately specified.

## 24. Leave Approval

Full leave approval is required.

Approved business rule:

```text
Staff applies leave
↓
Status = Pending
↓
Staff immediately becomes unavailable for NEW customer bookings during requested period
↓
Admin reviews
├── Approve → staff remains unavailable
└── Reject  → staff becomes available again
```

Pending leave must block new booking availability.

System should alert Admin if the leave period conflicts with already assigned bookings.

## 25. Payment

V1 does not integrate a payment gateway.

Only payment status is recorded.

Suggested statuses:

```text
Unpaid
Partially Paid
Paid
Refund Pending
Refunded
```

Future payment gateways must be added through replaceable integrations.

## 26. Cancellation and Reschedule

Rules must be configurable by organization Admin.

Example settings:

```text
Allow Customer Cancellation: Yes/No
Cancellation Cutoff Hours: configurable
Allow Customer Reschedule: Yes/No
Reschedule Cutoff Hours: configurable
```

Do not hard-code a fixed rule such as 24 hours.

## 27. Availability Engine

Availability should consider:

- Organization opening hours
- Branch opening hours
- Staff working schedule
- Pending leave
- Approved leave
- Existing bookings
- Required number of staff
- Required skills
- Service duration
- Buffer time
- Closure dates / holidays
- Location availability

Because staff is assigned after booking, the engine must calculate capacity rather than requiring a specific staff selection.

## 28. Booking Status

Recommended V1 business statuses:

```text
Confirmed
Checked In
In Progress
Completed
Cancelled
No Show
```

Normal customer booking does not require Pending approval.

## 29. Resource Management

Admin must be able to create Resource Types and Resources.

Examples:

```text
Resource Type: Massage Room
Resource: Room A

Resource Type: Treatment Bed
Resource: Bed 03
```

Resource data must remain generic so future industries can reuse it.

## 30. Dashboard Areas

### Platform / IT

- Organizations
- Platform administration
- Support tools
- Audit tools

### Admin

- Dashboard
- Bookings
- Calendar
- Customers
- Staff
- Services
- Resources
- Locations
- Attendance
- Leave
- Reports
- Roles & Permissions
- Audit Logs
- Settings

### Staff

- Dashboard
- My Schedule
- My Bookings
- Attendance
- Leave
- Commission
- Profile

### Customer

- Book Appointment
- My Bookings
- Notifications
- Profile

## 31. Responsive / Device Requirement

V1 strategy:

```text
React Responsive Web App
+
PWA
```

Must support modern:

- Desktop
- Laptop
- Tablet
- Android browser
- iPhone browser

Future packaging may use Tauri.

Do not build three separate unrelated codebases for web, desktop, and mobile.

## 32. Security Requirements

Mandatory:

- Proven password hashing/auth library
- Secure sessions
- HttpOnly cookies where applicable
- Secure production cookies
- Rate limiting
- Input validation
- CSRF protection where applicable
- XSS protection
- SQL injection protection
- Tenant isolation
- Ownership checks
- Permission checks
- Audit logging
- Secure file handling
- Secrets only in environment variables
- Sanitized errors
- Least privilege
- Dependency maintenance
- Backup strategy

## 33. Core vs Industry-Specific

Core modules:

- Authentication
- Authorization
- Organization
- User
- Role
- Permission
- Customer
- Staff
- Service
- Resource
- Booking
- Scheduling
- Attendance
- Leave
- Notifications
- Settings
- Audit

Wellness-specific items should stay in the Wellness module where possible.

## 34. MVP Scope

V1 includes:

- Multi-tenant organizations
- Multi-branch
- Platform IT role
- Configurable roles/permissions
- Customer self-registration
- Admin-created customers
- Admin-created staff
- Staff invitation
- Authentication
- Customers
- Staff
- Services
- Resources
- Multiple services per booking
- Multiple staff per booking
- Immediate booking confirmation
- Capacity-based slot availability
- Admin staff assignment
- Admin room/resource assignment
- Attendance
- Leave approval
- Pending-leave booking block
- Payment status
- Configurable cancellation/reschedule rules
- Responsive UI
- Audit foundation
- Security foundation

## 35. Out of Scope for Initial MVP

Unless separately requested:

- Online payment gateway
- Payroll
- Full accounting
- Advanced CRM
- Inventory
- Public app-store release
- Microservices
- Kubernetes
- AI chatbot
- SMS integration
- WhatsApp integration
- Complex workflow builder

## 36. Acceptance Criteria

V1 is not considered acceptable unless:

1. Organization data is isolated.
2. Customer can self-register/login.
3. Admin can create customer accounts.
4. Staff can use admin-created or invited accounts.
5. Admin can add branches without code changes.
6. Admin can add rooms/resources without code changes.
7. Admin can add services without code changes.
8. Booking is confirmed immediately when availability passes.
9. Customer does not need to choose staff.
10. System verifies sufficient staff capacity before exposing a slot.
11. Booking supports multiple services.
12. Booking supports multiple staff assignments.
13. Admin can assign staff after booking.
14. Admin can assign room/resource after booking.
15. Pending leave blocks new booking availability.
16. Approved leave continues blocking availability.
17. Rejected leave restores availability.
18. Attendance supports clock-in/out.
19. Payment status can be recorded.
20. Cancellation/reschedule rules are configurable.
21. Backend blocks unauthorized access.
22. Customer cannot access another customer's protected data.
23. Organization A cannot access Organization B's data.
