import { errorMessages, isApplicationErrorCode } from '../security/error-codes.js';

export type ApiLanguage = 'zh' | 'en';
export function resolveLanguage(header: string | string[] | undefined): ApiLanguage {
  const first = Array.isArray(header) ? header[0] : header;
  return /^zh(?:-|,|;|$)/i.test(first?.trim() ?? '') ? 'zh' : 'en';
}

const chineseErrors: Record<keyof typeof errorMessages, string> = {
  AUTH_INVALID_CREDENTIALS: '电子邮件或密码不正确。',
  AUTH_SESSION_EXPIRED: '会话已过期，请重新登录。',
  AUTH_ACCOUNT_INACTIVE: '账号目前未启用，请联系管理员。',
  AUTH_ACCESS_DENIED: '您没有执行此操作的权限。',
  VALIDATION_INVALID_REQUEST: '请检查输入内容后重试。',
  BOOKING_SLOT_UNAVAILABLE: '该时段已不可预约，请选择其他时间。',
  BOOKING_OUTSIDE_OPENING_HOURS: '所选时间不在机构营业时间内。',
  BOOKING_INSUFFICIENT_STAFF: '该时段没有足够的可用员工。',
  BOOKING_RESOURCE_UNAVAILABLE: '该时段所需资源不可用。',
  BOOKING_NOT_FOUND: '找不到预约。',
  BOOKING_NOT_OWNED: '您无权访问此预约。',
  BOOKING_INVALID_STATUS: '只有已确认的预约才能执行此操作。',
  BOOKING_CANCELLATION_DISABLED: '目前不允许顾客取消预约。',
  BOOKING_CANCELLATION_CUTOFF: '已超过取消预约的截止时间。',
  BOOKING_RESCHEDULE_DISABLED: '目前不允许顾客改期。',
  BOOKING_RESCHEDULE_CUTOFF: '已超过预约改期的截止时间。',
  BOOKING_RESCHEDULE_LIMIT: '此预约已达到改期次数上限。',
  STAFF_INACTIVE: '此员工已停用。',
  STAFF_NOT_AVAILABLE: '此员工在所选时间不可用。',
  STAFF_ON_LEAVE: '此员工在所选时间正在请假。',
  STAFF_ASSIGNMENT_CONFLICT: '此员工在所选时间已有其他工作分配。',
  STAFF_ASSIGNMENT_LIMIT: '每项预约服务只能分配一名员工。',
  STAFF_CROSS_TENANT: '所选员工不属于此机构。',
  RESOURCE_INACTIVE: '此资源已停用。',
  RESOURCE_UNAVAILABLE: '此资源在所选时间不可用。',
  RESOURCE_CONFLICT: '此资源在所选时间已被占用。',
  RESOURCE_TYPE_MISMATCH: '此资源不符合所需资源类型。',
  RESOURCE_CAPACITY_INSUFFICIENT: '此资源容量不足。',
  ATTENDANCE_ALREADY_CLOCKED_IN: '您已打卡上班。',
  ATTENDANCE_NO_ACTIVE_CLOCK_IN: '找不到有效的上班打卡记录。',
  ATTENDANCE_INVALID_CLOCK_OUT: '下班时间必须晚于上班时间。',
  ATTENDANCE_ACCESS_DENIED: '您无权访问此考勤记录。',
  LEAVE_INVALID_RANGE: '请假开始时间必须早于结束时间。',
  LEAVE_ALREADY_REVIEWED: '此请假申请已审核。',
  LEAVE_NOT_FOUND: '找不到请假申请。',
  LEAVE_ACCESS_DENIED: '您无权访问此请假申请。',
  LEAVE_ASSIGNMENT_CONFLICT: '此请假申请与现有预约工作分配冲突。',
  PAYMENT_INVALID_AMOUNT: '付款金额必须大于零。',
  PAYMENT_INVALID_CURRENCY: '请输入有效的货币代码。',
  PAYMENT_BOOKING_NOT_FOUND: '找不到此付款对应的预约。',
  PAYMENT_ACCESS_DENIED: '您无权管理此预约的付款。',
  COMMISSION_INVALID_AMOUNT: '佣金金额必须大于零。',
  COMMISSION_BOOKING_NOT_COMPLETED: '预约完成后才能记录佣金。',
  COMMISSION_STAFF_NOT_ASSIGNED: '只有已分配至此服务的员工才能获得佣金。',
  COMMISSION_ACCESS_DENIED: '您无权访问此佣金记录。',
  SETTINGS_INVALID_TIMEZONE: '请选择有效的时区。',
  SETTINGS_INVALID_CURRENCY: '请输入有效的货币代码。',
  SETTINGS_INVALID_BOOKING_PREFIX: '预约编号前缀只能包含字母、数字和连字符。',
  SETTINGS_INVALID_POLICY: '一项或多项预约规则无效。',
  SETTINGS_ACCESS_DENIED: '您无权更改这些设置。',
  ROLE_NOT_FOUND: '找不到角色。',
  ROLE_NAME_DUPLICATE: '同名角色已存在。',
  ROLE_INACTIVE: '此角色已停用。',
  ROLE_CROSS_TENANT: '此角色不属于当前机构。',
  ROLE_IN_USE: '此角色已分配给成员。',
  ROLE_SELF_LOCKOUT: '此更改会移除您管理角色和权限的能力。',
  PERMISSION_INVALID: '一项或多项所选权限无效。',
  MEMBERSHIP_NOT_FOUND: '找不到成员关系。',
  ROLE_ASSIGNMENT_INVALID: '无法将此角色分配给所选成员。',
  BUSINESS_NOT_FOUND: '找不到所需记录。',
  BUSINESS_DUPLICATE: '相同资料的记录已存在。',
  BUSINESS_INVALID_RELATIONSHIP: '所选关联记录不属于此机构。',
  INVITE_INVALID: '此邀请无效。',
  STAFF_ROLE_REQUIRED: '创建员工账号邀请前请选择角色。',
  STAFF_EMAIL_REQUIRED: '创建账号邀请前请输入电子邮件。',
  STAFF_ACCOUNT_ALREADY_LINKED: '此员工资料已绑定启用中的账号。',
  INVITE_ALREADY_ACTIVE: '此员工已有有效邀请。',
  INVITE_EXPIRED: '邀请已过期，请申请新邀请。',
  INVITE_USED: '此邀请已使用。',
  INVITE_REVOKED: '此邀请已撤销。',
  RATE_LIMITED: '请求过于频繁，请稍后重试。',
  INTERNAL_ERROR: '发生错误，请重试。',
};

