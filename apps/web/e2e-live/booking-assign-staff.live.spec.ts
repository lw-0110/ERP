import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:5173/backend';
const password = 'StrongPassw0rd!';

test('real browser: change, reload, and explicitly unassign isolated booking staff', async ({ page }) => {
  process.env.DATABASE_URL ??= 'postgresql://platform:platform@localhost:5432/platform?schema=public';
  const { prisma } = await import('../../api/src/auth/prisma.js');
  const tag = `live-assignment-${randomUUID()}`;
  const email = `${tag}@example.test`;
  let bookingId = '';
  let serviceId = '';
  let customerId = '';
  let staffIds: string[] = [];
  let userId = '';
  try {
    const signup = await fetch(`${api}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' },
      body: JSON.stringify({ email, name: tag, password }),
    });
    expect(signup.status, await signup.text()).toBe(200);
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: 'development' } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = user.id;
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { organizationId_name: { organizationId: organization.id, name: 'Admin' } } });
    await prisma.membership.update({ where: { userId_organizationId: { userId, organizationId: organization.id } }, data: { roleId: adminRole.id } });
    const mondayHours = await prisma.organizationOpeningHour.findUnique({ where: { organizationId_dayOfWeek: { organizationId: organization.id, dayOfWeek: 1 } } });
    expect(mondayHours?.status).toBe('ACTIVE');
    expect(mondayHours?.openTime <= '11:00' && mondayHours?.closeTime >= '12:00').toBe(true);

    const customer = await prisma.customerProfile.create({ data: { organizationId: organization.id, firstName: 'Live', lastName: 'Assignment', displayName: tag, email, phone: '01100000000' } });
    customerId = customer.id;
    const service = await prisma.service.create({ data: { organizationId: organization.id, name: tag, durationMinutes: 30, priceMinor: 1000, currency: 'MYR', requiredStaffCount: 1 } });
    serviceId = service.id;
    for (const suffix of ['A', 'B']) {
      const staff = await prisma.staffProfile.create({ data: { organizationId: organization.id, employeeCode: `${tag}-${suffix}`, displayName: `${tag}-${suffix}`, email: `${suffix}-${email}`, phone: '01100000000' } });
      staffIds.push(staff.id);
      await prisma.staffWorkingSchedule.create({ data: { organizationId: organization.id, staffId: staff.id, dayOfWeek: 1, startTime: '10:00', endTime: '13:00' } });
    }
    const booking = await prisma.booking.create({
      data: {
        organizationId: organization.id, customerId, bookingNumber: `BK-${tag}`, createdByUserId: userId,
        startDateTime: new Date('2032-01-05T03:00:00.000Z'), endDateTime: new Date('2032-01-05T03:30:00.000Z'),
        services: { create: [{ serviceId, unitPriceMinorSnapshot: 1000, currencySnapshot: 'MYR', durationMinutesSnapshot: 30, bufferBeforeMinutesSnapshot: 0, bufferAfterMinutesSnapshot: 0, requiredStaffCountSnapshot: 1, requiredSkillIdsSnapshot: [], requiredSkillCountsSnapshot: [], requiredResourceTypeCountsSnapshot: [], quantity: 1, lineTotalMinor: 1000, sortOrder: 0 }] },
      },
      include: { services: true },
    });
    bookingId = booking.id;
    await prisma.bookingStaff.create({ data: { bookingServiceId: booking.services[0].id, staffId: staffIds[0], assignedByUserId: userId } });

    await page.goto('/');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/#/bookings');
    await page.getByRole('row', { name: new RegExp(tag) }).click();
    const detail = page.getByRole('dialog', { name: 'Booking Details' });
    await expect(detail).toContainText(`${tag}-A`);
    await detail.getByRole('button', { name: 'Assign Staff', exact: true }).click();
    const control = page.locator('.staff-assignment-control');
    await expect(control.locator('p')).toContainText(`${tag}-A`);
    await expect(control.getByLabel('Choose staff')).toHaveValue(staffIds[0]);
    await control.getByLabel('Choose staff').selectOption(staffIds[1]);
    await control.getByRole('button', { name: 'Assign staff', exact: true }).click();
    await expect(detail.getByText('Staff assignment updated successfully.')).toBeVisible();
    await expect(detail).toContainText(`${tag}-B`);
    await page.reload();
    await page.getByRole('row', { name: new RegExp(tag) }).click();
    await expect(detail).toContainText(`${tag}-B`);
    await detail.getByRole('button', { name: 'Assign Staff', exact: true }).click();
    await expect(control.getByLabel('Choose staff')).toHaveValue(staffIds[1]);
    await page.getByRole('dialog', { name: 'Assign Staff' }).getByRole('button', { name: 'Close form' }).click();
    await detail.getByRole('button', { name: 'Unassign Staff' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Unassign Staff' });
    await expect(confirmation.getByText(`Remove ${tag}-B from this booking?`)).toBeVisible();
    await confirmation.getByRole('button', { name: 'Unassign', exact: true }).click();
    await expect(detail.getByText('Staff unassigned successfully.')).toBeVisible();
    await expect(detail).toContainText('Not assigned');
    expect(await prisma.bookingStaff.count({ where: { bookingServiceId: booking.services[0].id, status: 'ACTIVE' } })).toBe(0);
  } finally {
    if (bookingId) await prisma.booking.delete({ where: { id: bookingId } });
    for (const staffId of staffIds) await prisma.staffWorkingSchedule.deleteMany({ where: { staffId } });
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } });
    for (const staffId of staffIds) await prisma.staffProfile.delete({ where: { id: staffId } });
    if (customerId) await prisma.customerProfile.delete({ where: { id: customerId } });
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
      await prisma.membership.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.account.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
});
