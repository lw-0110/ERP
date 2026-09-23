# Reusable Management System Foundation — Development Plan

## 1. Project Overview

### Project Name
**Reusable Management System Foundation**

### Initial Industry
**Wellness / Massage Booking & Management System**

### Long-Term Goal
Build a reusable, scalable management-system foundation that can be reused for different industries without rebuilding the entire application from scratch.

Examples:

- Massage / Wellness Centre
- Beauty Salon
- Clinic
- Repair / Maintenance Company
- Training Centre
- Service Company
- Appointment-based Business
- Other SME Management Systems

The first version will be built for a **massage / wellness business**, but the architecture must remain generic enough so that future industries can reuse the same:

- Authentication
- Authorization
- User management
- Roles and permissions
- Organization management
- Staff management
- Customer management
- Booking engine
- Scheduling
- Notifications
- Reporting foundation
- Audit logging
- Deployment architecture

Industry-specific features should be implemented as separate modules.

---

# 2. Main Requirements

The system must support:

- Web application
- Desktop users
- Mobile users
- Responsive interface
- Progressive Web App (PWA)
- Possible future native desktop/mobile packaging
- Multiple organizations
- Multiple roles
- Role-based and permission-based access
- Secure authentication
- Reusable architecture
- Scalable architecture
- Open-source-first tools
- Zero-cost development environment
- Free development and demo deployment where possible
- Modern 2026 development stack
- Maintainable project structure
- AI-assisted development
- Easy expansion into other industries

---

# 3. Main User Roles

The initial system contains three main roles.

## 3.1 Admin

Admin manages the business.

Typical permissions:

- View dashboard
- Manage bookings
- Manage customers
- Manage staff
- Manage services
- Manage schedules
- Manage staff availability
- Assign staff
- Approve leave
- View reports
- Manage organization settings
- Manage roles
- Manage permissions
- View audit logs

---

## 3.2 Staff

Staff uses the system for daily work.

Typical permissions:

- View own dashboard
- View own schedule
- View assigned bookings
- Update assigned booking status
- View assigned customer information
- Clock in / clock out
- View assigned tasks
- View own commission
- Apply leave
- Update own profile

---

## 3.3 Customer

Customers use the system to make and manage bookings.

Typical permissions:

- Register
- Login
- View available services
- View available timeslots
- Create booking
- View own bookings
- Cancel own booking
- Reschedule own booking
- Update profile
- Receive booking notifications

---

# 4. Login and Access Control Design

## 4.1 One Login Page

The system should **not** have separate login pages for Admin, Staff and Customer.

Use one login page:

```text
Email / Username
Password
Login
```

The user does not need to select:

```text
Admin
Staff
Customer
```

The system identifies the user's role after authentication.

---

## 4.2 Login Flow

```text
User enters email + password
        ↓
Authentication server validates credentials
        ↓
System finds User record
        ↓
System loads Organization Membership
        ↓
System loads Role
        ↓
System loads Permissions
        ↓
Session is created
        ↓
User is redirected to appropriate dashboard
```

Example:

```text
admin@example.com
        ↓
Role = ADMIN
        ↓
/app/admin
```

```text
staff@example.com
        ↓
Role = STAFF
        ↓
/app/staff
```

```text
customer@example.com
        ↓
Role = CUSTOMER
        ↓
/app/customer
```

---

# 5. Access Control Model

Do not rely only on roles.

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

This architecture allows different customers to define their own roles later.

Example future roles:

- Owner
- Manager
- Supervisor
- Receptionist
- Therapist
- Technician
- Doctor
- Cleaner
- Cashier

---

## 5.1 Example Permissions

### Booking

```text
booking.create
booking.read.own
booking.read.assigned
booking.read.all
booking.update.own
booking.update.assigned
booking.update.all
booking.cancel.own
booking.cancel.all
booking.assign
```

### Staff

```text
staff.read
staff.create
staff.update
staff.delete
staff.schedule.manage
staff.leave.approve
```

### Customer

```text
customer.read.own
customer.read.assigned
customer.read.all
customer.update.own
customer.update.all
```

### Reports

```text
report.view
report.export
```

### Settings

```text
settings.read
settings.manage
```

---

# 6. Frontend and Backend Authorization

Permissions must be checked in both places.

## Frontend

Frontend determines whether buttons or menu items should be shown.

Example:

```text
If user has staff.delete
    show Delete Staff button
else
    hide button
```

