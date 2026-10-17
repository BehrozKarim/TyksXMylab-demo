import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:5173/ward');
await page.getByRole('region', { name: 'Last 12 months evidence', exact: true }).waitFor();
await page.screenshot({ path: 'test-results/ward-desktop.png', fullPage: true });
await page.screenshot({ path: 'test-results/ward-desktop-viewport.png' });

await page.locator('.trend-chart svg').waitFor({ timeout: 90000 });
await page.screenshot({ path: 'test-results/trend-desktop.png', fullPage: true });
await page.getByRole('link', { name: 'Investigate cohort' }).click();
await page.getByRole('heading', { name: 'Investigate susceptibility' }).waitFor();
await page.getByRole('heading', { name: 'Evidence behind the estimate' }).waitFor();
await page.locator('.paired-chart').waitFor({ timeout: 60000 });
await page.screenshot({ path: 'test-results/investigation-desktop.png', fullPage: true });
await page.getByRole('link', { name: 'Resistance alerts', exact: true }).click();
await page
  .getByRole('heading', { name: 'Monitored groups', exact: true })
  .waitFor({ timeout: 60000 });
await page.screenshot({ path: 'test-results/resistance-alerts-desktop.png', fullPage: true });
await page.getByRole('link', { name: 'Ward overview', exact: true }).click();
await page.setViewportSize({ width: 375, height: 812 });
await page.getByRole('region', { name: 'Last 12 months evidence', exact: true }).waitFor();
await page.screenshot({ path: 'test-results/ward-mobile.png', fullPage: true });
await page.screenshot({ path: 'test-results/ward-mobile-viewport.png' });
await page.locator('.period-grid').screenshot({ path: 'test-results/ward-mobile-evidence.png' });
console.log(JSON.stringify({ errors, screenshots: 'test-results/' }, null, 2));
await browser.close();
