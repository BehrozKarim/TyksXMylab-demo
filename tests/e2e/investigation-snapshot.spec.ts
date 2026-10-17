import { expect, test } from '@playwright/test';

test('detection stays frozen while serving state advances and reset invalidates the old run', async ({
  page,
}) => {
  await page.goto('/ward');
  await page.locator('.fixture-flags > summary').click();
  await expect(page.getByRole('link', { name: 'Inspect evidence' })).toBeVisible();
  const original = await page.evaluate(async () => {
    const state = await (await fetch('/api/v1/state')).json();
    const params = new URLSearchParams({
      expected_run_id: state.run_id,
      expected_revision: String(state.state_revision),
    });
    return await (await fetch(`/api/v1/investigations/review-ecoli-cip?${params}`)).json();
  });

  for (const date of ['2026-09-28', '2026-09-29', '2026-09-30']) {
    await page.evaluate(() => fetch('/api/v1/replay/step', { method: 'POST' }));
    await expect(page.getByLabel('Report end date')).toHaveValue(date);
  }
  const latest = await page.evaluate(async () => {
    const state = await (await fetch('/api/v1/state')).json();
    const params = new URLSearchParams({
      expected_run_id: state.run_id,
      expected_revision: String(state.state_revision),
    });
    return await (await fetch(`/api/v1/investigations/review-ecoli-cip?${params}`)).json();
  });
  expect(latest.analysis).toEqual(original.analysis);
  expect(latest.serving_context.state_revision).toBe(original.serving_context.state_revision + 3);
  expect(latest.serving_context.demo_date).toBe('2026-09-30');
  await page.getByRole('link', { name: 'Inspect evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Resistance, in context' })).toBeVisible();
  await expect(page.locator('.investigation-context')).toContainText('Detection snapshot');

  await page.evaluate(() => fetch('/api/v1/replay/reset', { method: 'POST' }));
  await page.getByRole('link', { name: 'Back to ward overview' }).click();
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-20');
  await page.getByRole('button', { name: 'How calculated: Last 12 months' }).click();
  await expect(page.getByRole('dialog')).toContainText('fixture-run-002');
  await page.getByRole('button', { name: 'Close panel' }).click();
  const afterReset = await page.evaluate(async (prior) => {
    const params = new URLSearchParams({
      expected_run_id: prior.serving_context.run_id,
      expected_revision: String(prior.serving_context.state_revision),
    });
    const stale = await fetch(`/api/v1/investigations/review-ecoli-cip?${params}`);
    const current = await fetch('/api/v1/investigations/review-ecoli-cip');
    const exported = await fetch(
      `/api/v1/analyses/${prior.analysis.analysis_id}/export?format=json`,
    );
    return {
      staleStatus: stale.status,
      currentStatus: current.status,
      exported: await exported.json(),
    };
  }, original);
  expect(afterReset.staleStatus).toBe(409);
  expect(afterReset.currentStatus).toBe(404);
  expect(afterReset.exported).toEqual(original.analysis);
});