## Backend

Backend must always verify permission again.

Example:

```text
DELETE /api/staff/123
        ↓
Authenticated?
        ↓
Has staff.delete?
        ↓
Yes → continue

No → 403 Forbidden
```

The backend is the real security boundary.

---

# 7. Multi-Tenant Architecture

The platform should support multiple companies.

Main entity:

```text
Organization
```

Example:

```text
Organization 1
Beautiful Wellness Sdn Bhd
Industry = WELLNESS
```

```text
Organization 2
ABC Dental Clinic
Industry = CLINIC
```

Each organization must only access its own data.

Almost every business table should include:

```text
organization_id
```

Example:

```text
Booking
Customer
Staff
Service
Invoice
Task
Attendance
```

This prevents Company A from accessing Company B's data.

---

# 8. Recommended Technology Stack

## 8.1 Main Language

**TypeScript**

Reason:

- One language across frontend and backend
- Strong typing
- Modern ecosystem
- Good AI coding support
- Easier maintenance
- Suitable for scalable web applications

---

## 8.2 Frontend

### React + Vite

Use for:

- Web interface
- Admin dashboard
- Staff dashboard
- Customer portal
- PWA
- Future Tauri desktop/mobile wrapper

---

## 8.3 UI

### Tailwind CSS

Use for styling.

### shadcn/ui

Use for reusable UI components:

- Buttons
- Forms
- Tables
- Dialogs
- Sidebars
- Cards
- Dropdowns
- Date pickers
- Notifications

---

## 8.4 Backend

### NestJS

Use as the main API backend.

Reasons:

- Modular architecture
- TypeScript
- Dependency injection
- Guards
- Middleware
- Validation
- Scalable structure
- Suitable for modular monolith architecture

---

## 8.5 API

Use:

**REST API**

Document using:

**OpenAPI / Swagger**

Possible future clients:

```text
Web
Desktop
Mobile
External Integration
n8n
Third-party systems
```

---

## 8.6 Database

### PostgreSQL

Use as the main relational database.

Reasons:

- Open source
- Mature
- Reliable
- Suitable for booking systems
- Supports transactions
- Good scalability
- Works with Prisma
- Can be self-hosted

---

## 8.7 ORM

### Prisma

Use for:

- Database schema
- Database queries
- Type-safe database access
- Migrations
- Development productivity

---

## 8.8 Authentication

Recommended:

### Better Auth

Use for:

- Login
- Registration
- Session management
- Password authentication
- Email verification
- Password reset
- Organization support
- Roles
- Permissions

Alternative open-source authentication solutions can be evaluated later if requirements change.

---

## 8.9 Validation

### Zod

Use shared validation schemas between frontend and backend where practical.

---

## 8.10 Data Fetching

### TanStack Query

Use for:

- API requests
- Caching
- Refetching
- Mutation management
- Server-state synchronization

---

## 8.11 Package Manager

### pnpm

Use for:

- Fast installs
- Workspaces
- Monorepo support

---

## 8.12 Development Environment

Use:

- VS Code
- Git
- GitHub
- Node.js
- Docker
- Docker Compose
- PostgreSQL
- pnpm

Optional AI coding:

- Codex
- AGENTS.md
- Architecture documentation
- Code review prompts

---

# 9. Application Architecture

Use a:

# Modular Monolith

Do **not** start with microservices.

Initial architecture:

```text
Frontend
        ↓
REST API
        ↓
NestJS Modular Monolith
        ↓
PostgreSQL
```

Backend modules:

```text
Auth Module
Organization Module
User Module
Role Module
Permission Module
Customer Module
Staff Module
Service Module
Booking Module
Scheduling Module
Notification Module
Attendance Module
Leave Module
Reporting Module
Audit Module
```

Later, if the system becomes very large, specific modules can be separated into services.

---

# 10. Core Platform vs Industry Modules

## 10.1 Core Platform

Reusable across every industry:

```text
Authentication
Authorization
Organizations
Users
Roles
Permissions
Customers
Staff
Booking
Scheduling
Calendar
Notifications
Files
Audit Logs
Settings
Reporting Foundation
```

---

## 10.2 Wellness Module

First industry module:

```text
Therapists
Massage Treatments
Massage Rooms
Commission
Treatment Packages
Treatment Notes
```

---

## 10.3 Future Clinic Module

```text
Doctors
Patients
Consultation
Treatment Notes
Prescription
Medical Services
```

