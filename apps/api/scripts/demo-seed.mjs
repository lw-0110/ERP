import { seedCore } from '../../../packages/database/prisma/seed-core.mjs';
import { ensureUser, prisma } from './auth-runtime.mjs';

if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is forbidden in production.');
if (process.env.DEMO_SEED_ENABLED !== 'true') throw new Error('Set DEMO_SEED_ENABLED=true to seed synthetic demo data.');
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; };
const passwords = { admin: required('DEMO_ADMIN_PASSWORD'), staff: required('DEMO_STAFF_PASSWORD'), customer: required('DEMO_CUSTOMER_PASSWORD') };
for (const password of Object.values(passwords)) if (password.length < 8) throw new Error('Demo passwords must contain at least 8 characters.');
try {
  const { organization, roles } = await seedCore(prisma, required('DEMO_ORGANIZATION_SLUG'), required('DEMO_ORGANIZATION_NAME'));
  const users = {
    admin: await ensureUser('admin@demo.example.test', 'Demo Admin', passwords.admin),
    staffA: await ensureUser('staff.one@demo.example.test', 'Demo Staff One', passwords.staff),
    staffB: await ensureUser('staff.two@demo.example.test', 'Demo Staff Two', passwords.staff),
    customerA: await ensureUser('customer.one@demo.example.test', 'Demo Customer One', passwords.customer),
    customerB: await ensureUser('customer.two@demo.example.test', 'Demo Customer Two', passwords.customer),
  };
  for (const [key, user] of Object.entries(users)) { const role = key === 'admin' ? roles.Admin : key.startsWith('staff') ? roles.Staff : roles.Customer; await prisma.membership.upsert({ where: { userId_organizationId: { userId: user.id, organizationId: organization.id } }, update: { roleId: role.id, status: 'ACTIVE' }, create: { userId: user.id, organizationId: organization.id, roleId: role.id, status: 'ACTIVE' } }); }
  const skillA = await prisma.skill.upsert({ where: { organizationId_name: { organizationId: organization.id, name: 'Relaxation Therapy' } }, update: {}, create: { organizationId: organization.id, name: 'Relaxation Therapy' } });
  const skillB = await prisma.skill.upsert({ where: { organizationId_name: { organizationId: organization.id, name: 'Deep Tissue' } }, update: {}, create: { organizationId: organization.id, name: 'Deep Tissue' } });
  const staff = [];
  for (const [index, data] of [[users.staffA, 'DEMO-S01', 'Demo Staff One'], [users.staffB, 'DEMO-S02', 'Demo Staff Two']].entries()) {
    const [user, employeeCode, displayName] = data;
    const profile = await prisma.staffProfile.upsert({ where: { organizationId_employeeCode: { organizationId: organization.id, employeeCode } }, update: { userId: user.id }, create: { organizationId: organization.id, userId: user.id, employeeCode, displayName, email: user.email, phone: `+6000000000${index + 1}` } });
    staff.push(profile);
    const skillId = index === 0 ? skillA.id : skillB.id;
    await prisma.staffSkill.upsert({ where: { staffId_skillId: { staffId: profile.id, skillId } }, update: {}, create: { staffId: profile.id, skillId } });
    for (const dayOfWeek of [1,2,3,4,5]) await prisma.staffWorkingSchedule.upsert({ where: { staffId_dayOfWeek: { staffId: profile.id, dayOfWeek } }, update: {}, create: { organizationId: organization.id, staffId: profile.id, dayOfWeek, startTime: index === 0 ? '09:00' : '10:00', endTime: index === 0 ? '17:00' : '18:00' } });
  }
  const customers = [];
  for (const [index, user] of [users.customerA, users.customerB].entries()) customers.push(await prisma.customerProfile.upsert({ where: { organizationId_userId: { organizationId: organization.id, userId: user.id } }, update: {}, create: { organizationId: organization.id, userId: user.id, firstName: 'Demo', lastName: `Customer ${index + 1}`, displayName: `Demo Customer ${index + 1}`, email: user.email, phone: `+60110000000${index + 1}` } }));
  const category = await prisma.serviceCategory.upsert({ where: { organizationId_name: { organizationId: organization.id, name: 'Demo Treatments' } }, update: {}, create: { organizationId: organization.id, name: 'Demo Treatments' } });
  const service = await prisma.service.upsert({ where: { organizationId_name: { organizationId: organization.id, name: 'Demo Relaxation Session' } }, update: {}, create: { organizationId: organization.id, categoryId: category.id, name: 'Demo Relaxation Session', durationMinutes: 60, bufferBeforeMinutes: 10, bufferAfterMinutes: 10, priceMinor: 12000, currency: 'MYR', requiredStaffCount: 1 } });
  await prisma.serviceRequiredSkill.upsert({ where: { serviceId_skillId: { serviceId: service.id, skillId: skillA.id } }, update: {}, create: { serviceId: service.id, skillId: skillA.id } });
  const resourceType = await prisma.resourceType.upsert({ where: { organizationId_name: { organizationId: organization.id, name: 'Demo Treatment Room' } }, update: {}, create: { organizationId: organization.id, name: 'Demo Treatment Room' } });
  await prisma.serviceRequiredResourceType.upsert({ where: { serviceId_resourceTypeId: { serviceId: service.id, resourceTypeId: resourceType.id } }, update: {}, create: { serviceId: service.id, resourceTypeId: resourceType.id, requiredCount: 1 } });
  await prisma.resource.upsert({ where: { organizationId_name: { organizationId: organization.id, name: 'Demo Room 1' } }, update: {}, create: { organizationId: organization.id, resourceTypeId: resourceType.id, name: 'Demo Room 1', code: 'DEMO-R1', capacity: 1 } });
  for (const dayOfWeek of [1,2,3,4,5,6]) await prisma.organizationOpeningHour.upsert({ where: { organizationId_dayOfWeek: { organizationId: organization.id, dayOfWeek } }, update: {}, create: { organizationId: organization.id, dayOfWeek, openTime: '09:00', closeTime: '19:00' } });
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 7); future.setUTCHours(3,0,0,0);
  const booking = await prisma.booking.upsert({ where: { organizationId_bookingNumber: { organizationId: organization.id, bookingNumber: 'DEMO-FUTURE-001' } }, update: {}, create: { organizationId: organization.id, customerId: customers[0].id, bookingNumber: 'DEMO-FUTURE-001', startDateTime: future, endDateTime: new Date(future.getTime() + 80 * 60_000), createdByUserId: users.customerA.id, services: { create: { serviceId: service.id, unitPriceMinorSnapshot: 12000, currencySnapshot: 'MYR', durationMinutesSnapshot: 60, bufferBeforeMinutesSnapshot: 10, bufferAfterMinutesSnapshot: 10, requiredStaffCountSnapshot: 1, requiredSkillIdsSnapshot: [skillA.id], requiredSkillCountsSnapshot: [{ skillId: skillA.id, requiredCount: 1 }], requiredResourceTypeCountsSnapshot: [{ resourceTypeId: resourceType.id, requiredCount: 1 }], quantity: 1, lineTotalMinor: 12000, sortOrder: 0 } } } });
  const line = await prisma.bookingService.findFirstOrThrow({ where: { bookingId: booking.id } });
  const existingAssignment = await prisma.bookingStaff.findFirst({ where: { bookingServiceId: line.id, staffId: staff[0].id, status: 'ACTIVE' } });
  if (!existingAssignment) await prisma.bookingStaff.create({ data: { bookingServiceId: line.id, staffId: staff[0].id, assignedByUserId: users.admin.id } });
  const past = new Date(); past.setUTCDate(past.getUTCDate() - 14); past.setUTCHours(3,0,0,0);
  const completed = await prisma.booking.upsert({ where: { organizationId_bookingNumber: { organizationId: organization.id, bookingNumber: 'DEMO-COMPLETED-001' } }, update: {}, create: { organizationId: organization.id, customerId: customers[1].id, bookingNumber: 'DEMO-COMPLETED-001', startDateTime: past, endDateTime: new Date(past.getTime() + 80 * 60_000), status: 'COMPLETED', paymentStatus: 'PAID', createdByUserId: users.customerB.id, services: { create: { serviceId: service.id, unitPriceMinorSnapshot: 12000, currencySnapshot: 'MYR', durationMinutesSnapshot: 60, bufferBeforeMinutesSnapshot: 10, bufferAfterMinutesSnapshot: 10, requiredStaffCountSnapshot: 1, requiredSkillIdsSnapshot: [skillA.id], requiredSkillCountsSnapshot: [{ skillId: skillA.id, requiredCount: 1 }], requiredResourceTypeCountsSnapshot: [{ resourceTypeId: resourceType.id, requiredCount: 1 }], quantity: 1, lineTotalMinor: 12000, sortOrder: 0 } } } });
  const completedLine = await prisma.bookingService.findFirstOrThrow({ where: { bookingId: completed.id } });
  if (!(await prisma.bookingStaff.findFirst({ where: { bookingServiceId: completedLine.id, staffId: staff[0].id, status: 'ACTIVE' } }))) await prisma.bookingStaff.create({ data: { bookingServiceId: completedLine.id, staffId: staff[0].id, assignedByUserId: users.admin.id } });
  if (!(await prisma.paymentRecord.findFirst({ where: { organizationId: organization.id, reference: 'DEMO-PAYMENT-001' } }))) await prisma.paymentRecord.create({ data: { organizationId: organization.id, bookingId: completed.id, amountMinor: 12000, currency: 'MYR', paymentMethod: 'DEMO_CASH', reference: 'DEMO-PAYMENT-001', paidAt: past, recordedByUserId: users.admin.id } });
  await prisma.commissionRecord.upsert({ where: { bookingServiceId_staffId: { bookingServiceId: completedLine.id, staffId: staff[0].id } }, update: {}, create: { organizationId: organization.id, bookingId: completed.id, bookingServiceId: completedLine.id, staffId: staff[0].id, amountMinor: 1500, currency: 'MYR', sourceSnapshot: { explanation: 'Synthetic UAT-only manual commission' }, recordedByUserId: users.admin.id } });
  const cancelledStart = new Date(past.getTime() - 7 * 24 * 60 * 60_000);
  await prisma.booking.upsert({ where: { organizationId_bookingNumber: { organizationId: organization.id, bookingNumber: 'DEMO-CANCELLED-001' } }, update: {}, create: { organizationId: organization.id, customerId: customers[0].id, bookingNumber: 'DEMO-CANCELLED-001', startDateTime: cancelledStart, endDateTime: new Date(cancelledStart.getTime() + 80 * 60_000), status: 'CANCELLED', cancelledAt: cancelledStart, createdByUserId: users.customerA.id, services: { create: { serviceId: service.id, unitPriceMinorSnapshot: 12000, currencySnapshot: 'MYR', durationMinutesSnapshot: 60, bufferBeforeMinutesSnapshot: 10, bufferAfterMinutesSnapshot: 10, requiredStaffCountSnapshot: 1, requiredSkillIdsSnapshot: [skillA.id], requiredSkillCountsSnapshot: [{ skillId: skillA.id, requiredCount: 1 }], requiredResourceTypeCountsSnapshot: [{ resourceTypeId: resourceType.id, requiredCount: 1 }], quantity: 1, lineTotalMinor: 12000, sortOrder: 0 } } } });
  console.info(`Demo seed complete for ${organization.slug}. Synthetic accounts use explicit local/UAT-only passwords.`);
} finally { await prisma.$disconnect(); }
