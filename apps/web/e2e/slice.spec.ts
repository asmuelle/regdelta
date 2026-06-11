import { expect, test } from '@playwright/test';

// Run with `just e2e` after `pnpm --filter @regdelta/web build` (webServer starts `pnpm start`).

test('renders the published change card with resolving citations', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('h1')).toContainText('Truth in Lending');
  await expect(page.getByText('Pinned citations')).toBeVisible();
  await expect(page.locator('.citation').first()).toContainText('sha256');
});

test('shows the verified audit ledger and gate route', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('chain verified')).toBeVisible();
  await expect(page.getByText('route: publish')).toBeVisible();
});
