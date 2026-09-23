import { expect, test } from '@playwright/test';

test('demo Admin can sign in, restore identity, and reach core release areas', async ({ page }) => {
  const password = process.env.DEMO_ADMIN_PASSWORD;
  test.skip(!password, 'DEMO_ADMIN_PASSWORD is required for the release smoke test.');
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@demo.example.test');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' }).first()).toBeVisible();
  for (const area of ['Dashboard', 'My Profile', 'Bookings & scheduling', 'People & services', 'Attendance & leave', 'Payments & commission', 'Reports & settings', 'Audit Log']) {
    await expect(page.getByRole('button', { name: area })).toBeVisible();
  }

});

test('customer registration is permission-ready without a seed rerun', async ({ page }) => {
  const email = `playwright-${Date.now()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create customer account' }).click();
  await page.getByLabel('Name').fill('Playwright Customer');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('StrongPassw0rd!');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('complementary', { name: 'Application sidebar', exact: true }).getByRole('button', { name: 'Bookings', exact: true })).toBeVisible();
});
