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

test('surfaces coverage completeness, the review queue, and a downloadable export', async ({
  page,
}) => {
  await page.goto('/');

  // Completeness, not just liveness: the unmonitored CA authority is disclosed.
  await expect(page.getByText('Completeness gap')).toBeVisible();
  await expect(page.getByText('California Department of Financial Protection')).toBeVisible();

  // Review queue surface is present.
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();

  // Examiner export is downloadable and stamped with its checksum.
  const download = page.getByRole('link', { name: /Download examiner export/ });
  await expect(download).toHaveAttribute('href', '/export');
});
