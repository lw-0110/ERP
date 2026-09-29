import { describe, expect, it } from 'vitest';
import { csv } from '../reporting/csv.js';
import { localizeError, notificationText, resolveLanguage } from './localize.js';

describe('API language selection', () => {
  it('uses Chinese when requested and keeps English for existing clients', () => {
    expect(resolveLanguage('zh-Hans-MY, en;q=0.8')).toBe('zh');
    expect(resolveLanguage('en-MY')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('localizes errors and existing notification events', () => {
    expect(localizeError('STAFF_ASSIGNMENT_LIMIT', 'zh')).toBe('每项预约服务只能分配一名员工。');
    expect(notificationText('booking.staff.assigned', 'zh')?.title).toBe('预约工作分配');
  });

  it('writes translated CSV labels while reading the original row keys', () => {
    const value = csv([{ key: 'bookingNumber', label: '预约编号' }], [{ bookingNumber: '=1+1' }]);
    expect(value).toBe('\uFEFF"预约编号"\r\n"\'=1+1"\r\n');
  });
});
