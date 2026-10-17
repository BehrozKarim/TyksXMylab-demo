import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('AI drawer remains optional, reuses the summary and hands focus to its evidence', async ({
  page,
}, info) => {
  await page.goto('/tests/browser/design-harness.html?scenario=summary');
  const trigger = page.getByRole('button', { name: 'AI summary', exact: true });
  expect(await page.locator('body').getAttribute('data-summary-requests')).toBeNull();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'AI report summary' })).toBeVisible();
  await expect(page.getByText('AI-assisted summary')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Summarize this report' })).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-summary-requests', '1');
  await page.screenshot({ path: info.outputPath('ai-summary-drawer.png'), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByText('AI-assisted summary')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-summary-requests', '1');
  await page.getByRole('button', { name: 'View evidence' }).click();
  const provenance = page.getByRole('dialog', { name: 'Behind the evidence' });
  await expect(provenance).toBeVisible();
  await expect(provenance).toContainText('browser-evidence');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(trigger).toBeFocused();
});

test('redesigned alerts preserve snapshot exports, keyboard tabs and suppressed states', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1185, height: 1000 });
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  };
  await page.goto('/tests/browser/design-harness.html?scenario=alerts');
  await expect(page.getByRole('heading', { name: 'Monitored groups' })).toBeVisible();
  await capture('19-alerts');
  await page.goto('/tests/browser/design-harness.html?scenario=past-alerts');
  await expect(page.getByText('Alerts follow the latest monitoring date')).toBeVisible();
  await capture('20-past-alerts');
  await page.goto('/tests/browser/design-harness.html');
  await expect(page.getByRole('heading', { name: 'Resistance in separate periods' })).toBeVisible();
  await capture('21-alert-current');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-export-id', 'latest');
  await page.getByRole('button', { name: /Original detection/ }).click();
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-export-id', 'detection');
  await capture('22-alert-original');
  await page.getByRole('tab', { name: 'Evidence overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Population context' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Age composition' })).toBeVisible();
  await capture('23-alert-population');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Alert history' })).toBeVisible();
  await capture('24-alert-history');
  await page.goto('/tests/browser/design-harness.html?scenario=sparse');
  await expect(page.getByText('Estimate withheld: fewer than 30 tested isolates.')).toBeVisible();
  await expect(page.locator('.investigation-value').last()).not.toContainText('%');
  await capture('25-alert-insufficient');
  await page.goto('/tests/browser/design-harness.html?scenario=cleared');
  await expect(page.locator('.snapshot-label')).toContainText('Cleared');
  await capture('26-alert-cleared');
  for (const width of [1185, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await capture('alert-390');
  await page.goto('/tests/browser/design-harness.html?scenario=archived');
  await expect(page.getByText(/Archived investigation from an earlier run/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Current evaluation' })).toBeDisabled();
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-export-id', 'detection');
});
