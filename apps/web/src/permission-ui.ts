export type PermissionDisplay = { label: string; description: string; group: string };

export const permissionGroups: Record<string, string> = {
  booking: 'Bookings', customer: 'Customers', staff: 'Staff', service: 'Services',
  resource: 'Resources', location: 'Locations', attendance: 'Attendance', leave: 'Leave',
  payment: 'Payments', commission: 'Commission', report: 'Reports', organization: 'Settings',
  audit: 'Audit', role: 'Roles & Permissions',
};

// Display metadata only. API permission keys remain the identifiers sent to the server.
const metadata: Record<string, readonly [string, string]> = {
  'booking.create.own': ['Create own booking', 'Book an appointment for yourself.'],
  'booking.create.all': ['Create booking for customers', 'Create bookings on behalf of customers.'],
  'booking.read.own': ['View own bookings', 'See your own bookings.'],
  'booking.read.assigned': ['View assigned bookings', 'See bookings assigned to you.'],
  'booking.read.all': ['View all bookings', 'See all bookings in this organization.'],
  'booking.update.own': ['Update own booking', 'Change your own booking details.'],
  'booking.update.assigned': ['Update assigned bookings', 'Change bookings assigned to you.'],
  'booking.update.all': ['Update any booking', 'Change bookings in this organization.'],
  'booking.cancel.own': ['Cancel own booking', 'Cancel your own booking.'],
  'booking.cancel.all': ['Cancel any booking', 'Cancel bookings in this organization.'],
  'booking.reschedule.own': ['Reschedule own booking', 'Reschedule your own booking.'],
  'booking.reschedule.all': ['Reschedule any booking', 'Reschedule bookings in this organization.'],
  'booking.assign_staff': ['Assign staff to booking', 'Assign staff members to a booking.'],
  'booking.assign_resource': ['Assign resources to booking', 'Assign rooms or equipment to a booking.'],
  'booking.status.update': ['Update booking status', 'Mark a booking as checked in, completed, or no-show.'],
  'customer.create': ['Create customer', 'Add a customer profile.'],
  'customer.read.own': ['View own customer profile', 'See your own customer profile.'],
  'customer.read.assigned': ['View assigned customers', 'See customers assigned to you.'],
  'customer.read.all': ['View all customers', 'See customer records in this organization.'],
  'customer.update.own': ['Update own customer profile', 'Change your own customer details.'],
  'customer.update.all': ['Update any customer', 'Change customer details in this organization.'],
  'staff.read.own': ['View own staff profile', 'See your own staff profile.'],
  'staff.read.all': ['View all staff', 'See staff profiles in this organization.'],
  'staff.create': ['Create staff', 'Add a staff profile.'],
  'staff.update.own': ['Update own staff profile', 'Change your own staff details.'],
  'staff.update.all': ['Update any staff', 'Change staff details in this organization.'],
  'staff.invite': ['Invite staff', 'Send an invitation to a staff member.'],
  'staff.schedule.manage': ['Manage staff schedules', 'Set staff working schedules.'],
  'service.read': ['View services', 'See available services.'],
  'service.create': ['Create service', 'Add a service to the catalog.'],
  'service.update': ['Update services', 'Change service details.'],
  'service.disable': ['Disable services', 'Make a service unavailable for new bookings.'],
  'service.category.manage': ['Manage service categories', 'Organize services into categories.'],
  'service.commission.manage': ['Manage service commission settings', 'Set commission options for services.'],
  'location.read': ['View locations', 'See organization locations.'],
  'location.create': ['Create location', 'Add a location.'],
  'location.update': ['Update locations', 'Change location details.'],
  'location.disable': ['Disable locations', 'Make a location inactive.'],
  'resource.read': ['View resources', 'See rooms and equipment.'],
  'resource.create': ['Create resource', 'Add a room or equipment.'],
  'resource.update': ['Update resources', 'Change resource details.'],
  'resource.disable': ['Disable resources', 'Make a resource unavailable.'],
  'resource.type.manage': ['Manage resource types', 'Organize rooms and equipment by type.'],
  'attendance.clock.own': ['Clock in or out', 'Record your own attendance.'],
  'attendance.read.own': ['View own attendance', 'See your own attendance records.'],
  'attendance.read.all': ['View all attendance', 'See staff attendance records.'],
  'attendance.adjust': ['Adjust attendance', 'Correct an attendance record.'],
  'leave.create.own': ['Submit leave request', 'Request leave for yourself.'],
  'leave.read.own': ['View own leave requests', 'See your own leave requests.'],
  'leave.read.all': ['View all leave requests', 'See staff leave requests.'],
  'leave.cancel.own': ['Cancel own leave request', 'Withdraw your own leave request.'],
  'leave.review': ['Approve or reject leave', 'Review staff leave requests.'],
  'leave.type.manage': ['Manage leave types', 'Set the types of leave staff can request.'],
  'payment.read.own': ['View own payments', 'See payments for your own bookings.'],
  'payment.read.all': ['View all payments', 'See payment records in this organization.'],
  'payment.record': ['Record payment', 'Record a payment for a booking.'],
  'payment.status.manage': ['Manage payment status', 'Update the payment status of a booking.'],
  'commission.rule.manage': ['Manage commission rules', 'Set rules for calculating commission.'],
  'commission.read.own': ['View own commission', 'See your own commission records.'],
  'commission.read.all': ['View all commission records', 'See staff commission records.'],
  'report.view': ['View reports', 'Open organization reports.'],
  'report.read.operations': ['View operational reports', 'See booking and operations reports.'],
  'report.read.finance': ['View financial reports', 'See sales and finance reports.'],
  'report.export': ['Export reports', 'Download report data.'],
  'organization.read': ['View organization settings', 'See organization details and settings.'],
  'organization.update': ['Update organization details', 'Change organization information.'],
  'organization.settings.manage': ['Manage organization settings', 'Change organization-wide settings.'],
  'audit.read': ['View audit log', 'See recorded changes and actions.'],
  'role.read': ['View roles and permissions', 'See organization roles and their permissions.'],
  'role.create': ['Create roles', 'Add an organization role.'],
  'role.update': ['Update roles', 'Change role details or member assignments.'],
  'role.archive': ['Archive roles', 'Deactivate a role without deleting its history.'],
  'role.permission.manage': ['Manage role permissions', 'Choose which permissions a role receives.'],
};

export function permissionUi(key: string, module = key.split('.')[0]): PermissionDisplay {
  const entry = metadata[key];
  if (entry) {
    const display = language() === 'zh' ? permissionZh[key] ?? entry : entry;
    return { label: display[0], description: display[1], group: t(permissionGroups[module] ?? 'Other / System') };
  }
  const words = key.split('.').filter(Boolean).join(' ').replaceAll('_', ' ');
  return { label: words.replace(/^./, (letter) => letter.toUpperCase()) || t('Unknown permission'), description: t('Permission description is not available yet.'), group: t(permissionGroups[module] ?? 'Other / System') };
}

export function matchesPermissionSearch(key: string, module: string, search: string): boolean {
  const query = search.toLowerCase().trim();
  if (!query) return true;
  const display = permissionUi(key, module);
  return `${display.label} ${display.description} ${key}`.toLowerCase().includes(query);
}
import { language, t } from './i18n.js';
import { permissionZh } from './permission-zh.js';
