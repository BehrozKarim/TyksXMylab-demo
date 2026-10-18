import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  CircleHelp,
  FlaskConical,
  UsersRound,
  SearchCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { api, DATA_MODE } from '../api/client';
import type { Analysis, CohortQuery, Meta, ReplayState, WindowKey } from '../api/contracts';
import { useAnalysis, useMeta, useReplayState } from './queries';
import { Button, Drawer, ErrorPanel, Loading, RefreshNotice } from '../components/ui';
import { rememberTrigger } from '../components/focus';
import { readCohort, writeCohort } from '../domain/cohort';
import { cohortLabel, drugLabel, formatDate } from '../domain/formatters';
import { CohortControls } from '../features/CohortControls';
import { EvidenceCards } from '../features/EvidenceCards';
import { AntibioticComparison } from '../features/AntibioticComparison';
import { ReviewFlags } from '../features/ReviewFlags';
import { PatientHistoryDrawer } from '../features/PatientHistoryDrawer';
import { ProvenanceDrawer } from '../features/ProvenanceDrawer';
import { InvestigationPage } from '../features/InvestigationPage';
import { CohortInvestigation } from '../features/CohortInvestigation';
import { SusceptibilityTrend } from '../features/SusceptibilityTrend';
import { ResistanceAlerts, ResistanceInvestigation } from '../features/ResistanceAlerts';
import { DemoControls } from '../features/DemoControls';
import { AiSummaryDrawer } from '../features/AiSummaryPanel';
import { ExportToast } from '../components/ExportToast';

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <svg width="29" height="29" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M9 11v13a6 6 0 0 0 11 3 6 6 0 0 0 11-3V11M20 14v13"
            stroke="currentColor"
            strokeWidth="3.3"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="brand-type">
        <span className="brand-word">
          ward<span>evidence</span>
        </span>
        <span className="brand-sub">TYKS × MYLAB</span>
      </span>
    </span>
  );
}
function AlertCount({ state }: { state: ReplayState }) {
  const alerts = useAnalysis('resistance-alerts', state, {}, (signal) =>
    api.resistanceAlerts(state, signal),
  );
  const count = alerts.data?.alerts.filter((item) => item.status !== 'cleared').length;
  return count ? (
    <span className="nav-count" aria-label={`${count} alerts to review`}>
      {count}
    </span>
  ) : null;
}
function Workspace({
  meta,
  state,
  refreshError,
  onRetryRefresh,
  refreshing,
}: {
  meta: Meta;
  state: ReplayState;
  refreshError: Error | null;
  onRetryRefresh: () => void;
  refreshing: boolean;
}) {
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const { query, issues, pinned } = readCohort(search, meta, state);
  const [patientOpen, setPatientOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [provenance, setProvenance] = useState<{ analysis: Analysis; window?: WindowKey } | null>(
    null,
  );
  const client = useQueryClient();
  const previousRun = useRef(state.run_id);
  useEffect(() => {
    if (previousRun.current !== state.run_id) {
      const oldRun = previousRun.current;
      void client.cancelQueries({
        predicate: (q) => q.queryKey[0] === 'analysis' && q.queryKey[2] === oldRun,
      });
      client.removeQueries({
        predicate: (q) => q.queryKey[0] === 'analysis' && q.queryKey[2] === oldRun,
      });
      setPatientOpen(false);
      setProvenance(null);
      previousRun.current = state.run_id;
    }
  }, [state.run_id, client]);
  const alertsPage =
    location.pathname.startsWith('/alerts') ||
    (!!meta.capabilities?.alerts && location.pathname.startsWith('/investigate/'));
  const investigation = !alertsPage && location.pathname.startsWith('/investigate');
  const serialized = writeCohort(query, pinned).toString();
  const searchString = search.toString();
  useEffect(() => {
    if (!issues.length && serialized !== searchString) setSearch(serialized, { replace: true });
  }, [serialized, searchString, setSearch, issues.length]);
  useEffect(() => {
    (document.querySelector<HTMLElement>('h1') ?? document.getElementById('main-content'))?.focus();
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  const apply = (next: CohortQuery, datePinned = pinned) =>
    setSearch(writeCohort(next, datePinned));
  const showProvenance = (analysis: Analysis, window?: WindowKey) => {
    rememberTrigger();
    setProvenance({ analysis, window });
  };
  const showPatients = () => {
    rememberTrigger();
    setPatientOpen(true);
  };
  const showGuide = () => {
    rememberTrigger();
    setGuideOpen(true);
  };
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to evidence
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to={`/ward?${search}`} className="brand-link" aria-label="Ward Evidence home">
            <Brand />
          </Link>
          <nav className="app-nav" aria-label="Main navigation">
            <Link
              aria-label="Ward overview"
              className="nav-pill"
              aria-current={!investigation && !alertsPage ? 'page' : undefined}
              to={`/ward?${search}`}
            >
              Ward overview
            </Link>
            <Link
              aria-label="Investigate susceptibility"
              className="nav-pill"
              aria-current={investigation ? 'page' : undefined}
              to={`/investigate?${search}`}
            >
              Investigate susceptibility
            </Link>
            {meta.capabilities?.alerts && (
              <Link
                className="nav-pill"
                aria-label="Resistance alerts"
                aria-current={alertsPage ? 'page' : undefined}
                to={`/alerts?${search}`}
              >
                Resistance alerts <AlertCount state={state} />
              </Link>
            )}
            <button className="nav-pill" aria-label="Patient history" onClick={showPatients}>
              <UsersRound size={17} />
              Patient history
            </button>
          </nav>
          <div className="app-header-right">
            <DemoControls state={state} />
            {DATA_MODE !== 'standalone' && import.meta.env.VITE_DEMO_CONTROLS !== '1' && (
              <span className="synthetic-label">
                <span />
                {state.mode === 'feed' ? 'External feed' : 'Synthetic data'}
              </span>
            )}
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="About this workspace"
              onClick={showGuide}
            >
              <CircleHelp size={19} />
            </Button>
            <span className="workspace-avatar" aria-label="Research workspace">
              WE
            </span>
          </div>
        </div>
      </header>
      <div className="app-body">
        <div className="workspace-notices">
          <RefreshNotice
            error={refreshError}
            onRetry={onRetryRefresh}
            pending={refreshing}
            title="Could not refresh the workspace"
          />
          {DATA_MODE === 'fixtures' && (
            <div className="fixture-notice">
              <FlaskConical size={15} />
              <span>
                {DATA_MODE === 'fixtures' ? (
                  <>
                    <strong>Fixture preview</strong>
                    <span className="notice-divider">/</span>Authored examples for exploring the
                    interface. Not findings from the source dataset.
                  </>
                ) : (
                  <>
                    <strong>Synthetic research workspace</strong>
                    <span className="notice-divider">/</span>Connected to the configured evidence
                    API.
                  </>
                )}
              </span>
              <button onClick={showGuide}>
                Details <ArrowRight size={13} />
              </button>
            </div>
          )}
          {issues.length > 0 && (
            <div className="validation-notice" role="alert">
              <strong>Some link values needed attention.</strong> {issues.join(' ')} The controls
              below show the explicit defaults.
            </div>
          )}
        </div>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Navigate to={`/ward?${search}`} replace />} />
            <Route
              path="/ward"
              element={
                <WardPage
                  meta={meta}
                  state={state}
                  query={query}
                  pinned={pinned}
                  search={`?${search}`}
                  onApply={apply}
                  onProvenance={showProvenance}
                />
              }
            />
            <Route
              path="/investigate"
              element={
                <CohortInvestigation
                  state={state}
                  meta={meta}
                  query={query}
                  onApply={apply}
                  onProvenance={showProvenance}
                />
              }
            />
            <Route
              path="/investigate/:investigationId"
              element={
                DATA_MODE !== 'fixtures' ? (
                  <ResistanceInvestigation state={state} meta={meta} />
                ) : (
                  <InvestigationPage state={state} meta={meta} onProvenance={showProvenance} />
                )
              }
            />
            <Route
              path="/alerts"
              element={
                <ResistanceAlerts
                  state={state}
                  meta={meta}
                  reportDate={query.as_of}
                  onLatest={() => apply({ ...query, as_of: state.demo_date }, false)}
                />
              }
            />
            <Route
              path="*"
              element={
                <div className="not-found">
                  <h1>Page not found</h1>
                  <p>Return to the ward workspace to continue.</p>
                  <Link className="button button--primary" to="/ward">
                    Open ward overview
                  </Link>
                </div>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>TYKS × mylab · JunctionX Turku · Prototype</span>
          </footer>
        </main>
      </div>
      <ExportToast />
      {patientOpen && (
        <PatientHistoryDrawer
          key={state.run_id}
          open={patientOpen}
          onClose={() => setPatientOpen(false)}
          state={state}
          asOf={query.as_of}
          meta={meta}
        />
      )}
      <ProvenanceDrawer
        key={provenance?.analysis.analysis_id ?? 'closed'}
        analysis={provenance?.analysis ?? null}
        window={provenance?.window}
        meta={meta}
        onClose={() => setProvenance(null)}
      />
      <Drawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="Reading the evidence"
        description="A research workspace for understanding observed laboratory susceptibility."
      >
        <div className="guide-hero">
          <Activity size={30} />
          <h3>Every number needs its context.</h3>
          <p>
            Choose a cohort, read its last 12-month and 28-day evidence, then investigate the
            counts.
          </p>
        </div>
        <div className="drawer-section">
          <h3>What these results mean</h3>
          <p>
            Susceptible and resistant describe recorded laboratory results. The interval describes
            uncertainty in the observed proportion; it does not predict treatment success.
          </p>
          <p>
            At least 30 tested isolates are required to display a percentage. Missing tests remain
            visible and do not count as resistance.
          </p>
        </div>
        <div className="drawer-section">
          <h3>About this preview</h3>
          <p>
            {DATA_MODE === 'fixtures'
              ? 'This preview uses authored fixtures for interface testing.'
              : DATA_MODE === 'standalone'
                ? 'This demo uses the bundled synthetic dataset. Lab batches and calculations run in this browser. Each export retains its original analysis snapshot.'
                : 'Evidence is requested from the published dataset API. Each export retains its original analysis snapshot.'}
          </p>
          <p>
            The source contains synthetic microbiology samples. The report end date sets both
            rolling periods; the chart year applies only to the time chart.
          </p>
        </div>
        {DATA_MODE === 'fixtures' && (
          <div className="drawer-section">
            <h3>Explore support states</h3>
            <p>
              In fixture mode: Urology demonstrates available evidence; Intensive care shows a
              sparse recent cohort; Geriatrics shows missing tests; Health centre North shows an
              empty cohort. Mecillinam demonstrates a paired denominator below 30.
            </p>
            <div className="support-shortcuts">
              {[
                { name: 'Urology', ward: 'URO' },
                { name: 'Intensive care', ward: 'ICU' },
                { name: 'Geriatrics', ward: 'GER' },
                { name: 'Health centre North', ward: 'PHC-N' },
                { name: 'Mecillinam comparison', ward: 'URO', antibiotic: 'MEC' },
              ].map((shortcut) => (
                <Link
                  className="button button--secondary"
                  key={shortcut.name}
                  to={`/ward?${writeCohort({ ...query, ward_code: shortcut.ward, antibiotic_b: shortcut.antibiotic ?? query.antibiotic_b }, pinned)}`}
                  onClick={() => setGuideOpen(false)}
                >
                  {shortcut.name}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="small-note">
          Tyks × Mylab · JunctionX Turku
          <br />A prototype using synthetic microbiology evidence.
        </div>
      </Drawer>
    </div>
  );
}
function WardPage({
  meta,
  state,
  query,
  pinned,
  search,
  onApply,
  onProvenance,
}: {
  meta: Meta;
  state: ReplayState;
  query: CohortQuery;
  pinned: boolean;
  search: string;
  onApply: (q: CohortQuery, pinned?: boolean) => void;
  onProvenance: (a: Analysis, w?: WindowKey) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editorVersion, setEditorVersion] = useState(0);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const closeFilters = () => {
    setFiltersOpen(false);
    editTrigger.current?.focus();
  };
  const evidence = useAnalysis('evidence', state, query, (signal) =>
    api.evidence(query, state, signal),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <span className="eyebrow">Antibiotic susceptibility</span>
            <span className="heading-dash" />
            <span className="heading-hospital">Tyks × Mylab</span>
          </div>
          <h1 tabIndex={-1}>Ward overview</h1>
        </div>
        <div className="heading-actions">
          {DATA_MODE !== 'fixtures' && (
            <AiSummaryDrawer evidence={evidence.data} state={state} onEvidence={onProvenance} />
          )}
          <Link className="button button--primary" to={`/investigate${search}`}>
            <SearchCheck size={17} />
            Investigate cohort
          </Link>
          <Button
            disabled={!evidence.data}
            onClick={() => evidence.data && onProvenance(evidence.data)}
          >
            <ArrowDownToLine size={16} />
            Export snapshot
          </Button>
        </div>
      </div>
      <section className="query-panel" aria-label="Current evidence query">
        <div className="query-panel-heading">
          <span className="eyebrow">Current query</span>
          <Button
            ref={editTrigger}
            aria-expanded={filtersOpen}
            aria-controls="query-editor"
            onClick={() => {
              setFiltersOpen(!filtersOpen);
              setEditorVersion((v) => v + 1);
            }}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            {filtersOpen ? 'Close filters' : 'Edit query'}
          </Button>
        </div>
        <dl className="query-summary">
          <div>
            <dt>Ward</dt>
            <dd>{meta.wards.find((w) => w.code === query.ward_code)?.label ?? 'All wards'}</dd>
          </div>
          <div>
            <dt>Organism</dt>
            <dd>{query.organism}</dd>
          </div>
          <div>
            <dt>Specimen</dt>
            <dd>{query.specimen}</dd>
          </div>
          <div>
            <dt>Antibiotic</dt>
            <dd>{drugLabel(query.antibiotic_code, meta)}</dd>
          </div>
        </dl>
        <div className="applied-context query-population">
          <p>
            {query.sex === 'F' ? 'women' : query.sex === 'M' ? 'men' : 'All sexes'} ·{' '}
            {query.age_min !== null || query.age_max !== null
              ? `Ages ${query.age_min ?? 0}–${query.age_max ?? '120+'}`
              : 'All ages'}
            {' · '}
            {query.dedup_scope === 'all_wards'
              ? 'First isolate across all wards'
              : 'First isolate within selected cohort'}
          </p>
        </div>
        <div className="query-reporting">
          <div className="date-controls">
            <label className="field inline-field">
              <span>Report end date</span>
              <input
                type="date"
                aria-describedby="report-date-help"
                value={query.as_of}
                min={meta.source.start}
                max={state.demo_date}
                onChange={(e) => {
                  if (e.target.value)
                    onApply(
                      {
                        ...query,
                        as_of: e.target.value,
                        calendar_year: Math.min(
                          query.calendar_year,
                          Number(e.target.value.slice(0, 4)),
                        ),
                      },
                      true,
                    );
                }}
              />
            </label>
            {pinned ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onApply({ ...query, as_of: state.demo_date }, false)}
              >
                Use latest date
              </Button>
            ) : (
              <span className="following-label">
                <span />
                Latest published samples
              </span>
            )}
          </div>
          <p id="report-date-help" className="sr-only">
            Both headline periods end on this date. The chart year below affects only the time
            chart.
          </p>
        </div>
        <div id="query-editor" hidden={!filtersOpen}>
          <CohortControls
            key={`${JSON.stringify(query)}-${editorVersion}`}
            query={query}
            meta={meta}
            onApply={(next) => {
              onApply(next);
              closeFilters();
            }}
            onCancel={closeFilters}
          />
        </div>
      </section>
      <div className="evidence-section-title">
        <div>
          <span className="eyebrow">Evidence · two overlapping periods</span>
          <h2>Susceptibility at a glance</h2>
          <p>
            <strong>{drugLabel(query.antibiotic_code, meta)}</strong> · observed laboratory
            susceptibility
          </p>
        </div>
        <p className="period-overlap-note">
          The last 12 months includes the recent 28 days. These are overlapping time periods.
        </p>
      </div>
      <div aria-live="polite" className="sr-only">
        {evidence.data
          ? `Evidence loaded for ${cohortLabel(evidence.data.context.filters, meta)}, through ${formatDate(evidence.data.context.as_of)}.`
          : 'Updating evidence.'}
      </div>
      <RefreshNotice
        error={evidence.refreshError}
        onRetry={() => void evidence.refetch()}
        pending={evidence.isFetching}
      />
      {evidence.isPending ? (
        <div className="period-loading" aria-busy="true">
          <Loading />
          {[1].map((n) => (
            <div className="skeleton-card" key={n} />
          ))}
        </div>
      ) : evidence.isError ? (
        <ErrorPanel error={evidence.error} onRetry={() => void evidence.refetch()} />
      ) : (
        <EvidenceCards
          evidence={evidence.data}
          onProvenance={(window) => onProvenance(evidence.data, window)}
          onLongerWindow={() => {
            onApply({ ...query, window: 'rolling_12m' });
            document.getElementById('comparison')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}
      <AntibioticComparison
        query={query}
        state={state}
        meta={meta}
        onChange={onApply}
        onProvenance={onProvenance}
      />
      <SusceptibilityTrend
        followLatest={!pinned}
        query={query}
        state={state}
        meta={meta}
        onProvenance={onProvenance}
        onYearChange={(year) => onApply({ ...query, calendar_year: year })}
      />
      {DATA_MODE === 'fixtures' && (
        <details className="data-disclosure fixture-flags" id="review">
          <summary>Authored resistance-alert scenario</summary>
          <ReviewFlags
            state={state}
            asOf={query.as_of}
            search={search}
            onFollow={() => onApply({ ...query, as_of: state.demo_date }, false)}
          />
        </details>
      )}
    </>
  );
}
export default function App() {
  const meta = useMeta();
  const state = useReplayState();
  if ((!meta.data || !state.data) && (meta.isPending || state.isPending))
    return (
      <div className="boot-screen">
        <Brand />
        <Loading label="Preparing your evidence workspace…" />
      </div>
    );
  if (!meta.data || !state.data)
    return (
      <div className="boot-screen">
        <Brand />
        <ErrorPanel
          error={meta.error ?? state.error}
          title="Could not open the workspace"
          onRetry={() => {
            void meta.refetch();
            void state.refetch();
          }}
        />
      </div>
    );
  return (
    <Workspace
      meta={meta.data}
      state={state.data}
      refreshError={meta.error ?? state.error}
      refreshing={meta.isFetching || state.isFetching}
      onRetryRefresh={() => {
        void meta.refetch();
        void state.refetch();
      }}
    />
  );
}
