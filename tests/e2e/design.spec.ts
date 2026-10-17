import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function editQuery(page: Page) {
  const button = page.getByRole('button', { name: 'Edit query', exact: true });
  if (await button.isVisible()) await button.click();
}

test('overview leads with applied query and results, with explicit editing and cancellation', async ({
  page,
}) => {
  await page.goto('/ward');
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Current evidence query' });
  await expect(summary).toContainText('Escherichia coli');
  await expect(summary).toContainText('Ciprofloxacin');
  await expect(page.getByRole('button', { name: 'Edit query', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByLabel('Ward', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /Saved queries|Favorite/ })).toHaveCount(0);
  await editQuery(page);
  await page.getByLabel('Ward', { exact: true }).selectOption('ICU');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText('75.0');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit query', exact: true })).toBeFocused();
  await editQuery(page);
  await expect(page.getByLabel('Ward', { exact: true })).toHaveValue('URO');
  await editQuery(page);
  await page.getByRole('button', { name: 'Population filters', exact: true }).click();
  await page.getByLabel('Sex', { exact: true }).selectOption('F');
  await page.getByLabel('Minimum age').fill('18');
  await page.getByLabel('First isolate selection').selectOption('all_wards');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await expect(page.getByLabel('Ward', { exact: true })).toBeHidden();
  await expect(summary).toContainText('women');
  await expect(summary).toContainText('Ages 18–120+');
  await expect(summary).toContainText('First isolate across all wards');
  await page.reload();
  await expect(summary).toContainText('women');
  await expect(page.getByLabel('Ward', { exact: true })).toBeHidden();
  await page.goBack();
  await expect(summary).toContainText('All sexes');
});

test('design review across screen widths, support states and drawers', async ({ page }, info) => {
  test.setTimeout(120_000);
  const screenshot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  };
  const ready = async () => {
    await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Susceptibility time chart' })).toBeVisible();
  };
  await page.setViewportSize({ width: 1185, height: 1000 });
  await page.goto('/ward?ward_code=');
  await ready();
  await screenshot('01-ward-1185');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await screenshot(`ward-${width}`);
  }
  await page.setViewportSize({ width: 1185, height: 1000 });
  await editQuery(page);
  await page.getByRole('button', { name: 'Population filters', exact: true }).click();
  await screenshot('05-population-filters');
  await page.getByLabel('Minimum age').fill('80');
  await page.getByLabel('Maximum age').fill('18');
  await page.getByRole('button', { name: 'Apply cohort' }).click();
  await expect(page.getByRole('alert')).toContainText('minimum no greater');
  await screenshot('06-invalid-ages');
  await editQuery(page);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page).toHaveURL(/ward_code=URO/);
  await expect(page.getByLabel('Ward', { exact: true })).toHaveValue('URO');
  for (const [ward, name, text] of [
    ['ICU', '07-sparse', 'Insufficient data'],
    ['GER', '08-no-tests', 'No susceptibility tests recorded'],
    ['PHC-N', '09-empty', 'No eligible isolates'],
  ]) {
    await editQuery(page);
    await page.getByLabel('Ward', { exact: true }).selectOption(ward);
    await page.getByRole('button', { name: 'Apply cohort' }).click();
    await expect(page.getByRole('region', { name: 'Last 28 days evidence' })).toContainText(text);
    await screenshot(name);
  }
  await editQuery(page);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page).toHaveURL(/ward_code=URO/);
  await expect(page.getByLabel('Ward', { exact: true })).toHaveValue('URO');
  await page.getByLabel('Report end date').fill('2026-09-20');
  await expect(page).toHaveURL(/as_of=2026-09-20/);
  await expect(page.getByRole('button', { name: 'Use latest date' })).toBeVisible();
  await screenshot('11-pinned-date');
  await page.getByRole('button', { name: 'Use latest date' }).click();
  await expect(page.getByLabel('Report end date')).toHaveValue('2026-09-27');
  await page.getByLabel('Compare with B').selectOption('MEC');
  await expect(page.getByText('Only 26 paired tests')).toBeVisible();
  await screenshot('12-sparse-comparison');
  await page.getByLabel('Compare with B').selectOption('');
  await expect(page.getByRole('heading', { name: 'Choose two antibiotics' })).toBeVisible();
  await screenshot('13-no-comparison');
  await page.getByLabel('Compare with B').selectOption('TMP');
  await page.getByRole('link', { name: 'Investigate cohort' }).click();
  await expect(page.getByRole('heading', { name: 'Evidence behind the estimate' })).toBeVisible();
  await screenshot('16-investigate');
  await page.getByRole('button', { name: 'Export snapshot' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await screenshot('32-provenance');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  await download;
  await expect(page.getByRole('status').filter({ hasText: 'Snapshot downloaded' })).toBeVisible();
  await screenshot('15-export-toast');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Patient history', exact: true }).click();
  await screenshot('27-patient-search');
  await page.getByLabel('Patient identifier').fill('nomatch');
  await expect(page.getByText('No matching patients')).toBeVisible();
  await screenshot('28-patient-empty');
  await page.getByLabel('Patient identifier').fill('P-00142');
  await expect(page.getByRole('button', { name: 'P-00142 Synthetic patient' })).toBeVisible();
  await screenshot('29-patient-results');
  await page.getByRole('button', { name: 'P-00142 Synthetic patient' }).click();
  await expect(page.getByText('3 prior cultures')).toBeVisible();
  await screenshot('30-patient-history');
  await page.getByRole('button', { name: 'Expand all results' }).click();
  await screenshot('31-expanded-results');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'About this workspace' }).click();
  await screenshot('34-reading-evidence');
});
