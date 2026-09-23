import { describe, expect, it } from 'vitest';
import { getUserFriendlyError } from './error-messages.js';

describe('getUserFriendlyError', () => {
  it('maps stable codes without exposing backend details', () => {
    expect(getUserFriendlyError({ code: 'AUTH_INVALID_CREDENTIALS', message: 'User not found' })).toBe('Email or password is incorrect.');
  });
  it('uses a safe fallback for unknown errors', () => {
    expect(getUserFriendlyError({ code: 'PRISMA_P2002', message: 'database constraint users_email_key' })).toBe('Something went wrong. Please try again.');
  });

  it.each([
    ['BOOKING_INSUFFICIENT_STAFF', 'There are not enough available staff for this time.'],
    ['BOOKING_RESCHEDULE_LIMIT', 'You have reached the reschedule limit for this booking.'],
    ['STAFF_ASSIGNMENT_CONFLICT', 'This staff member already has another assignment during this time.'],
    ['RESOURCE_TYPE_MISMATCH', 'This resource does not match the required resource type.'],
    ['ATTENDANCE_ALREADY_CLOCKED_IN', 'You are already clocked in.'],
    ['LEAVE_INVALID_RANGE', 'Leave start time must be earlier than leave end time.'],
    ['PAYMENT_INVALID_AMOUNT', 'Payment amount must be greater than zero.'],
    ['COMMISSION_BOOKING_NOT_COMPLETED', 'Commission can only be recorded after the booking is completed.'],
    ['SETTINGS_INVALID_TIMEZONE', 'Select a valid timezone.'],
    ['STAFF_ROLE_REQUIRED', 'Select a role before creating the staff account invitation.'],
    ['STAFF_ACCOUNT_ALREADY_LINKED', 'This staff profile already has an active account.'],
    ['INVITE_ALREADY_ACTIVE', 'An active invitation already exists for this staff member.'],
  ])('maps %s to a safe domain message', (code, expected) => {
    expect(getUserFriendlyError({ code })).toBe(expected);
  });
});