---

## 10.4 Future Workshop Module

```text
Technicians
Vehicles
Repair Jobs
Service Bays
Parts
```

The core application should remain unchanged.

---

# 11. Generic Naming Strategy

Avoid industry-specific database names inside the core.

Bad:

```text
MassageBooking
Masseur
MassageType
MassageRoom
```

Better:

```text
Booking
Staff
Service
Resource
Location
Customer
```

Industry configuration can rename display labels.

Example:

### Wellness

```text
Staff → Therapist
Service → Massage Treatment
Resource → Massage Room
```

### Clinic

```text
Staff → Doctor
Service → Consultation
Resource → Consultation Room
Customer → Patient
```

---

# 12. Core Database Entities

Initial database design:

```text
User
Organization
Membership
Role
Permission
RolePermission
Session
AuditLog

CustomerProfile
StaffProfile

Service
Location
Resource

Booking
BookingStatus
Schedule
Availability
Leave

Notification
File
Setting
```

---

# 13. Suggested Core Relationships

```text
User
 └── Membership
       ├── Organization
       └── Role
            └── Permissions
```

```text
Organization
 ├── Staff
 ├── Customers
 ├── Services
 ├── Locations
 ├── Resources
 ├── Bookings
 └── Settings
```

```text
Booking
 ├── Organization
 ├── Customer
 ├── Staff
 ├── Service
 ├── Location
 ├── Resource
 ├── Start Time
 ├── End Time
 └── Status
```

---

# 14. Authentication Features

Version 1 should include:

- Register
- Login
- Logout
- Session management
- Password hashing
- Email verification
- Forgot password
- Reset password
- Account disabled state
- Secure cookies
- Rate limiting
- Input validation
- Session expiration

Future:

- Two-factor authentication
- Social login
- Passkeys
- Device management

---

# 15. Security Requirements

Security must be included from the beginning.

## Authentication Security

- Strong password hashing
- Secure session handling
- HttpOnly cookies
- Secure cookies in production
- Session expiration
- Login rate limiting
- Password reset token expiration

## Authorization Security

- Backend permission checks
- Organization isolation
- Resource ownership checks
- Default deny policy

## API Security

- Input validation
- Rate limiting
- Security headers
- Request size limits
- File upload validation
- API logging
- Error sanitization

## Database Security

- Parameterized queries / ORM
- Least privilege database account
- Database backups
- Migration tracking
- No secrets stored in source code

## Web Security

Protect against:

- SQL Injection
- XSS
- CSRF
- Broken Access Control
- Session attacks
- Brute-force attacks
- Insecure file uploads
- IDOR
- Tenant data leakage

---

# 16. Audit Log

Important business actions should be recorded.

Example:

```text
User
Action
Entity
Entity ID
Old Value
New Value
Timestamp
IP Address
Organization
```

Example event:

```text
Admin John
Changed Booking #BK001
Status: Confirmed → Cancelled
2026-09-12 10:45
```

---

# 17. Booking Engine Requirements

The booking engine must remain generic.

Each booking should support:

- Organization
- Customer
- Service
- Staff
- Location
- Resource
- Start time
- End time
- Status
- Notes

---

# 18. Booking Status

Recommended initial statuses:

```text
Pending
Confirmed
Checked In
In Progress
Completed
Cancelled
No Show
```

Statuses should be configurable in future versions.

---

# 19. Booking Conflict Detection

Backend must prevent double booking.

Example:

```text
Staff A already booked:
10:00 - 11:00

New request:
10:30 - 11:30

Result:
Booking Conflict
```

Conflict rules may apply to:

- Staff
- Room
- Equipment
- Resource
- Location

---

# 20. Availability Engine

The system should calculate availability using:

```text
Organization opening hours
Staff working hours
Staff leave
Existing bookings
Service duration
Buffer time
Resource availability
Public holidays
Location availability
```

---

# 21. Staff Module

Initial features:

- Staff profile
- Role
- Department
- Work schedule
- Availability
- Assigned bookings
- Attendance
- Leave
- Tasks
- Commission
- Status

Possible statuses:

```text
Active
Inactive
On Leave
Suspended
```

---

# 22. Customer Module

Initial features:

- Customer profile
- Contact information
- Booking history
- Notes
- Preferences
- Status
- Notification preference

Future:

- Membership
- Loyalty points
- Packages
- Credits
- Customer tags

---

# 23. Service Module

