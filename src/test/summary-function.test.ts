// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createSummaryHandler } from '../../api/summarize';
import { SummaryService } from '../../server/summary-service';
import { buildSummaryFacts, summaryRequestSchema, validateChoices } from '../summary/facts';
import { summarySchema } from '../api/summaries';
import { summarySource } from './summary-source';

const report = summarySource();
const choices = buildSummaryFacts(report)
  .filter((f) => f.section === 'paragraph')
  .map((f) => ({ fact_id: f.fact_id, variant: 1 }));
const providerResult = () =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify({ sentences: choices }) }],
        },
      ],
    }),
    { status: 200 },
  );
let server: Server | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});
async function host(options: Parameters<typeof createSummaryHandler>[0] = {}) {
  server = createServer(createSummaryHandler(options));
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    post: (body: unknown = { report }, headers: Record<string, string> = {}) =>
      fetch(`${base}/api/summarize`, {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
  };
}
it('returns a genuine configured AI result over HTTP without exposing the key', async () => {
  const provider = vi.fn().mockImplementation(async () => providerResult());
  const api = await host({
    service: new SummaryService({ fetch: provider }),
    env: () => ({ OPENAI_API_KEY: 'test-server-secret' }),
  });
  const response = await api.post();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const raw = await response.text(),
    summary = summarySchema.parse(JSON.parse(raw));
  expect(summary.output_mode).toBe('ai');
  expect(summary.analysis_id).toBe(report.analysis_id);
  expect(raw).not.toContain('test-server-secret');
  expect(provider).toHaveBeenCalledOnce();
  const [url, init] = provider.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(init.headers.Authorization).toBe('Bearer test-server-secret');
  const payload = JSON.parse(init.body);
  expect(payload.store).toBe(false);
  expect(payload.model).toBe('gpt-4.1-mini');
  expect(payload.text.format.strict).toBe(true);
  expect(payload.input).not.toContain('patient_id');
  expect(payload.input).not.toContain('cultures');
});
it('serves a complete template if the key is absent or AI is disabled', async () => {
  const provider = vi.fn();
  let settings = {};
  const api = await host({ service: new SummaryService({ fetch: provider }), env: () => settings });
  let summary = summarySchema.parse(await (await api.post()).json());
  expect(summary.output_mode).toBe('template');
  expect(summary.fallback_reason).toBe('not_configured');
  settings = { OPENAI_API_KEY: 'test-key', AI_SUMMARY_ENABLED: '0' };
  summary = summarySchema.parse(await (await api.post()).json());
  expect(summary.fallback_reason).toBe('disabled');
  expect(provider).not.toHaveBeenCalled();
});
it('rejects unsupported methods, foreign origins, content types and inconsistent reports before calling OpenAI', async () => {
  const provider = vi.fn();
  const api = await host({
    service: new SummaryService({ fetch: provider }),
    env: () => ({ OPENAI_API_KEY: 'test-key' }),
  });
  expect((await fetch(`${api.base}/api/summarize`)).status).toBe(405);
  expect((await api.post({ report }, { Origin: 'https://another.example' })).status).toBe(403);
  expect((await api.post({ report }, { 'Content-Type': 'text/plain' })).status).toBe(415);
  expect((await api.post({ report, patient_records: [] })).status).toBe(422);
  const invalid = structuredClone(report);
  invalid.windows.rolling_12m.susceptibility_pct = 1;
  expect((await api.post({ report: invalid })).status).toBe(422);
  expect((await api.post({ report, padding: 'x'.repeat(24000) })).status).toBe(413);
  expect(provider).not.toHaveBeenCalled();
});
it('uses content caching and binds a cached result to the requesting analysis ID', async () => {
  const provider = vi.fn().mockImplementation(async () => providerResult());
  const service = new SummaryService({ fetch: provider });
  const first = await service.summarize(report, 'client', { apiKey: 'test-key' });
  const second = await service.summarize({ ...report, analysis_id: 'new-analysis-id' }, 'client', {
    apiKey: 'test-key',
  });
  expect(provider).toHaveBeenCalledOnce();
  expect(second.analysis_id).toBe('new-analysis-id');
  expect(second.paragraph).toBe(first.paragraph);
  await service.summarize(
    { ...report, context: { ...report.context, state_revision: 2 } },
    'client',
    { apiKey: 'test-key' },
  );
  expect(provider).toHaveBeenCalledTimes(2);
});
it('shares concurrent provider work while retaining each caller identity', async () => {
  let finish!: (response: Response) => void;
  const provider = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const service = new SummaryService({ fetch: provider });
  const first = service.summarize(report, 'one', { apiKey: 'test-key' });
  const second = service.summarize({ ...report, analysis_id: 'another-id' }, 'two', {
    apiKey: 'test-key',
  });
  expect(provider).toHaveBeenCalledOnce();
  finish(providerResult());
  const results = await Promise.all([first, second]);
  expect(results.map((r) => r.analysis_id)).toEqual([report.analysis_id, 'another-id']);
});
it.each(['unavailable', 'refusal', 'invalid-json', 'invented-fact', 'missing-fact', 'incomplete'])(
  'falls back safely for %s output',
  async (kind) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = vi.fn().mockImplementation(async () => {
      if (kind === 'unavailable') return new Response('rate limited', { status: 429 });
      let body: unknown = { sentences: choices };
      if (kind === 'invented-fact')
        body = { sentences: [...choices.slice(0, -1), { fact_id: 'take-antibiotic', variant: 0 }] };
      if (kind === 'missing-fact') body = { sentences: choices.slice(1) };
      return new Response(
        JSON.stringify({
          status: kind === 'incomplete' ? 'incomplete' : 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: kind === 'refusal' ? 'refusal' : 'output_text',
                  text: kind === 'invalid-json' ? '{' : JSON.stringify(body),
                },
              ],
            },
          ],
        }),
      );
    });
    const summary = await new SummaryService({ fetch: provider }).summarize(report, 'client', {
      apiKey: 'test-key',
    });
    expect(summary.output_mode).toBe('template');
    expect(summary.fallback_reason).toBe(
      kind === 'unavailable' ? 'provider_unavailable' : 'invalid_output',
    );
    expect(summarySchema.safeParse(summary).success).toBe(true);
  },
);
it('times out provider requests and lets subsequent explicit attempts recover', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const provider = vi
    .fn()
    .mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new Error('timeout')), {
            once: true,
          });
        }),
    )
    .mockImplementation(async () => providerResult());
  const service = new SummaryService({ fetch: provider, timeoutMs: 10 });
  expect((await service.summarize(report, 'client', { apiKey: 'test-key' })).fallback_reason).toBe(
    'provider_unavailable',
  );
  expect((await service.summarize(report, 'client', { apiKey: 'test-key' })).output_mode).toBe(
    'ai',
  );
});
it('applies a bounded per-client request limit', async () => {
  const api = await host({ env: () => ({}) });
  for (let i = 0; i < 20; i++) expect((await api.post()).status).toBe(200);
  const response = await api.post();
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('60');
});
it('does not send suppressed percentages or resistant/susceptible counts as model facts', () => {
  const sparse = structuredClone(report),
    w = sparse.windows.last_28d;
  Object.assign(w, {
    status: 'insufficient_data',
    n_eligible: 29,
    n_tested: 29,
    n_s: 20,
    n_r: 9,
    n_not_tested: 0,
    susceptibility_pct: null,
    resistance_pct: null,
    ci95: {
      susceptibility: { lower: null, upper: null },
      resistance: { lower: null, upper: null },
    },
  });
  expect(summaryRequestSchema.safeParse({ report: sparse }).success).toBe(true);
  const facts = buildSummaryFacts(sparse).filter((f) => f.fact_id.startsWith('last_28d'));
  expect(JSON.stringify(facts)).not.toMatch(/n_s|n_r|68\.9|31\.0/);
  expect(facts.find((f) => f.fact_id === 'last_28d')!.variants[0]).toContain(
    'below the minimum of 30',
  );
  expect(() =>
    validateChoices({ sentences: choices.slice(1) }, buildSummaryFacts(report)),
  ).toThrow();
});
