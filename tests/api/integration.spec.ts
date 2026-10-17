/** Requires the real published backend on port 8000 with a complete source import.
 * Main-preview checks are read-only. Alert mutations opt into a separate authored API.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('overview reads published evidence, orders periods, and opens investigation directly', async ({
  page,
}) => {
  const unavailable: string[] = [];
  page.on('request', (r) => {
    // The top navigation may read alerts for its count; the cohort page must
    // still open directly without requesting an alert investigation.
    if (/\/api\/v1\/investigations/.test(r.url())) unavailable.push(r.url());
  });
  const response = page.waitForResponse(
    (r) => r.url().includes('/api/v1/evidence?') && r.status() === 200,
  );
  await page.goto('/ward');
  const payload = await (await response).json();
  expect(payload.context.method_version).toBe('evidence-v1');
  const titles = await page.locator('.period-title h3').allTextContents();
  expect(titles).toEqual(['Last 12 months', 'Last 28 days']);
  const period = page.getByRole('region', { name: 'Last 12 months evidence', exact: true });
  const m = payload.windows.rolling_12_months;
  if (m.status === 'available') await expect(period).toContainText(m.susceptibility_pct.toFixed(1));
  await expect(page.locator('.calendar-unavailable')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replay demo' })).toHaveCount(0);
  await expect(page.locator('.fixture-notice')).toHaveCount(0);
  await expect(page.locator('.metric-details').first()).not.toHaveAttribute('open');
  await page.getByRole('link', { name: 'Investigate susceptibility', exact: true }).click();
  await expect(page).toHaveURL(/\/investigate\?/);
  await expect(
    page.getByRole('heading', { name: 'Investigate susceptibility', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence behind the estimate' })).toBeVisible();
  await expect(page.locator('.paired-chart')).toBeVisible();
  expect(unavailable).toEqual([]);
});

test('monthly trend uses guarded published 28-day responses and gaps for suppression', async ({
  page,
}) => {
  const responses: Promise<unknown>[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/evidence?') && r.status() === 200) responses.push(r.json());
  });
  await page.goto('/ward');
  await expect(page.getByRole('button', { name: 'Load monthly trend' })).toHaveCount(0);

  await expect(page.getByText('Monthly values, counts & exports', { exact: true })).toBeVisible({
    timeout: 100_000,
  });
  await page.getByText('Monthly values, counts & exports', { exact: true }).click();
  const table = page.getByRole('region', {
    name: '28-day susceptibility at monthly collection cutoffs',
  });
  await expect(table.locator('tbody tr')).toHaveCount(9);
  const wire = (await Promise.all(responses)) as {
    context: { run_id: string; state_revision: number; filters: { as_of: string } };
    windows: { rolling_28_days: { status: string } };
  }[];
  expect(new Set(wire.map((p) => `${p.context.run_id}/${p.context.state_revision}`)).size).toBe(1);
  const unique = new Map(wire.map((p) => [p.context.filters.as_of, p]));
  const available = [...unique.values()].filter(
    (p) => p.windows.rolling_28_days.status === 'available',
  );
  await expect(page.locator('.trend-point')).toHaveCount(available.length);
});

test('comparison provenance displays the actual backend coverage flags', async ({ page }) => {
  const response = page.waitForResponse((r) => r.url().includes('/api/v1/comparisons?') && r.ok());
  await page.goto('/ward');
  const wire = await (await response).json();
  await page.getByText('Paired counts & missing tests', { exact: true }).click();
  await page
    .locator('#comparison')
    .getByRole('button', { name: 'How calculated', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    wire.comparison.coverage.source_date_span_covers_window
      ? 'Imported date span covers this period'
      : 'Partial imported-dataset coverage',
  );
  await expect(dialog).toContainText(
    wire.comparison.coverage.source_fully_imported
      ? 'Dataset import complete'
      : 'Dataset import incomplete',
  );
  if (wire.comparison.coverage.source_date_span_covers_window)
    await expect(
      dialog.getByText('Partial imported-dataset coverage', { exact: true }),
    ).toHaveCount(0);
});

test('patient lookup and all-specimen history use real IDs and strict cutoff', async ({ page }) => {
  await page.goto('/ward');
  await expect(page.getByRole('heading', { name: 'Ward overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Patient history', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  const searchResponse = page.waitForResponse(
    (r) => r.url().includes('/api/v1/patients?') && r.status() === 200,
  );
  await dialog.getByPlaceholder('Enter a patient ID (e.g. P000001)').fill('000');
  const search = await (await searchResponse).json();
  expect(search.patients.length).toBeGreaterThan(0);
  const patient = search.patients[0].patient_id;
  const historyResponse = page.waitForResponse(
    (r) => r.url().includes(`/patients/${patient}/history?`) && r.status() === 200,
  );
  await dialog.locator('.patient-results button').first().click();
  const history = await (await historyResponse).json();
  await expect(dialog.getByRole('heading', { name: patient, exact: true })).toBeVisible();
  expect(history.context.method_version).toBe('history-v1');
  for (const c of history.cultures)
    expect(c.record.sample_date < history.context.end_date_exclusive).toBe(true);
  await expect(dialog.locator('.history-culture')).toHaveCount(history.cultures.length);
});

test('real API screens remain accessible on desktop and mobile', async ({ page }) => {
  await page.goto('/ward');
  await expect(
    page.getByRole('region', { name: 'Last 12 months evidence', exact: true }),
  ).toBeVisible();
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await page.getByRole('link', { name: 'Investigate cohort' }).click();
  await expect(page.getByRole('heading', { name: 'Evidence behind the estimate' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('chart year 2025 leaves a September 2026 report unchanged', async ({ page }) => {
  await page.goto('/ward');
  await expect(
    page.getByRole('region', { name: 'Last 12 months evidence', exact: true }),
  ).toBeVisible();
  const before = await page.locator('.period-value').allTextContents();
  await page.getByLabel('Chart year', { exact: true }).selectOption('2025');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-27');
  await expect(page.locator('#chart-year-help')).toContainText('Showing 2025 in this chart only');
  await expect(page.locator('.period-value')).toHaveText(before);
  const comparisonTop = await page
    .locator('#comparison')
    .evaluate((e) => e.getBoundingClientRect().top + scrollY);
  const chartTop = await page
    .locator('.trend-panel')
    .evaluate((e) => e.getBoundingClientRect().top + scrollY);
  expect(chartTop).toBeGreaterThan(comparisonTop);

  await expect(page.getByText('Monthly values, counts & exports', { exact: true })).toBeVisible({
    timeout: 100_000,
  });
  await page.getByText('Monthly values, counts & exports', { exact: true }).click();
  const rows = page.locator('.trend-panel tbody tr');
  await expect(rows).toHaveCount(12);
  for (const cutoff of await rows.locator('td:first-child').allTextContents())
    expect(cutoff).toContain('2025');
});

test('published resistance monitors and their exports use the new alert-v1 contract', async ({
  page,
}) => {
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Monitored groups', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No active resistance alerts' })).toBeVisible();
  await expect(page.locator('.monitoring-summary')).toContainText('4 monitored groups');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).first().click();
  const download = await downloadEvent;
  const report = JSON.parse(
    await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8'),
  );
  expect(report.context.method_version).toBe('alert-v1');
  expect(report.evaluation.baseline.end_date_exclusive).toBe(report.evaluation.recent.start_date);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
});

test('authored backend scenario keeps original detection distinct and survives archive', async ({
  page,
  request,
}) => {
  const origin = process.env.AEI_ALERT_TEST_URL;
  test.skip(
    !origin,
    'Requires a separate authored-scenario API; never points to the supplied-data preview.',
  );
  await request.post(`${origin}/api/v1/replay/reset`, {
    data: { seed_through: '2026-09-26', replay_through: '2026-10-01' },
  });
  await request.post(`${origin}/api/v1/replay/step`);
  await request.post(`${origin}/api/v1/replay/step`);
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/updates')) return route.fulfill({ status: 204 });
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto('/alerts');
  await expect(page.getByRole('link', { name: 'Investigate alert', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Investigate alert', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Investigate a resistance increase' }),
  ).toBeVisible();
  await expect(page.locator('.snapshot-label')).toContainText('current evaluation');
  await expect(page.locator('.investigation-value').last()).toHaveText('—');
  await page.getByRole('button', { name: 'Original detection', exact: false }).click();
  await expect(page.locator('.investigation-value')).toHaveText(['20.0%', '30.0%']);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const saved = await downloadEvent;
  const original = JSON.parse(
    await (await import('node:fs/promises')).readFile((await saved.path())!, 'utf8'),
  );
  expect(original.context.monitoring_as_of).toBe('2026-09-27');
  await page.setViewportSize({ width: 375, height: 950 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const investigationPath = new URL(page.url()).pathname;
  await request.post(`${origin}/api/v1/replay/reset`, {
    data: { seed_through: '2026-09-26', replay_through: '2026-10-01' },
  });
  await page.goto(investigationPath);
  await expect(
    page.getByText('Archived investigation from an earlier run.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Current evaluation', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.investigation-value')).toHaveText(['20.0%', '30.0%']);
  const exported = await (
    await request.get(`${origin}/api/v1/analyses/${original.analysis_id}/export?format=json`)
  ).json();
  expect(exported).toEqual(original);
});

test('a real feed publication refreshes the dashboard through SSE and preserves saved evidence', async ({
  page,
  request,
}) => {
  const origin = process.env.AEI_ALERT_TEST_URL;
  const batchPath = process.env.AEI_FEED_TEST_BATCH;
  test.skip(
    !origin || !batchPath,
    'Requires the separate authored scenario and its generated test delivery.',
  );
  const started = await request.post(`${origin}/api/v1/feed/start`, {
    data: {
      source_id: 'ui-live-test',
      source_label: 'Authored live-feed validation',
      clock_mode: 'simulated',
      as_of: '2026-09-26',
      seed_through: '2026-09-26',
    },
  });
  expect(started.ok()).toBe(true);
  const initial = await started.json();
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.pathname.endsWith('/updates')) {
      // Native EventSource follows this redirect; route.fetch would buffer an endless stream.
      return route.fulfill({ status: 307, headers: { location: `${origin}${url.pathname}` } });
    }
    const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto('/ward');
  await expect(page.locator('.feed-status')).toHaveCount(0);
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-26');
  await expect(page.getByText('Monthly values, counts & exports', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const download = await downloadEvent;
  const frozen = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(frozen.context.state_revision).toBe(initial.state_revision);
  expect(frozen.context.mode).toBe('feed');
  await expect(page.getByRole('dialog')).toContainText('do not certify completeness');
  await page.getByRole('button', { name: 'Close panel' }).click();
  const metaRefresh = page.waitForResponse((r) => r.url().includes('/api/v1/meta') && r.ok());
  const payload = JSON.parse(await readFile(batchPath!, 'utf8'));
  const accepted = await request.post(`${origin}/api/v1/feed/batches`, {
    data: { ...payload, run_id: initial.run_id },
  });
  expect(accepted.status()).toBe(202);
  const receipt = await accepted.json();
  await expect
    .poll(async () => (await (await request.get(`${origin}${receipt.receipt_url}`)).json()).status)
    .toBe('published');
  // Connected streams poll only every 30 seconds: this must arrive by SSE, without reload.
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-27', { timeout: 8000 });
  await metaRefresh;
  await expect(page.getByText('Monthly values, counts & exports', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  const updatedEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const updatedDownload = await updatedEvent;
  const updated = JSON.parse(await readFile((await updatedDownload.path())!, 'utf8'));
  expect(updated.context.state_revision).toBe(2);
  expect(updated.context.feed_data_digest).toBeTruthy();
  expect(updated.windows.rolling_28_days.coverage).toMatchObject({
    coverage_scope: 'imported_dataset_only',
    includes_feed_data: true,
  });
  const original = await (
    await request.get(`${origin}/api/v1/analyses/${frozen.analysis_id}/export?format=json`)
  ).json();
  expect(original).toEqual(frozen);
});
