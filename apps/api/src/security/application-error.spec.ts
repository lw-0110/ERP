import { describe, expect, it } from 'vitest';
import { badRequest, conflict, forbidden, notFound } from './application-error.js';

describe('application error factory', () => {
  it.each([
    [badRequest('PAYMENT_INVALID_AMOUNT'), 400, 'PAYMENT_INVALID_AMOUNT', 'Payment amount must be greater than zero.'],
    [conflict('ATTENDANCE_ALREADY_CLOCKED_IN'), 409, 'ATTENDANCE_ALREADY_CLOCKED_IN', 'You are already clocked in.'],
    [forbidden('BOOKING_CANCELLATION_CUTOFF'), 403, 'BOOKING_CANCELLATION_CUTOFF', 'This booking can no longer be cancelled because the cancellation cutoff has passed.'],
    [notFound('PAYMENT_BOOKING_NOT_FOUND'), 404, 'PAYMENT_BOOKING_NOT_FOUND', 'The booking for this payment could not be found.'],
  ])('returns a stable code and safe message', (exception, status, code, message) => {
    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code, message });
  });
});