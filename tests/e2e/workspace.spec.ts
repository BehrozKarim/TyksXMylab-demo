import { test, expect, type Page } from '@playwright/test';
async function publish(page: Page, action: string) {
  await page.evaluate(async (a) => {
    const r = await fetch(`/api/v1/replay/${a}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw new Error('Publication failed');
  }, action);
}
import AxeBuilder from '@axe-core/playwright';

async function editQuery(page: Page) {
  const button = page.getByRole('button', { name: 'Edit query', exact: true });
  if (await button.isVisible()) await button.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/ward');
  await expect(
    page.getByRole('region', { name: 'Last 12 months evidence', exact: true }),
  ).toBeVisible();
  await page.locator('.fixture-flags > summary').click();
});
test('renders all windows and a common-denominator comparison', async ({ page }) => {
  expect(await page.locator('.period-title h3').allTextContents()).toEqual([
    'Last 12 months',
    'Last 28 days',
  ]);
  await expect(
    page.getByText('The last 12 months includes the recent 28 days.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Last 12 months evidence' })).toContainText('79.6');
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText('75.0');
  await expect(page.getByText('40 paired isolates')).toBeVisible();
  await expect(page.locator('.difference-strip')).toContainText('+7.5');
  await expect(page.locator('.fixture-notice')).toContainText('Authored examples');
});
test('applies filters explicitly, restores back navigation, and suppresses sparse data', async ({
  page,
}) => {
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('ICU');
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText('75.0');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  const recent = page.getByRole('region', { name: 'Last 28 days evidence' });
  await expect(recent).toContainText('29 tested');
  await expect(recent).not.toContainText('%');
  await expect(page.getByText('Only 26 paired tests')).toBeVisible();
  await page.goBack();
  await expect(recent).toContainText('75.0');
});
test('preserves counts when paired support is below 30', async ({ page }) => {
  await page.getByLabel('Compare with B').selectOption('MEC');
  await expect(page.getByText('Only 26 paired tests')).toBeVisible();
  await expect(page.locator('.paired-chart')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText('75.0');
  await page.getByText('Paired counts & missing tests', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Paired susceptibility counts' })).toContainText(
    '17',
  );
});
test('distinguishes no tests and empty cohort', async ({ page }) => {
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('GER');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText(
    'No susceptibility tests recorded',
  );
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('PHC-N');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText(
    'No eligible isolates in this period',
  );
});
test('chart year is separate from the report end date and pinning remains explicit', async ({
  page,
}) => {
  await page.getByLabel('Chart year').selectOption('2025');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-27');
  await expect(page.getByRole('region', { name: 'Last 12 months evidence' })).toContainText('79.6');
  await expect(page.locator('#chart-year-help')).toContainText('Showing 2025 in this chart only');
  await page.getByLabel('Report end date').fill('2026-09-20');
  await expect(page.getByText('Viewing a pinned report')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inspect evidence' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use latest date' }).first().click();
  await expect(page.getByRole('link', { name: 'Inspect evidence' })).toBeVisible();
});

test('patient dialog includes prior specimens, traps focus and returns it', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Patient history', exact: true }).last();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('Enter a patient ID (e.g. P000001)').fill('P-00142');
  await dialog.getByRole('button', { name: 'P-00142 Synthetic patient' }).click();
  await expect(dialog.getByText('3 prior cultures')).toBeVisible();
  await expect(dialog.getByText('No growth', { exact: true })).toBeVisible();
  await expect(dialog.getByText('C-09271')).toHaveCount(0);
  await expect(dialog.getByText('Screening test')).toBeVisible();
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test('investigation uses its own cohort and has working evidence views', async ({ page }) => {
  await editQuery(page);
  await page.getByRole('button', { name: 'Population filters' }).click();
  await page.getByLabel('Sex', { exact: true }).selectOption('F');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await page.getByRole('link', { name: 'Inspect evidence' }).click();
  await expect(page.getByRole('heading', { name: 'A change worth a closer look.' })).toBeVisible();
  await expect(page.locator('.investigation-context')).toContainText('all sexes');
  await page.getByRole('tab', { name: 'Population context' }).click();
  await expect(page.getByRole('heading', { name: 'Age composition' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText('Baseline period closes')).toBeVisible();
  await page.getByRole('link', { name: 'Back to ward overview' }).click();
  await expect(page.locator('.applied-context')).toContainText('women');
});
test('export remains tied to the opened snapshot while replay advances', async ({ page }) => {
  await page.getByRole('button', { name: 'Export snapshot' }).click();
  const dialog = page.getByRole('dialog');
  const first = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download JSON' }).click();
  const download = await first;
  const original = await (
    await import('node:fs/promises')
  ).readFile((await download.path())!, 'utf8');
  const snapshot = JSON.parse(original);
  await page.keyboard.press('Escape');
  await publish(page, 'step');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-28');
  const stillFrozen = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/analyses/${id}/export?format=json`);
    return await res.json();
  }, snapshot.analysis_id);
  expect(stillFrozen).toEqual(snapshot);
  await publish(page, 'reset');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-20');
  const afterReset = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/analyses/${id}/export?format=json`);
    return await res.json();
  }, snapshot.analysis_id);
  expect(afterReset).toEqual(snapshot);
});
test('read-only UI follows backend publication changes without playback controls', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Replay demo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play days', exact: true })).toHaveCount(0);
  for (const date of ['2026-09-28', '2026-09-29', '2026-09-30']) {
    await publish(page, 'step');
    await expect(page.getByLabel('Report end date')).toHaveValue(date);
  }
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText(
    '29 tested',
  );
  await publish(page, 'reset');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-20');
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  await expect(page.getByRole('dialog')).toContainText('fixture-run-002');
  await page.getByRole('button', { name: 'Close panel' }).click();
});

test('desktop and mobile have no serious accessibility violations or horizontal overflow', async ({
  page,
}) => {
  // 720 CSS pixels also exercises a 1440px display at a 200% layout viewport.
  for (const width of [1440, 768, 720, 375]) {
    await page.setViewportSize({ width, height: 950 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ward overview', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Investigate susceptibility', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Investigate susceptibility', exact: true }),
  ).toBeVisible();
});
test('recovers from one state_changed response without mixing snapshots', async ({ page }) => {
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    const { fault } = await import(module);
    fault('state_changed');
  });
  await page.getByLabel('Compare with B').selectOption('NIT');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-28');
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText('75.0');
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  await expect(page.getByRole('dialog')).toContainText('fixture-run-001 / 9');
  await page.getByRole('button', { name: 'Close panel' }).click();
});
test('shows persistent API failure without fixture fallback and retries the same cohort', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    const { fault } = await import(module);
    fault('network');
  });
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('ICU');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await expect(page.getByText('The evidence service is unavailable.').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toHaveCount(0);
  await expect(page.getByLabel('Ward', { exact: true })).toHaveValue('ICU');
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    const { recover } = await import(module);
    recover();
  });
  await page.getByRole('button', { name: 'Retry', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText(
    '29 tested',
  );
});

test('background state and metadata failures keep the workspace usable with inline retry', async ({
  page,
}) => {
  const values = await page.locator('.period-value').allTextContents();
  for (const endpoint of ['state', 'meta'] as const) {
    await page.evaluate(async (name) => {
      const module = '/src/mocks/testing.ts';
      const { failRefresh } = await import(module);
      await failRefresh(name);
    }, endpoint);
    await expect(page.getByText('Could not refresh the workspace', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ward overview', exact: true })).toBeVisible();
    await expect(page.locator('.period-value')).toHaveText(values);
    await expect(page.locator('.boot-screen')).toHaveCount(0);
    await editQuery(page);
    await page.getByLabel('Ward', { exact: true }).selectOption('ICU');
    await expect(page.getByLabel('Ward', { exact: true })).toHaveValue('ICU');
    await page.evaluate(async () => {
      const module = '/src/mocks/testing.ts';
      (await import(module)).recover();
    });
    const retry = page.getByRole('button', { name: 'Retry refresh', exact: true }).first();
    if (await retry.isVisible()) await retry.click();
    await expect(page.getByText('Could not refresh the workspace', { exact: true })).toHaveCount(0);
  }
});

test('analysis refetch failure retains the displayed snapshot and its original export', async ({
  page,
}) => {
  const before = await page.locator('.period-value').allTextContents();
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    await (await import(module)).failRefresh('evidence');
  });
  await expect(
    page.getByText('Could not refresh these results', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('.period-value')).toHaveText(before);
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  await expect(page.getByRole('dialog')).toContainText('Frozen analysis');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const download = await downloadEvent;
  const exported = JSON.parse(
    await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8'),
  );
  expect(exported.windows.last_28d.susceptibility_pct).toBe(75);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    (await import(module)).recover();
  });
  await page.getByRole('button', { name: 'Retry refresh', exact: true }).first().click();
  await expect(page.getByText('Could not refresh these results', { exact: true })).toHaveCount(0);
});

test('live revisions defer historical requests while headline evidence updates, with manual refresh available', async ({
  page,
}) => {
  await expect(page.getByText('Monthly values, counts & exports', { exact: true })).toBeVisible();
  const snapshots = await page.locator('.trend-freshness').innerText();
  const historical: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.endsWith('/evidence') && url.searchParams.get('as_of')! < '2026-09-27')
      historical.push(r.url());
  });
  await publish(page, 'step');
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-28');
  await expect(page.locator('.trend-freshness')).toContainText('New data is available');
  await expect(page.locator('.trend-freshness')).toContainText(snapshots);
  expect(historical).toHaveLength(0);
  await page.getByRole('button', { name: 'Refresh now', exact: true }).click();
  await expect(page.locator('.trend-freshness')).toContainText('revision 9');
  expect(historical.length).toBeGreaterThan(0);
  await expect(page.locator('.trend-freshness')).not.toContainText('New data is available');
});
test('rejects legacy statistics at the facade instead of reinterpreting them', async ({ page }) => {
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    const { fault } = await import(module);
    fault('legacy');
  });
  await page.getByLabel('Chart year').selectOption('2025');
  await expect(
    page
      .getByText(
        'The API returned an incompatible evidence contract. Check the /api/v1 integration.',
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toHaveCount(0);
});
test('a delayed previous cohort cannot replace the current results', async ({ page }) => {
  await page.evaluate(async () => {
    const module = '/src/mocks/testing.ts';
    const { fault } = await import(module);
    fault('delayed');
  });
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('ICU');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('URO');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText('75.0');
  await page.waitForTimeout(1500);
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).not.toContainText(
    '29 tested',
  );
});
test('investigation and drawers remain accessible at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('link', { name: 'Inspect evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Resistance, in context' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Export snapshot' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});
