# V1 default permission matrix

Authorization is evaluated from active same-tenant `RolePermission` rows, never from role names. Names below describe seed defaults only.

## Admin

The default Admin role receives every platform-defined key in `permission-catalog.ts`, including organization/settings, roles, customer/staff/service/resource management, booking operations, attendance/leave review, finance, reports/exports, and audit.

## Staff

Exactly: `staff.read.own`, `staff.update.own`, `booking.read.assigned`, `booking.update.assigned`, `attendance.clock.own`, `attendance.read.own`, `leave.create.own`, `leave.read.own`, `leave.cancel.own`, and `commission.read.own`.

## Customer

Exactly: `service.read`, `booking.create.own`, `booking.read.own`, `booking.cancel.own`, `booking.reschedule.own`, `customer.read.own`, `customer.update.own`, and `payment.read.own`.

Staff and Customer defaults intentionally have no finance-management, report export, settings, audit, role, or cross-customer access. Archived roles and inactive memberships grant no effective permission.
