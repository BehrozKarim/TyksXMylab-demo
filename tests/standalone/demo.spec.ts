import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import reference from '../../src/test/reference-parity.json' with { type: 'json' };

const seedMeasure = reference[0].windows.rolling_12_months;

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page, context }) => {
  const issues: string[] = [];
  errors.set(page, issues);
  page.on('pageerror', (e) => issues.push(e.message));
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/__demo') ||
      (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4175')
    )
      issues.push(`Unexpected network: ${url}`);
  });
  await context.route('**/api/**', (route) => route.abort());
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function overview(page: Page) {
  await page.goto('/ward');
  await expect(page.getByRole('heading', { name: 'Ward overview', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Last 12 months evidence', exact: true }),
  ).toContainText(seedMeasure.susceptibility_pct!.toFixed(1));
  await expect(page.getByText('Monthly values, counts & exports', { exact: true })).toBeVisible();
}
async function openFeed(page: Page) {
  await page.getByRole('button', { name: 'Demo feed', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send next lab batch' })).toBeEnabled();
}
async function closeDrawer(page: Page) {
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
}

test('runs evidence, historical trends and filtering entirely on static assets', async ({
  page,
}) => {
  await overview(page);
  await page.getByText('Monthly values, counts & exports', { exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: '28-day susceptibility at monthly collection cutoffs' })
      .locator('tbody tr'),
  ).toHaveCount(9);
  await page.getByRole('button', { name: 'Edit query', exact: true }).click();
  await page.getByLabel('Ward', { exact: true }).selectOption('ICU');
  await page.getByRole('button', { name: 'Apply cohort', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Last 28 days evidence', exact: true }),
  ).not.toContainText('84.8');
  await expect(page.locator('.query-summary')).toContainText('Intensive');
  await page.getByRole('link', { name: 'Investigate susceptibility', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evidence behind the estimate' })).toBeVisible();
});

test('publishes a real batch offline, updates chart and alerts, and preserves progress on refresh', async ({
  page,
  context,
}) => {
  await overview(page);
  const initialRevision = await page.locator('.trend-freshness').innerText();
  expect(initialRevision).toContain('revision 1');
  await openFeed(page);
  await expect(page.getByRole('dialog')).toContainText('Ready: 20 cultures dated 2026-09-25');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Send next lab batch' }).click();
  await expect(page.getByRole('dialog')).toContainText('revision 2');
  await closeDrawer(page);
  await expect(page.locator('.trend-freshness')).toContainText('revision 2');
  await expect(page.getByRole('link', { name: 'Resistance alerts', exact: false })).toContainText(
    '1',
  );
  await page.getByRole('link', { name: 'Resistance alerts', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Resistance alerts', exact: true })).toBeVisible();
  await expect(page.locator('.resistance-alert-row')).toContainText('+3.8 pp');
  await page.getByRole('link', { name: /Investigate alert/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Investigate a resistance increase' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Original detection/ })).toBeVisible();
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Investigate a resistance increase' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Demo feed', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('revision 2');
});

test('completes every remaining batch and restarts without a backend', async ({ page }) => {
  await overview(page);
  await openFeed(page);
  for (let batch = 1; batch <= 6; batch++) {
    await page.getByRole('button', { name: 'Send next lab batch' }).click();
    await expect(page.getByRole('dialog')).toContainText(`revision ${batch + 1}`);
  }
  await expect(page.getByRole('button', { name: 'Send next lab batch' })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('All demo batches published');
  await page.getByRole('button', { name: 'Restart demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ward overview', exact: true })).toBeVisible();
  await openFeed(page);
  await expect(page.getByRole('dialog')).toContainText('Ready: 20 cultures dated 2026-09-25');
});

test('downloads frozen JSON/CSV and produces a local report summary', async ({ page }) => {
  await overview(page);
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download JSON|JSON/ }).click();
  const report = JSON.parse(await readFile((await (await jsonDownload).path())!, 'utf8'));
  expect(report.context.state_revision).toBe(1);
  expect(report.windows.rolling_12_months.n_tested).toBe(seedMeasure.n_tested);
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download CSV|CSV/ }).click();
  expect(await readFile((await (await csvDownload).path())!, 'utf8')).toContain('rolling_28_days');
  await closeDrawer(page);
  await page.getByRole('button', { name: 'Report summary', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Basic summary');
  await expect(page.locator('.summary-paragraph')).toContainText(`${seedMeasure.susceptibility_pct!.toFixed(1)}%`);
  await expect(page.locator('.summary-paragraph')).toContainText('not treatment efficacy');
});

test('searches synthetic patients and opens prior microbiology history', async ({ page }) => {
  await overview(page);
  await page.getByRole('button', { name: /Patient history|Patient microbiology/ }).click();
  await page.getByPlaceholder(/Enter a patient ID/).fill('P000001');
  await page.locator('.patient-results button').first().click();
  await expect(page.locator('.history-context')).toContainText('Strict cutoff');
  await expect(page.getByRole('dialog')).not.toContainText('Could not load history');
});

test('keeps the copied layout accessible at desktop and mobile widths', async ({ page }) => {
  await overview(page);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: 'test-results/standalone-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/standalone-mobile.png', fullPage: true });
  await openFeed(page);
  await expect(page.getByRole('button', { name: 'Send next lab batch' })).toBeInViewport();
});
