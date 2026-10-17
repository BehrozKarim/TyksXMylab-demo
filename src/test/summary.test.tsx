import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { Evidence } from '../api/contracts';
import { summarySchema, type ReportSummary } from '../api/summaries';
import { AiSummaryDrawer, AiSummaryPanel } from '../features/AiSummaryPanel';
import { initialState, makeEvidence } from '../mocks/fixtures';

const evidence = makeEvidence(new URLSearchParams(), initialState, 'report-one');
function complete(report = evidence): ReportSummary {
  const statements = [
    { fact_id: 'scope', text: 'This is the selected report.', paths: ['context.filters'] },
    {
      fact_id: 'interpretation',
      text: 'Laboratory results do not establish treatment effectiveness.',
      paths: ['context.method_version'],
    },
  ];
  return {
    summary_id: `summary-${report.analysis_id}`,
    analysis_id: report.analysis_id,
    run_id: report.context.run_id,
    state_revision: report.context.state_revision,
    method_version: report.context.method_version,
    as_of: report.context.as_of,
    language: 'en',
    status: 'ready',
    output_mode: 'template',
    paragraph: statements.map((s) => s.text).join(' '),
    statements,
    limitations: [
      {
        fact_id: 'coverage',
        text: 'The requested period is only partly covered.',
        paths: ['windows.rolling_12_months.coverage'],
      },
    ],
    supporting_facts: [],
    created_at: '2026-10-17T12:00:00Z',
    generated_at: '2026-10-17T12:00:01Z',
    provider: 'openai',
    model: null,
    fact_version: 'summary-facts-v1',
    prompt_version: 'summary-prompt-v1',
    output_version: 'summary-output-v1',
    validation: 'template',
    fallback_reason: 'not_configured',
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(report = evidence) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onEvidence = vi.fn();
  const tree = (report: Evidence, state = initialState) => (
    <QueryClientProvider client={client}>
      <AiSummaryPanel evidence={report} state={state} onEvidence={onEvidence} />
    </QueryClientProvider>
  );
  const view = render(tree(report));
  return {
    client,
    onEvidence,
    rerender: (next: Evidence, state = initialState) => view.rerender(tree(next, state)),
    close: () => {
      view.unmount();
      client.clear();
    },
  };
}

it('requests only on click, labels the fallback, and opens the matching evidence', async () => {
  const create = vi.spyOn(api, 'summarize').mockResolvedValue(complete());
  const poll = vi.spyOn(api, 'summary');
  const view = mount();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Summarize this report' }));
  await screen.findByText('Basic summary');
  expect(create).toHaveBeenCalledExactlyOnceWith(evidence);
  expect(poll).not.toHaveBeenCalled();
  expect(screen.getByText('The requested period is only partly covered.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View evidence' }));
  expect(view.onEvidence).toHaveBeenCalledExactlyOnceWith(evidence);
  view.close();
});

it('polls a queued job and displays only completed validated output', async () => {
  const ready = {
    ...complete(),
    output_mode: 'ai' as const,
    validation: 'approved_sentences' as const,
    fallback_reason: null,
  };
  vi.spyOn(api, 'summarize').mockResolvedValue({
    ...ready,
    status: 'queued',
    output_mode: null,
    paragraph: null,
    statements: [],
    limitations: [],
    generated_at: null,
    validation: 'pending',
  });
  const poll = vi.spyOn(api, 'summary').mockResolvedValue(ready);
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Summarize this report' }));
  await screen.findByText('Preparing the report summary…');
  await screen.findByText('AI-assisted summary', {}, { timeout: 3000 });
  expect(poll).toHaveBeenCalledTimes(1);
  view.close();
});

it('discards an old in-flight summary after a filter or report change without auto-generating', async () => {
  let resolve!: (summary: ReportSummary) => void;
  const create = vi.spyOn(api, 'summarize').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Summarize this report' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  const next = makeEvidence(
    new URLSearchParams({ ward_code: 'ICU' }),
    initialState,
    'different-population',
  );
  view.rerender(next);
  await act(async () => resolve(complete()));
  expect(screen.queryByText(complete().paragraph!)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Summarize updated report' })).toBeEnabled();
  expect(create).toHaveBeenCalledTimes(1);
  view.close();
});