Service should include:

```text
Name
Description
Duration
Price
Category
Status
Required Staff Type
Required Resource
Buffer Time
Organization
```

Examples:

```text
60 Minute Foot Massage
90 Minute Full Body Massage
Consultation
Vehicle Inspection
Hair Treatment
```

---

# 24. Dashboard Design

Use a shared application shell.

```text
AppShell
├── Sidebar
├── Header
├── User Menu
├── Notifications
└── Content
```

Menus should appear according to permissions.

---

# 25. Admin Dashboard

Recommended sections:

```text
Dashboard
Bookings
Calendar
Customers
Staff
Services
Resources
Attendance
Leave
Reports
Roles & Permissions
Audit Logs
Settings
```

---

# 26. Staff Dashboard

Recommended sections:

```text
Dashboard
My Schedule
My Bookings
Customers
Attendance
Leave
Tasks
Commission
Profile
```

---

# 27. Customer Dashboard

Recommended sections:

```text
Home
Book Appointment
My Bookings
Notifications
Profile
```

---

# 28. Web, Desktop and Mobile Strategy

Do not build three independent applications at the beginning.

Phase 1:

```text
Responsive React Web App
        +
PWA
```

Supported:

- Desktop browser
- Laptop
- Tablet
- Android browser
- iPhone browser
- Installable PWA

Later:

```text
React Web Application
        ↓
Tauri 2
        ↓
Windows
macOS
Linux
Android
iOS
```

This minimizes duplicated code.

---

# 29. Responsive Design Requirements

Design for:

```text
Mobile
Tablet
Laptop
Desktop
Large Desktop
```

Important pages must work on small screens.

Examples:

- Login
- Booking
- Calendar
- Staff schedule
- Customer profile
- Dashboard
- Tables
- Forms

---

# 30. Recommended Project Structure

