// Browser-only component verification. This entry is excluded from the production build.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../src/api/client';
import type { Analysis } from '../../src/api/contracts';
import { resistanceInvestigationSchema, alertListSchema } from '../../src/api/alerts';
import { summarySchema } from '../../src/api/summaries';
import { initialState, meta, makeEvidence } from '../../src/mocks/fixtures';
import { analysis, context, record, monitor } from '../../src/test/alert-fixtures';
import { ResistanceInvestigation, ResistanceAlerts } from '../../src/features/ResistanceAlerts';
import { AiSummaryDrawer } from '../../src/features/AiSummaryPanel';
import { SusceptibilityTimeChart } from '../../src/features/SusceptibilityTimeChart';
import { trendPoints } from '../../src/test/trend-fixtures';
import { ProvenanceDrawer } from '../../src/features/ProvenanceDrawer';
import { ExportToast } from '../../src/components/ExportToast';
import { rememberTrigger } from '../../src/components/focus';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '../../src/styles/tokens.css';
import '../../src/styles/global.css';
import '../../src/styles/workspace.css';

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'current';
const sparse = scenario === 'sparse';
const cleared = scenario === 'cleared';
const current = {
  ...analysis,
  analysis_id: 'latest',
  context: { ...context, state_revision: 8 },
  evaluation: {
    ...analysis.evaluation,
    status: sparse ? 'insufficient_evidence' : cleared ? 'below_threshold' : 'triggered',
    resistance_change_pp: sparse ? null : cleared ? 0 : 10,
    recent: {
      ...analysis.evaluation.recent,
      ...(sparse ? { n_eligible: 29, n_tested: 29, n_s: 20, resistance_pct: null } : {}),
      ...(cleared ? { n_s: 24, n_r: 6, resistance_pct: 20 } : {}),
    },
  },
};
const alert = {
  ...record,
  status: sparse ? 'insufficient_evidence' : cleared ? 'cleared' : 'ongoing',
};
const investigation = resistanceInvestigationSchema.parse({
  alert,
  original_detection: analysis,
  current_analysis: scenario === 'archived' ? null : current,
  current_analysis_status: scenario === 'archived' ? 'archived_run' : 'available',
  transitions: [
    {
      state_revision: 7,
      monitoring_as_of: '2026-09-27',
      previous_status: null,
      status: 'new',
      analysis_id: 'detection',
    },
    {
      state_revision: 8,
      monitoring_as_of: '2026-09-27',
      previous_status: 'new',
      status: alert.status,
      analysis_id: 'latest',
    },
  ],
});
api.resistanceInvestigation = async () => investigation;
api.resistanceAlerts = async () =>
  alertListSchema.parse({
    run_id: initialState.run_id,
    state_revision: 8,
    monitoring_revision: 8,
    monitoring_as_of: initialState.demo_date,
    configuration: { threshold_pp: 10, minimum_tested: 30, monitors: [monitor] },
    alerts: [alert],
    monitors: [current],
  });
api.export = async (id) => {
  document.body.dataset.exportId = id;
};
let requests = 0;
api.summarize = async (report) => {
  document.body.dataset.summaryRequests = String(++requests);
  const statements = [
    {
      fact_id: 'scope',
      text: 'This summary describes the selected saved report.',
      paths: ['context.filters'],
    },
    {
      fact_id: 'interpretation',
      text: 'Laboratory susceptibility does not establish treatment effectiveness.',
      paths: ['context.method_version'],
    },
  ];
  return summarySchema.parse({
    summary_id: 'browser-summary',
    analysis_id: report.analysis_id,
    run_id: report.context.run_id,
    state_revision: report.context.state_revision,
    method_version: report.context.method_version,
    as_of: report.context.as_of,
    language: 'en',
    status: 'ready',
    output_mode: 'ai',
    paragraph: statements.map((s) => s.text).join(' '),
    statements,
    limitations: [statements[1]],
    supporting_facts: [],
    created_at: '2026-10-17T12:00:00Z',
    generated_at: '2026-10-17T12:00:01Z',
    provider: 'openai',
    model: 'gpt-4o-mini',
    fact_version: 'summary-facts-v1',
    prompt_version: 'summary-prompt-v1',
    output_version: 'summary-output-v1',
    validation: 'approved_sentences',
    fallback_reason: null,
  });
};
const evidence = makeEvidence(new URLSearchParams(), initialState, 'browser-evidence');
export function SummaryHarness() {
  const [provenance, setProvenance] = useState<Analysis | null>(null);
  return (
    <>
      <h1>Ward overview</h1>
      <AiSummaryDrawer
        evidence={evidence}
        state={initialState}
        onEvidence={(report) => {
          rememberTrigger();
          setProvenance(report);
        }}
      />
      <ProvenanceDrawer meta={meta} analysis={provenance} onClose={() => setProvenance(null)} />
    </>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/investigate/alert1']}>
      <main className="main-content">
        {scenario === 'trend' ? (
          <section className="panel trend-panel">
            <h1>Susceptibility over time</h1>
            <SusceptibilityTimeChart points={trendPoints} antibiotic="Ciprofloxacin" year={2026} />
          </section>
        ) : scenario === 'summary' ? (
          <SummaryHarness />
        ) : scenario === 'alerts' || scenario === 'past-alerts' ? (
          <ResistanceAlerts
            state={initialState}
            meta={meta}
            reportDate={scenario === 'past-alerts' ? '2026-09-20' : initialState.demo_date}
            onLatest={() => {}}
          />
        ) : (
          <Routes>
            <Route
              path="/investigate/:investigationId"
              element={<ResistanceInvestigation state={initialState} meta={meta} />}
            />
          </Routes>
        )}
      </main>
      <ExportToast />
    </MemoryRouter>
  </QueryClientProvider>,
);
