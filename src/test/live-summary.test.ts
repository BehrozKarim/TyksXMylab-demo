import { afterEach, expect, it, vi } from 'vitest';
import { summarySource } from './summary-source';
import { buildSummaryFacts, renderSummary } from '../summary/facts';
const { local } = vi.hoisted(() => ({ local: vi.fn() }));
vi.mock('../demo/transport', () => ({ localRequest: local }));
const report = summarySource();
const facts = buildSummaryFacts(report);
const ai = renderSummary(report, facts, {
  choices: facts
    .filter((f) => f.section === 'paragraph')
    .map((f) => ({ fact_id: f.fact_id, variant: 1 })),
  model: 'gpt-4.1-mini',
});
const fallback = renderSummary(report, facts, { fallbackReason: 'disabled' });
async function load(enabled = '1') {
  vi.resetModules();
  vi.stubEnv('VITE_AI_SUMMARY', enabled);
  local.mockResolvedValue(fallback);
  return import('../api/live-summary');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('calls the same-origin function only when invoked, sends aggregate evidence, and reuses completed AI output', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(ai)));
  vi.stubGlobal('fetch', fetcher);
  const client = await load();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await client.createStandaloneSummary(report)).toEqual(ai);
  expect(fetcher.mock.calls[0][0]).toBe('/api/summarize');
  const init = fetcher.mock.calls[0][1];
  expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  expect(JSON.parse(init.body)).toEqual({ report, language: 'en' });
  expect(init.body).not.toContain('patient_id');
  expect(init.body).not.toContain('OPENAI_API_KEY');
  expect(await client.getStandaloneSummary(ai.summary_id, report)).toEqual(ai);
  expect(await client.createStandaloneSummary(report)).toEqual(ai);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(local).not.toHaveBeenCalled();
});
it.each(['network', 'unavailable', 'invalid-json', 'wrong-report', 'wrong-revision'])(
  'uses the frozen local report for %s failures',
  async (kind) => {
    const fetcher = vi.fn().mockImplementation(async () => {
      if (kind === 'network') throw new Error('offline');
      if (kind === 'unavailable') return new Response('', { status: 503 });
      if (kind === 'invalid-json') return new Response('<html>');
      return new Response(
        JSON.stringify({
          ...ai,
          ...(kind === 'wrong-report' ? { analysis_id: 'different-id' } : { state_revision: 999 }),
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);
    const client = await load();
    const summary = await client.createStandaloneSummary(report);
    expect(summary.analysis_id).toBe(report.analysis_id);
    expect(summary.output_mode).toBe('template');
    expect(summary.fallback_reason).toBe('provider_unavailable');
    expect(local).toHaveBeenCalledWith('/ai/summaries', {}, undefined, 'POST', {
      analysis_id: report.analysis_id,
    });
  },
);
it('supports an explicit AI retry after a fallback instead of caching the failure forever', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('', { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(ai)));
  vi.stubGlobal('fetch', fetcher);
  const client = await load();
  expect((await client.createStandaloneSummary(report)).output_mode).toBe('template');
  expect((await client.createStandaloneSummary(report)).output_mode).toBe('ai');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('preserves a server-provided fallback reason', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...fallback, fallback_reason: 'not_configured' })),
      ),
  );
  const client = await load();
  expect((await client.createStandaloneSummary(report)).fallback_reason).toBe('not_configured');
  expect(local).not.toHaveBeenCalled();
});
it('continues offline and when live requests are explicitly disabled', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('navigator', { onLine: false });
  const client = await load();
  expect((await client.createStandaloneSummary(report)).output_mode).toBe('template');
  const disabled = await load('0');
  expect((await disabled.createStandaloneSummary(report)).fallback_reason).toBe('disabled');
  expect(fetcher).not.toHaveBeenCalled();
});
it('honors caller cancellation without starting a local fallback or network call', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const client = await load(),
    controller = new AbortController();
  controller.abort();
  await expect(client.createStandaloneSummary(report, controller.signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  expect(local).not.toHaveBeenCalled();
});
