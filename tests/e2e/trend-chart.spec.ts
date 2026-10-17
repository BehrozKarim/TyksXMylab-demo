import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('trend separates missing cutoffs and supports pointer, keyboard and touch details', async ({
  page,
}, info) => {
  await page.goto('/tests/browser/design-harness.html?scenario=trend');
  await expect(page.getByText('Estimates available for 2 of 9 cutoffs')).toBeVisible();
  await expect(page.getByText('Susceptibility (%)')).toBeVisible();
  await expect(page.getByText('28-day period ending · 2026')).toBeVisible();
  await expect(page.getByText('<30 tests', { exact: true })).toHaveCount(0);
  await expect(page.locator('.trend-point')).toHaveCount(2);
  const january = page.getByRole('button', { name: /31 Jan 2026/ });
  await january.focus();
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    'Below reporting threshold',
  );
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    '29 tested isolates',
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    'No tests recorded',
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    'No eligible isolates',
  );
  await page.keyboard.press('Tab');
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    'Not applicable',
  );
  await page.locator('.trend-point').first().hover();
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    '75.0% susceptible',
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('trend-desktop.png'), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 375, height: 950 });
  await january.click();
  await expect(page.getByRole('status', { name: 'Selected cutoff details' })).toContainText(
    'Below reporting threshold',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('trend-mobile.png'), fullPage: true });
});