it('keeps the summary explicitly on its older report during a revision refresh', async () => {
  const create = vi.spyOn(api, 'summarize').mockResolvedValue(complete());
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Summarize this report' }));
  await screen.findByText('Basic summary');
  view.rerender(evidence, { ...initialState, state_revision: initialState.state_revision + 1 });
  expect(screen.getByText(/belongs to an older report/)).toBeInTheDocument();
  expect(screen.getByText(complete().paragraph!)).toBeInTheDocument();
  expect(create).toHaveBeenCalledTimes(1);
  view.close();
});

it('keeps a summary request failure local to the panel and permits retry', async () => {
  const create = vi
    .spyOn(api, 'summarize')
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(complete());
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Summarize this report' }));
  await screen.findByText('Could not prepare summary');
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  await screen.findByText('Basic summary');
  expect(create).toHaveBeenCalledTimes(2);
  view.close();
});

it('rejects malformed completion and summaries for a different snapshot', async () => {
  expect(
    summarySchema.safeParse({ ...complete(), paragraph: 'An unsupported clinical recommendation.' })
      .success,
  ).toBe(false);
  expect(summarySchema.safeParse({ ...complete(), status: 'generating' }).success).toBe(false);
  for (const override of [
    { analysis_id: 'wrong' },
    { run_id: 'wrong' },
    { state_revision: 999 },
    { as_of: '2020-01-01' },
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...complete(), ...override }))),
    );
    await expect(api.summarize(evidence)).rejects.toThrow('does not match');
  }
});

it('generates with one home-page click and reuses the summary when reopened', async () => {
  const create = vi.spyOn(api, 'summarize').mockResolvedValue(complete());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiSummaryDrawer evidence={evidence} state={initialState} onEvidence={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  expect(screen.getByRole('dialog', { name: 'AI report summary' })).toBeInTheDocument();
  await screen.findByText('Basic summary');
  expect(screen.queryByRole('button', { name: 'Summarize this report' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  await screen.findByText('Basic summary');
  expect(create).toHaveBeenCalledTimes(1);
  client.clear();
});

it('shares pending creation across drawer reopening without duplicate requests', async () => {
  let resolve!: (summary: ReportSummary) => void;
  const create = vi.spyOn(api, 'summarize').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AiSummaryDrawer evidence={evidence} state={initialState} onEvidence={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  await screen.findByText('Preparing the report summary…');
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => resolve(complete()));
  await screen.findByText('Basic summary');
  expect(create).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
});

it('does not auto-generate for a report that changes while the drawer is open', async () => {
  const create = vi.spyOn(api, 'summarize').mockResolvedValue(complete());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (report: Evidence) => (
    <QueryClientProvider client={client}>
      <AiSummaryDrawer evidence={report} state={initialState} onEvidence={vi.fn()} />
    </QueryClientProvider>
  );
  const view = render(tree(evidence));
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  await screen.findByText('Basic summary');
  const next = makeEvidence(
    new URLSearchParams({ ward_code: 'ICU' }),
    initialState,
    'updated-report',
  );
  view.rerender(tree(next));
  expect(screen.queryByText(complete().paragraph!)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Summarize updated report' })).toBeEnabled();
  expect(create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
  create.mockResolvedValue(complete(next));
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  await screen.findByText('Basic summary');
  expect(create).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenLastCalledWith(next);
  view.unmount();
  client.clear();
});

it('offers retry after automatic generation fails without retrying on its own', async () => {
  const create = vi
    .spyOn(api, 'summarize')
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(complete());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <AiSummaryDrawer evidence={evidence} state={initialState} onEvidence={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'AI summary' }));
  await screen.findByText('Could not prepare summary');
  expect(create).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  await screen.findByText('Basic summary');
  expect(create).toHaveBeenCalledTimes(2);
  view.unmount();
  client.clear();
});