```text
management-platform/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── desktop/
│
├── packages/
│   ├── ui/
│   ├── database/
│   ├── auth/
│   ├── permissions/
│   ├── validation/
│   ├── config/
│   ├── types/
│   └── shared/
│
├── modules/
│   ├── organization/
│   ├── customers/
│   ├── staff/
│   ├── services/
│   ├── booking/
│   ├── scheduling/
│   ├── attendance/
│   ├── leave/
│   ├── reports/
│   └── industries/
│       ├── wellness/
│       ├── clinic/
│       └── workshop/
│
├── docs/
│   ├── architecture.md
│   ├── requirements.md
│   ├── database.md
│   ├── permissions.md
│   └── security.md
│
├── tests/
│
├── docker/
│
├── AGENTS.md
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

# 31. Documentation Required Before Coding

Create these documents before large-scale implementation:

```text
README.md
REQUIREMENTS.md
ARCHITECTURE.md
DATABASE.md
PERMISSIONS.md
SECURITY.md
API.md
AGENTS.md
```

---

# 32. AGENTS.md

Use AGENTS.md to control AI coding behavior.

It should define:

- Architecture rules
- Naming rules
- Folder structure
- Coding standards
- Security rules
- Testing requirements
- Database rules
- Permission rules
- Reusability rules
- What AI must not change without approval

This helps Codex or other coding agents avoid creating inconsistent code.

---

# 33. Development Phases

# Phase 0 — Product Definition

Create:

- Product vision
- Business goals
- User roles
- User stories
- Main modules
- Booking workflow
- Security requirements
- Non-functional requirements

Deliverables:

```text
REQUIREMENTS.md
USER_STORIES.md
```

---

# Phase 1 — Architecture

Decide:

- Monorepo
- React + Vite
- NestJS
- PostgreSQL
- Prisma
- Better Auth
- Docker
- REST API

Deliverables:

```text
ARCHITECTURE.md
AGENTS.md
Folder Structure
```

---

# Phase 2 — Local Development Setup

Install:

- Git
- Node.js
- pnpm
- Docker
- Docker Desktop / Docker Engine
- VS Code
- PostgreSQL container

Create:

```text
docker-compose.yml
.env.example
```

Goal:

```bash
docker compose up
```

should start required infrastructure.

---

# Phase 3 — Database Foundation

Create:

```text
User
Organization
Membership
Role
Permission
RolePermission
Session
AuditLog
```

Add Prisma migrations.

Deliverables:

```text
Database schema
Initial migration
Seed data
```

---

# Phase 4 — Authentication

Implement:

- Register
- Login
- Logout
- Session
- Forgot password
- Reset password
- Email verification
- Disabled accounts

Test authentication thoroughly.

---

# Phase 5 — Authorization

Implement:

```text
Role
Permission
Permission Guard
Organization Guard
Ownership Guard
```

Example tests:

```text
Customer → Admin API = DENIED
Staff → Delete Staff = DENIED
Admin → Manage Staff = ALLOWED
```

---

# Phase 6 — Application Shell

Build reusable UI:

- Sidebar
- Header
- Mobile navigation
- Page container
- Form components
- Table components
- Modal
- Toast
- Error page
- Loading state
- Empty state
- Confirmation dialog

---

# Phase 7 — Organization Module

Implement:

- Organization profile
- Organization settings
- Membership
- Invite user
- Assign role

---

# Phase 8 — Customer Module

Implement:

- Create customer
- Edit customer
- Customer list
- Customer profile
- Search
- Filter
- Booking history

---

# Phase 9 — Staff Module

Implement:

- Staff profile
- Staff list
- Work schedule
- Availability
- Role assignment
- Leave status

---

# Phase 10 — Service Module

Implement:

- Service list
- Category
- Duration
- Price
- Required staff
- Required resource
- Active/inactive

---

# Phase 11 — Booking Engine

Implement:

- Create booking
- Edit booking
- Cancel booking
- Reschedule booking
- Booking status
- Staff assignment
- Resource assignment
- Availability lookup
- Conflict detection
- Calendar view

---

# Phase 12 — Staff Operations

Implement:

- Attendance
- Clock in
- Clock out
- Leave application
- Leave approval
- Task assignment
- Commission foundation

---

# Phase 13 — Wellness Industry Module

Add:

- Therapist display labels
- Treatment
- Massage room
- Commission rules
- Treatment packages

Do not modify core architecture unnecessarily.

---

# Phase 14 — Reporting

Initial reports:

- Daily bookings
- Monthly bookings
- Revenue summary
- Staff performance
- Service popularity
- Customer activity

---

# Phase 15 — Notifications

Start with:

- In-app notifications

Later:

- Email
- SMS
- WhatsApp
- Push notification

Design notification providers as replaceable adapters.

---

# Phase 16 — Security Hardening

Review:

- Authentication
- Authorization
- Rate limiting
- Validation
- Tenant isolation
- File uploads
- Logging
- Error messages
- Secrets
- Cookies
- CORS
- CSRF
- XSS
- SQL injection
- IDOR

---

# Phase 17 — Testing

## Unit Tests

Test individual services.

## Integration Tests

Test:

- Database
- API
- Authentication
- Booking

## Permission Tests

Critical cases:

```text
Customer cannot access another customer's booking

Staff cannot access another organization's data

Admin from Organization A cannot access Organization B

Customer cannot call admin API

Staff cannot modify permissions
```

## Booking Tests

Test:

- Double booking
- Staff leave
- Closed hours
- Invalid time
- Resource conflict

## End-to-End Tests

Use Playwright.

Example:

```text
Register
Login
Book service
Admin confirms booking
Staff views booking
Booking completes
Customer sees completed booking
```

---

# 34. CI/CD

GitHub workflow:

```text
Push / Pull Request
        ↓
Install dependencies
        ↓
Lint
        ↓
Type Check
        ↓
Unit Tests
        ↓
Integration Tests
        ↓
Build
        ↓
