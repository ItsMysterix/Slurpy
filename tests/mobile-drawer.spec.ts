import { test, expect } from '@playwright/test';

test('mobile drawer traps focus, locks scroll and closes with Escape', async ({ page }) => {
  // mobile viewport
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');

  const toggle = page.locator('[aria-label*="Toggle menu"], [aria-label*="toggle menu"], [aria-label*="Menu"], button[aria-label*="menu"]').first();
  await expect(toggle).toBeVisible({ timeout: 10000 });

  // ensure body overflow not hidden initially
  const beforeOverflow = await page.evaluate(() => document.body.style.overflow || '');

  await toggle.click();

  const dialog = page.getByRole('dialog', { name: 'Main menu' });
  await expect(dialog).toBeVisible();

  // body should be locked (overflow hidden) on mobile
  const locked = await page.evaluate(() => document.body.style.overflow);
  expect(locked).toBe('hidden');

  // focus should be inside the dialog; press Tab several times and ensure it remains inside
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return !!el.closest && !!el.closest('[role="dialog"]');
    });
    expect(inside).toBeTruthy();
  }

  // Press Escape to close
  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();

  // body overflow should be restored to previous value
  const afterOverflow = await page.evaluate(() => document.body.style.overflow || '');
  expect(afterOverflow).toBe(beforeOverflow);

  // focus should return to the toggle button
  const activeIsToggle = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return el.getAttribute('aria-label') === 'Toggle menu' || el.getAttribute('aria-label') === 'Close menu';
  });
  expect(activeIsToggle).toBeTruthy();
});
