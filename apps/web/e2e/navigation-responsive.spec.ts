import { expect, test } from '@playwright/test';

const identity = {
  user: { id: 'navigation-user', name: 'Navigation Tester', email: 'navigation@example.test' },
  activeOrganization: { id: 'navigation-organization', name: 'Responsive Test Organization' },
  membership: { id: 'navigation-membership' },
  role: { id: 'navigation-role', name: 'Configurable Role' },
  permissions: [
    'booking.read.all', 'staff.read.all', 'attendance.read.all', 'leave.read.all', 'payment.read.all',
    'audit.read',
  ],
};

test('shared navigation remains usable at every supported viewport', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('booking-language', 'en'));
  await page.route('**/identity/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

  for (const width of [320, 375, 390, 430, 768, 1023, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `horizontal overflow at ${width}px`).toBe(false);

    if (width < 1024) {
      const menu = page.getByRole('button', { name: 'Open navigation menu' });
      await expect(menu).toBeVisible();
      await menu.click();
      const drawer = page.getByRole('complementary', { name: 'Mobile application sidebar', exact: true });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Bookings & scheduling' })).toBeVisible();
      expect(await drawer.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(Math.min(320, Math.round(width * .85)));
      await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toHaveAttribute('aria-modal', 'true');
      await expect(drawer.getByRole('button', { name: 'Close navigation menu' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(drawer.getByRole('button', { name: 'Close navigation menu' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(drawer).not.toBeVisible();
      await expect(menu).toBeFocused();
    } else {
      const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
      await expect(sidebar).toBeVisible();
      const dimensions = await sidebar.evaluate((element) => ({ width: getComputedStyle(element).width, grid: getComputedStyle(element.parentElement!).gridTemplateColumns, token: getComputedStyle(element.parentElement!).getPropertyValue('--sidebar-width'), className: element.parentElement!.className }));
      expect(dimensions.width, `desktop sidebar at ${width}px: ${JSON.stringify(dimensions)}`).toBe('256px');
      await expect(page.getByRole('button', { name: 'Open navigation menu' })).not.toBeVisible();
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await expect(sidebar).toHaveCSS('width', '76px');
  const booking = sidebar.getByRole('button', { name: 'Bookings & scheduling' });
  await expect(booking).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Manage Bookings' })).toHaveCount(0);
  await booking.click();
  await expect(page.locator('.sidebar-flyout').getByRole('button', { name: 'Manage Bookings' })).toBeVisible();
  await page.locator('.sidebar-flyout').getByRole('button', { name: 'Manage Bookings' }).click();
  await expect(page.locator('.sidebar-flyout')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const drawer = page.getByRole('complementary', { name: 'Mobile application sidebar', exact: true });
  await expect(drawer.getByRole('button', { name: 'Bookings & scheduling' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Manage Bookings' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Manage Bookings' }).click();
  await expect(drawer).not.toBeVisible();
});

test('switching expanded sidebar groups opens the selected submenu', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('booking-language', 'en'));
  await page.route('**/identity/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(identity) }));
  await page.goto('/#/bookings');
  const sidebar = page.getByRole('complementary', { name: 'Application sidebar', exact: true });
  await expect(sidebar.getByRole('button', { name: 'Manage Bookings' })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Attendance & leave' }).click();
  await expect(sidebar.getByRole('button', { name: 'Attendance', exact: true })).toBeVisible();
});