Deploy
```

Do not deploy if tests fail.

---

# 35. Git Strategy

Recommended:

```text
main
develop
feature/*
fix/*
```

Example:

```text
feature/auth
feature/booking
feature/staff
feature/permission-system
```

Use Pull Requests even if working alone when major changes are involved.

---

# 36. Environment Configuration

Never commit real secrets.

Use:

```text
.env
```

Commit only:

```text
.env.example
```

Example:

```env
DATABASE_URL=
AUTH_SECRET=
APP_URL=
API_URL=
```

---

# 37. Docker Strategy

Development:

```text
Docker Compose
├── PostgreSQL
├── Redis (later)
└── Optional development services
```

Frontend and backend may run directly during development for faster hot reload, while dependencies run in Docker.

Production can later be fully containerized.

---

# 38. Free / Open-Source Development Tools

Recommended free tools:

```text
VS Code
Git
GitHub
Node.js
TypeScript
React
Vite
NestJS
PostgreSQL
Prisma
Better Auth
Tailwind CSS
shadcn/ui
Zod
TanStack Query
Docker
Docker Compose
Vitest
Playwright
Swagger / OpenAPI
```

---

# 39. Zero-Cost Strategy

Goal:

```text
Development = RM0
Local database = RM0
Source control = RM0
Local testing = RM0
Demo hosting = RM0 where available
```

Important:

Commercial production hosting cannot realistically be guaranteed to remain free forever.

Future costs may include:

- Domain
- VPS
- Database hosting
- Storage
- Backups
- Email
- SMS
- WhatsApp
- Monitoring
- High traffic

Design the application so infrastructure providers can be replaced.

Avoid vendor lock-in.

---

# 40. Initial Deployment Strategy

For development/demo:

```text
Frontend
→ Free static hosting / edge platform

Backend
→ Free development hosting where available

Database
→ Free PostgreSQL tier or self-hosted PostgreSQL
```

For production later:

```text
VPS
        ↓
Docker
        ↓
Reverse Proxy
        ↓
Frontend
Backend
PostgreSQL
Redis
```

---

# 41. Scalability Strategy

Do not prematurely build:

```text
Microservices
Kubernetes
Kafka
Complex distributed systems
```

Start with:

```text
Modular Monolith
```

Scale in stages:

## Stage 1

```text
Single API
Single PostgreSQL
```

## Stage 2

Add:

```text
Redis
Background Jobs
CDN
Object Storage
```

## Stage 3

If required:

```text
Separate Notification Service
Separate Reporting Service
Separate Worker Service
Database Replicas
```

Only split services when actual load requires it.

---

# 42. Performance Requirements

Plan for:

- Pagination
- Database indexes
- Query optimization
- API caching
- Lazy loading
- Code splitting
- Image optimization
- Background jobs
- Rate limiting
- Search optimization

---

# 43. Backup Strategy

Production must eventually include:

- Automated database backups
- Offsite backups
- Restore testing
- Versioned migrations
- File backups

Never assume hosting provider backups are sufficient.

---

# 44. Logging and Monitoring

Record:

- API errors
- Authentication failures
- Permission failures
- Background job failures
- Database issues
- Critical business actions

Later add monitoring tools if required.

---

# 45. Reusability Rules

Every feature should be evaluated before implementation.

Ask:

```text
Is this Core?
or
Is this Industry-specific?
```

Core example:

```text
Booking
Staff
Customer
Service
Authentication
Permission
```

Industry-specific example:

```text
Massage package
Medical prescription
Vehicle registration number
```

Industry-specific logic should not pollute core modules.

---

# 46. Configuration-Driven Design

Where practical, use configuration rather than hard-coded business assumptions.

Example:

Instead of:

```text
Role = Therapist
```

Use:

```text
Staff type configured as Therapist
```

Instead of:

```text
Massage Room
```

Use:

```text
Resource
displayName = Massage Room
```

This improves reusability.

---

# 47. First MVP Scope

Do not build everything immediately.

Version 1 MVP should contain:

## Core

- Login
- Register
- Authentication
- Organization
- Admin / Staff / Customer roles
- Permission system
- User management
- Customer management
- Staff management
- Service management
- Booking
- Calendar
- Availability
- Booking conflict detection
- Responsive UI
- Audit log foundation

## Wellness

- Therapist
- Massage treatment
- Massage room
- Basic commission field

---

# 48. Features to Delay Until Later

Do not prioritize initially:

- Full accounting
- Payroll
- Complex inventory
- CRM automation
- AI chatbot
- Advanced analytics
- Multi-language engine
- Complex workflow builder
- Mobile app store release
- Microservices
- Kubernetes
- Advanced billing SaaS system

Build the reusable foundation first.

---

# 49. Recommended First Development Milestones

## Milestone 1 — Foundation

Complete:

- Repository
- Monorepo
- Docker
- PostgreSQL
- NestJS
- React
- Prisma
- Basic CI

Success criteria:

```text
Frontend loads
Backend responds
Database connects
```

---

## Milestone 2 — Identity

Complete:

- User
- Organization
- Membership
- Authentication
- Sessions

Success criteria:

```text
User can register
User can login
User can logout
```

---

## Milestone 3 — Permissions

Complete:

- Roles
- Permissions
- Guards
- Protected routes

Success criteria:

```text
Admin, Staff and Customer see different allowed features
Unauthorized API access returns 403
```

---

## Milestone 4 — Business Foundation

Complete:

- Customer
- Staff
- Service

Success criteria:

```text
Admin can manage core business entities
```

---

## Milestone 5 — Booking

Complete:

- Booking
- Availability
- Schedule
- Conflict detection
- Calendar

Success criteria:

```text
Customer can book
Admin can manage booking
Staff can see assigned booking
Double booking is prevented
```

---

## Milestone 6 — Wellness

Complete:

- Treatment
- Therapist
- Room
- Commission

Success criteria:

```text
System can operate as a real basic massage booking system
```

---

## Milestone 7 — Production Readiness

Complete:

- Security review
- Testing
- CI/CD
- Logs
- Backup strategy
- Deployment
- Documentation

---

# 50. Definition of Done

A feature is not considered finished until it includes:

- Functional implementation
- Permission check
- Validation
- Error handling
- Tests
- Responsive UI
- Database migration if required
- Documentation update
- No hard-coded secrets
- Tenant isolation check

---

# 51. Development Rule for AI / Codex

Do not ask AI:

```text
Create the entire management system.
```

Instead use small controlled tasks.

Example:

```text
Create the Organization module following ARCHITECTURE.md.

Requirements:
- Do not change unrelated modules.
- Follow existing permission guards.
- Every query must include organization isolation.
- Add tests.
- Update API documentation.
```

This produces much cleaner code.

---

# 52. Recommended Development Order

Final recommended order:

```text
1. Requirements
2. Architecture
3. Repository / Monorepo
4. Docker / Local Environment
5. Database
6. Authentication
7. Organization
8. Roles
9. Permissions
10. Shared UI
11. Customer
12. Staff
13. Service
14. Scheduling
15. Booking
16. Availability
17. Conflict Detection
18. Wellness Module
19. Attendance
20. Leave
21. Commission
22. Reports
23. Notifications
24. Security Hardening
25. Testing
26. PWA
27. CI/CD
28. Deployment
29. Tauri Desktop / Mobile if needed
30. Extract reusable Core Platform V1
```

---

# 53. Final Product Architecture

```text
                  ┌─────────────────┐
                  │   React Web     │
                  │   + PWA         │
                  └────────┬────────┘
                           │
               Future Tauri Wrapper
                           │
                  ┌────────▼────────┐
                  │    REST API     │
                  │    NestJS       │
                  └────────┬────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
 Authentication      Authorization     Organization
          │                │                │
          └────────────────┼────────────────┘
                           │
        ┌──────────────────┼───────────────────┐
        │                  │                   │
     Customer            Staff              Service
        │                  │                   │
        └──────────────────┼───────────────────┘
                           │
                        Booking
                           │
                      Scheduling
                           │
                     Availability
                           │
                   Industry Modules
                           │
              ┌────────────┼────────────┐
              │            │            │
           Wellness      Clinic      Workshop
                           │
                    PostgreSQL
```

---

# 54. Long-Term Vision

The end goal is not:

```text
Massage Management System
```

The goal is:

```text
Reusable Management Platform
        │
        ├── Booking Module
        ├── Customer Module
        ├── Staff Module
        ├── Scheduling Module
        ├── Attendance Module
        ├── Reporting Module
        └── Industry Modules
```

Example deployment:

```text
Management Platform
+
Wellness Module
=
Massage Business System
```

```text
Management Platform
+
Clinic Module
=
Clinic Management System
```

```text
Management Platform
+
Workshop Module
=
Workshop Management System
```

The reusable core should continue improving while industry modules remain isolated.

---

# 55. Immediate Next Step

Before implementing business features, create the following project documents:

```text
README.md
REQUIREMENTS.md
ARCHITECTURE.md
DATABASE.md
PERMISSIONS.md
SECURITY.md
AGENTS.md
```

Then initialize:

```text
React + Vite
NestJS
PostgreSQL
Prisma
Better Auth
Tailwind CSS
shadcn/ui
Docker
pnpm Workspace
Git
GitHub
```

After that, begin with:

```text
Organization
User
Membership
Authentication
Role
Permission
```

Only after the foundation is working should development move to:

```text
Customer
Staff
Service
Booking
```

---

# 56. Main Principle

Throughout development, follow this rule:

> **Build the platform once. Configure or extend it for each industry.**

The first customer is a wellness / massage business.

The second customer should not require rebuilding the entire application.

The system should evolve into a reusable, modular, secure and scalable management platform.
