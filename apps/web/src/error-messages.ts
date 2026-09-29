export type ApiError = { code?: string; message?: string; requestId?: string; details?: Record<string, string[]> };

const messages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Email or password is incorrect.',
  INVALID_EMAIL_OR_PASSWORD: 'Email or password is incorrect.',
  INVALID_ORIGIN: 'This request could not be verified. Refresh the page and try again.',
  HTTP_404: 'The requested resource was not found.',
  HTTP_400: 'Check the highlighted fields and try again.',
  HTTP_409: 'This change conflicts with existing data. Review the fields and try again.',
  AUTH_SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_ACCOUNT_INACTIVE: 'Your account is not currently active. Please contact your administrator.',
  AUTH_ACCESS_DENIED: 'You do not have permission to perform this action.',
  VALIDATION_INVALID_REQUEST: 'Check the highlighted fields and try again.',
  VALIDATION_REQUIRED_FIELD: 'This field is required.',
  VALIDATION_INVALID_EMAIL: 'Enter a valid email address.',
  BOOKING_SLOT_UNAVAILABLE: 'This time slot is no longer available. Please choose another time.',
  BOOKING_OUTSIDE_OPENING_HOURS: "The selected time is outside the organization's opening hours.",
  BOOKING_INSUFFICIENT_STAFF: 'There are not enough available staff for this time.',
  BOOKING_RESOURCE_UNAVAILABLE: 'A required resource is not available at the selected time.',
  BOOKING_NOT_FOUND: 'Booking not found.',
  BOOKING_NOT_OWNED: 'You do not have access to this booking.',
  BOOKING_INVALID_STATUS: "Only confirmed bookings can use this action.",
  BOOKING_CANCELLATION_DISABLED: 'Customer cancellation is currently disabled.',
  BOOKING_CANCELLATION_CUTOFF: 'This booking can no longer be cancelled because the cancellation cutoff has passed.',
  BOOKING_RESCHEDULE_DISABLED: 'Customer rescheduling is currently disabled.',
  BOOKING_RESCHEDULE_CUTOFF: 'This booking can no longer be rescheduled because the reschedule cutoff has passed.',
  BOOKING_RESCHEDULE_LIMIT: 'You have reached the reschedule limit for this booking.',
  STAFF_INACTIVE: 'This staff member is inactive.',
  STAFF_NOT_AVAILABLE: 'This staff member is not available at the selected time.',
  STAFF_ON_LEAVE: 'This staff member is on leave during the selected time.',
  STAFF_ASSIGNMENT_CONFLICT: 'This staff member already has another assignment during this time.',
  STAFF_ASSIGNMENT_LIMIT: 'Only one staff member can be assigned to a booking service.',
  STAFF_CROSS_TENANT: 'The selected staff member is not available for this organization.',
  RESOURCE_INACTIVE: 'This resource is inactive.',
  RESOURCE_UNAVAILABLE: 'This resource is not available at the selected time.',
  RESOURCE_CONFLICT: 'This resource is already in use during this time.',
  RESOURCE_TYPE_MISMATCH: 'This resource does not match the required resource type.',
  RESOURCE_CAPACITY_INSUFFICIENT: 'This resource does not have enough capacity for this service.',
  ATTENDANCE_ALREADY_CLOCKED_IN: 'You are already clocked in.',
  ATTENDANCE_NO_ACTIVE_CLOCK_IN: 'No active clock-in was found.',
  ATTENDANCE_INVALID_CLOCK_OUT: 'Clock-out time must be after clock-in time.',
  ATTENDANCE_ACCESS_DENIED: 'You do not have access to this attendance record.',
  LEAVE_INVALID_RANGE: 'Leave start time must be earlier than leave end time.',
  LEAVE_ALREADY_REVIEWED: 'This leave request has already been reviewed.',
  LEAVE_NOT_FOUND: 'Leave request not found.',
  LEAVE_ACCESS_DENIED: 'You do not have access to this leave request.',
  LEAVE_ASSIGNMENT_CONFLICT: 'This leave request overlaps an existing booking assignment.',
  PAYMENT_INVALID_AMOUNT: 'Payment amount must be greater than zero.',
  PAYMENT_INVALID_CURRENCY: 'Enter a valid currency code.',
  PAYMENT_BOOKING_NOT_FOUND: 'The booking for this payment could not be found.',
  PAYMENT_ACCESS_DENIED: 'You do not have permission to manage payments for this booking.',
  COMMISSION_INVALID_AMOUNT: 'Commission amount must be greater than zero.',
  COMMISSION_BOOKING_NOT_COMPLETED: 'Commission can only be recorded after the booking is completed.',
  COMMISSION_STAFF_NOT_ASSIGNED: 'Commission can only be recorded for staff assigned to this service.',
  COMMISSION_ACCESS_DENIED: 'You do not have access to this commission record.',
  SETTINGS_INVALID_TIMEZONE: 'Select a valid timezone.',
  SETTINGS_INVALID_CURRENCY: 'Enter a valid currency code.',
  SETTINGS_INVALID_BOOKING_PREFIX: 'Booking prefix may contain only letters, numbers, and hyphens.',
  SETTINGS_INVALID_POLICY: 'One or more booking policy values are invalid.',
  SETTINGS_ACCESS_DENIED: 'You do not have permission to change these settings.',
  ROLE_NOT_FOUND: 'Role not found.',
  ROLE_NAME_DUPLICATE: 'A role with this name already exists.',
  ROLE_INACTIVE: 'This role is inactive.',
  ROLE_CROSS_TENANT: 'This role does not belong to this organization.',
  ROLE_IN_USE: 'This role is currently assigned to one or more members.',
  ROLE_SELF_LOCKOUT: 'This change would remove your ability to manage roles and permissions.',
  PERMISSION_INVALID: 'One or more selected permissions are invalid.',
  MEMBERSHIP_NOT_FOUND: 'Membership not found.',
  ROLE_ASSIGNMENT_INVALID: 'This role cannot be assigned to the selected member.',
  BUSINESS_NOT_FOUND: 'The requested record was not found.',
  BUSINESS_DUPLICATE: 'A record with these details already exists.',
  BUSINESS_INVALID_RELATIONSHIP: 'The selected related record is not valid for this organization.',
  INVITE_INVALID: 'This invitation is invalid.',
  STAFF_ROLE_REQUIRED: 'Select a role before creating the staff account invitation.',
  STAFF_EMAIL_REQUIRED: 'Enter an email address before creating an account invitation.',
  STAFF_ACCOUNT_ALREADY_LINKED: 'This staff profile already has an active account.',
  INVITE_ALREADY_ACTIVE: 'An active invitation already exists for this staff member.',
  INVITE_EXPIRED: 'This invitation has expired. Please request a new invitation.',
  INVITE_USED: 'This invitation has already been used.',
  INVITE_REVOKED: 'This invitation is no longer valid.',
  RATE_LIMITED: 'Too many requests. Please wait and try again.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  NO_ACTIVE_MEMBERSHIP: 'Your account is not currently active. Please contact your administrator.',
};

export function getUserFriendlyError(error: unknown): string {
  if (error && typeof error === 'object') {
    const apiError = error as ApiError;
    if (apiError.code && messages[apiError.code]) return messages[apiError.code];
    if (apiError.details) return messages.VALIDATION_INVALID_REQUEST;
  }
  return 'Something went wrong. Please try again.';
}

export async function readApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null) as ApiError | null;
  return body ?? { code: response.status === 401 ? 'UNAUTHENTICATED' : undefined };
}

export class ApiRequestError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(getUserFriendlyError(apiError));
  }
}