export function localizeError(code: string, language: ApiLanguage): string {
  if (language === 'zh') return isApplicationErrorCode(code) ? chineseErrors[code] : code === 'HTTP_404' ? '找不到所需资源。' : '请求无法完成。';
  return isApplicationErrorCode(code) ? errorMessages[code] : code === 'HTTP_404' ? 'The requested resource was not found.' : 'The request could not be completed.';
}

const notices: Record<string, { en: [string, string]; zh: [string, string] }> = {
  'booking.cancelled': { en: ['Booking cancelled', 'A booking has been cancelled.'], zh: ['预约已取消', '一项预约已取消。'] },
  'booking.rescheduled': { en: ['Booking rescheduled', 'A booking schedule has changed.'], zh: ['预约已改期', '一项预约的时间已更改。'] },
  'booking.created': { en: ['Booking update', 'A booking update is available.'], zh: ['预约更新', '一项预约有新动态。'] },
  'booking.status.changed': { en: ['Booking update', 'A booking update is available.'], zh: ['预约更新', '一项预约有新动态。'] },
  'payment.status.changed': { en: ['Booking update', 'A booking update is available.'], zh: ['预约更新', '一项预约有新动态。'] },
  'booking.staff.assigned': { en: ['Booking assignment', 'You have been assigned to a booking service.'], zh: ['预约工作分配', '您已被分配至一项预约服务。'] },
  'commission.recorded': { en: ['Commission recorded', 'A commission record is available.'], zh: ['佣金已记录', '您有一项新的佣金记录。'] },
  'leave.reviewed': { en: ['Leave request update', 'Your leave request has been reviewed.'], zh: ['请假申请更新', '您的请假申请已审核。'] },
  'leave.submitted': { en: ['Leave request submitted', 'A leave request needs review.'], zh: ['已提交请假申请', '有一项请假申请等待审核。'] },
  'leave.conflict.detected': { en: ['Leave conflict', 'A leave request conflicts with assigned work.'], zh: ['请假冲突', '一项请假申请与已分配工作冲突。'] },
};
export function notificationText(type: string, language: ApiLanguage): { title: string; message: string } | undefined {
  const key = type.startsWith('booking.cancelled.') ? 'booking.cancelled' : type.startsWith('booking.rescheduled.') ? 'booking.rescheduled' : type;
  const pair = notices[key]?.[language];
  return pair ? { title: pair[0], message: pair[1] } : undefined;
}

const csvLabels: Record<string, string> = {
  bookingId: '预约 ID', bookingNumber: '预约编号', startDateTime: '开始时间', endDateTime: '结束时间',
  status: '状态', paymentStatus: '付款状态', durationMinutes: '时长（分钟）',
  paymentId: '付款 ID', amountMinor: '金额（最小货币单位）', currency: '货币', paymentMethod: '付款方式', paidAt: '付款时间',
  commissionId: '佣金 ID', bookingServiceId: '预约服务 ID', serviceId: '服务 ID', staffId: '员工 ID', recordedAt: '记录时间',
  attendanceId: '考勤 ID', workDate: '工作日期', clockInAt: '上班打卡时间', clockOutAt: '下班打卡时间', recordedDurationMs: '记录时长（毫秒）',
  leaveRequestId: '请假申请 ID', leaveTypeId: '请假类型 ID',
};
export function csvColumn(key: string, language: ApiLanguage): { key: string; label: string } {
  return { key, label: language === 'zh' ? csvLabels[key] ?? key : key };
}
export function csvFilename(name: string, language: ApiLanguage): string {
  const names: Record<string, string> = { bookings: '预约', payments: '付款', commissions: '佣金', attendance: '考勤', leave: '请假' };
  return `${language === 'zh' ? names[name] ?? name : name}.csv`;
}
