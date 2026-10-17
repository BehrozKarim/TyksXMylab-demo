import { useState } from 'react';
import { notifyExport } from '../components/export-notifications';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BellDot, Download } from 'lucide-react';
import { api } from '../api/client';
import type { Meta, ReplayState } from '../api/contracts';
import type { AlertAnalysis, AlertInvestigation } from '../api/alerts';
import { alertStatusLabels, monitorLabel } from '../api/alerts';
import { useAnalysis } from '../app/queries';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorPanel,
  Loading,
  RefreshNotice,
  Panel,
  SectionHeading,
} from '../components/ui';
import { drugLabel, formatDate, formatRange, percentage } from '../domain/formatters';

function SnapshotDownloads({ report }: { report: AlertAnalysis }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const download = async (format: 'csv' | 'json') => {
    setPending(true);
    setError('');
    try {
      await api.export(report.analysis_id, format);
      notifyExport(format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="alert-downloads">
      <Button disabled={pending} variant="primary" onClick={() => void download('csv')}>
        <Download size={15} />
        CSV
      </Button>
      <Button disabled={pending} onClick={() => void download('json')}>
        JSON
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
function changeLabel(value: number | null) {
  return value === null ? 'Not reported' : `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`;
}
function evaluationLabel(report: AlertAnalysis) {
  return {
    triggered: 'Threshold met',
    below_threshold: 'Below threshold',
    insufficient_evidence: 'Insufficient evidence',
    unavailable: 'Unavailable',
  }[report.evaluation.status];
}
export function ResistanceAlerts({
  state,
  meta,
  reportDate,
  onLatest,
}: {
  state: ReplayState;
  meta: Meta;
  reportDate: string;
  onLatest: () => void;
}) {
  const location = useLocation();
  const result = useAnalysis(
    'resistance-alerts',
    state,
    {},
    (signal) => api.resistanceAlerts(state, signal),
    reportDate === state.demo_date,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Resistance monitoring</span>
          <h1 tabIndex={-1}>Resistance alerts</h1>
          <p>Review increases in resistance within the monitored patient groups.</p>
        </div>
        <span className="section-icon">
          <BellDot size={21} />
        </span>
      </div>
      {reportDate !== state.demo_date ? (
        <Panel>
          <EmptyState title="Alerts follow the latest monitoring date">
            Your report ends on {formatDate(reportDate)}. Current alerts belong to{' '}
            {formatDate(state.demo_date)}.
          </EmptyState>
          <Button variant="primary" onClick={onLatest}>
            View latest monitoring
          </Button>
        </Panel>
      ) : result.isPending ? (
        <Loading label="Loading resistance monitoring…" />
      ) : result.isError ? (
        <ErrorPanel error={result.error} onRetry={() => void result.refetch()} />
      ) : (
        <>
          <RefreshNotice
            error={result.refreshError}
            onRetry={() => void result.refetch()}
            pending={result.isFetching}
          />
          <div className="monitoring-summary">
            <span>
              Monitoring date <strong>{formatDate(result.data.monitoring_as_of)}</strong>
            </span>
            <span>
              Monitored groups<strong>{result.data.configuration.monitors.length}</strong>
            </span>
            <span>
              Proposed threshold<strong>{result.data.configuration.threshold_pp} pp</strong>
            </span>
          </div>
          <Panel>
            <SectionHeading
              title="Alerts to investigate"
              description="Each alert names its own cohort; ward-screen filters do not redefine it."
            />
            {result.data.alerts.length === 0 ? (
              <EmptyState title="No active resistance alerts">
                No monitored group currently has an active alert. This does not mean every group has
                enough data.
              </EmptyState>
            ) : (
              <div className="resistance-alert-list">
                {result.data.alerts.map((alert) => {
                  const report = result.data.monitors.find(
                    (m) => m.context.monitor_id === alert.monitor_id,
                  )!;
                  return (
                    <article key={alert.alert_id} className="resistance-alert-row">
                      <div>
                        <Badge tone={alert.status === 'cleared' ? 'neutral' : 'warning'}>
                          {alertStatusLabels[alert.status]}
                        </Badge>
                        <h3>{drugLabel(alert.antibiotic_code, meta)} resistance</h3>
                        <p>{monitorLabel(report.context.monitor, meta)}</p>
                        <p>
                          {changeLabel(report.evaluation.resistance_change_pp)} · First detected{' '}
                          {formatDate(alert.first_trigger_date)}
                        </p>
                        {alert.status === 'insufficient_evidence' && (
                          <p>
                            Last sufficient state: {alertStatusLabels[alert.last_sufficient_state]}.
                            Low counts do not establish clearance.
                          </p>
                        )}
                      </div>
                      <Link
                        className="button button--primary"
                        to={`/investigate/${encodeURIComponent(alert.investigation_id)}${location.search}`}
                      >
                        Investigate alert <ArrowRight size={16} />
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
          <Panel>
            <SectionHeading
              title="Monitored groups"
              description="Recent 28-day resistance compared with the preceding, separate 12-month baseline."
            />
            <div className="monitor-table">
              <DataTable label="Monitored resistance evaluations">
                <table>
                  <thead>
                    <tr>
                      <th>Patient group</th>
                      <th>Recent resistance</th>
                      <th>Baseline resistance</th>
                      <th>Change</th>
                      <th>Evaluation</th>
                      <th>Snapshot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.monitors.map((report) => {
                      const e = report.evaluation;
                      return (
                        <tr key={report.context.monitor_id}>
                          <th scope="row">
                            {monitorLabel(report.context.monitor, meta)}
                            <br />
                            {drugLabel(report.context.monitor.antibiotic_code, meta)}
                          </th>
                          <td>
                            {percentage(e.recent?.resistance_pct ?? null)}
                            <small>
                              {e.recent ? `${e.recent.n_tested} tested` : 'Not evaluated'}
                            </small>
                          </td>
                          <td>
                            {percentage(e.baseline?.resistance_pct ?? null)}
                            <small>
                              {e.baseline ? `${e.baseline.n_tested} tested` : 'Not evaluated'}
                            </small>
                          </td>
                          <td>{changeLabel(e.resistance_change_pp)}</td>
                          <td>
                            <Badge tone={e.status === 'below_threshold' ? 'neutral' : 'warning'}>
                              {evaluationLabel(report)}
                            </Badge>
                            {e.reason && <small>{e.reason}</small>}
                          </td>
                          <td>
                            <SnapshotDownloads report={report} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTable>
            </div>
          </Panel>
          <details className="data-disclosure">
            <summary>How resistance alerts differ from the overview</summary>
            <p>
              The overview's last 12 months includes the recent 28 days. Alert detection instead
              uses a preceding 12-month baseline that ends before the recent period starts.
            </p>
            <p>
              Both periods need at least 30 tested isolates. A threshold crossing is a proposed
              signal for review, not a significance test or evidence of an outbreak. Monitored
              groups are configured independently of the ward-screen filters.
            </p>
          </details>
        </>
      )}
    </>
  );
}

function AlertEvaluation({
  report,
  meta,
  transitions,
}: {
  report: AlertAnalysis;
  meta: Meta;
  transitions: AlertInvestigation['transitions'];
}) {
  const e = report.evaluation;
  const monitor = report.context.monitor;
  const [tab, setTab] = useState<'overview' | 'population' | 'timeline'>('overview');
  const views = ['overview', 'population', 'timeline'] as const;
  const ageLabels = [
    ...new Set([
      ...Object.keys(e.baseline?.measurements.age_bin_counts ?? {}),
      ...Object.keys(e.recent?.measurements.age_bin_counts ?? {}),
    ]),
  ];
  const maximum = Math.max(
    1,
    ...ageLabels.flatMap((label) => [
      e.baseline?.measurements.age_bin_counts[label] ?? 0,
      e.recent?.measurements.age_bin_counts[label] ?? 0,
    ]),
  );
  return (
    <div className="investigation-grid">
      <div>
        <div className="investigation-context">
          <div>
            <strong>{monitorLabel(report.context.monitor, meta)}</strong>
            <p>
              {drugLabel(report.context.monitor.antibiotic_code, meta)} · Monitoring date{' '}
              {formatDate(report.context.monitoring_as_of)}
            </p>
          </div>
          <Badge tone={e.status === 'triggered' ? 'warning' : 'neutral'}>
            {evaluationLabel(report)}
          </Badge>
        </div>

        <div className="page-tabs" role="tablist" aria-label="Investigation views">
          {views.map((view) => (
            <button
              key={view}
              id={`alert-tab-${view}`}
              role="tab"
              aria-selected={tab === view}
              aria-controls={`alert-panel-${view}`}
              tabIndex={tab === view ? 0 : -1}
              onClick={() => setTab(view)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const index =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 2
                      : (views.indexOf(view) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                setTab(views[index]);
                document.getElementById(`alert-tab-${views[index]}`)?.focus();
              }}
            >
              {view === 'overview'
                ? 'Evidence overview'
                : view === 'population'
                  ? 'Population context'
                  : 'Timeline and history'}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`alert-panel-${tab}`} aria-labelledby={`alert-tab-${tab}`}>
          {tab === 'overview' ? (
            <>
              <Panel>
                <SectionHeading
                  title="Resistance in separate periods"
                  description="The baseline ends before the recent 28 days begin. These dates do not overlap."
                />
                <div className="investigation-measures">
                  {[
                    { label: 'Preceding 12-month baseline', w: e.baseline },
                    { label: 'Recent 28 days', w: e.recent },
                  ].map(({ label, w }) => (
                    <div key={label}>
                      <span className="field-label">{label}</span>
                      {w ? (
                        <>
                          <div className="investigation-value">{percentage(w.resistance_pct)}</div>
                          <p>
                            {w.n_r} resistant / {w.n_tested} tested
                          </p>
                          <span className="small-note">
                            {formatRange({
                              start_inclusive: w.start_date,
                              end_exclusive: w.end_date_exclusive,
                            })}
                          </span>
                          {w.resistance_pct === null && (
                            <p>Estimate withheld: fewer than 30 tested isolates.</p>
                          )}
                          {(!w.coverage.source_date_span_covers_window ||
                            !w.coverage.source_fully_imported) && (
                            <p className="coverage-warning">Incomplete imported-dataset coverage</p>
                          )}
                        </>
                      ) : (
                        <p>{e.reason ?? 'This period could not be evaluated.'}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="change-explanation resistance-change">
                  <strong>{changeLabel(e.resistance_change_pp)}</strong>
                  <p>
                    Recent minus baseline resistance · Review threshold{' '}
                    {report.context.threshold_pp} percentage points.
                  </p>
                </div>
              </Panel>
              <Panel>
                <SectionHeading title="The counts behind the change" />
                <DataTable label="Alert period counts">
                  <table>
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>Baseline</th>
                        <th>Recent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ['Eligible isolates', 'n_eligible'],
                          ['Tested', 'n_tested'],
                          ['Susceptible', 'n_s'],
                          ['Resistant', 'n_r'],
                          ['Not tested', 'n_not_tested'],
                        ] as const
                      ).map(([label, key]) => (
                        <tr key={key}>
                          <th scope="row">{label}</th>
                          <td>{e.baseline?.[key] ?? '—'}</td>
                          <td>{e.recent?.[key] ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>{' '}
                <p className="small-note">
                  {e.shared_patients_between_windows} patients occur in both periods. Patient
                  populations are not assumed independent.
                </p>
              </Panel>
            </>
          ) : tab === 'population' ? (
            <>
              {e.baseline && e.recent ? (
                <>
                  <Panel>
                    <SectionHeading
                      title="Age composition"
                      description="Eligible isolate counts by age group. Periods have different sample sizes."
                    />
                    <div className="composition-legend">
                      <span>
                        <i className="series-dot secondary" />
                        Baseline
                      </span>
                      <span>
                        <i className="series-dot" />
                        Recent
                      </span>
                    </div>
                    <div className="composition-chart" aria-hidden="true">
                      {ageLabels.map((label) => (
                        <div className="composition-row" key={label}>
                          <span>{label}</span>
                          <div>
                            <div
                              className="composition-bar secondary"
                              style={{
                                width: `${((e.baseline!.measurements.age_bin_counts[label] ?? 0) / maximum) * 100}%`,
                              }}
                            />
                            <div
                              className="composition-bar"
                              style={{
                                width: `${((e.recent!.measurements.age_bin_counts[label] ?? 0) / maximum) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="count-axis">
                        0<span>{maximum} isolates</span>
                      </div>
                    </div>
                    <p className="small-note">
                      {e.shared_patients_between_windows} patients occur in both periods. Patient
                      populations are not assumed independent.
                    </p>
                  </Panel>
                  {(
                    [
                      'age_bin_counts',
                      'sex_counts',
                      'collection_setting_counts',
                      'organism_mix_counts',
                    ] as const
                  ).map((key) => {
                    const baseline = e.baseline!.measurements[key],
                      recent = e.recent!.measurements[key];
                    const labels = [...new Set([...Object.keys(baseline), ...Object.keys(recent)])];
                    const title = {
                      age_bin_counts: 'Age groups',
                      sex_counts: 'Sex',
                      collection_setting_counts: 'Collection setting',
                      organism_mix_counts: 'Organism mix — separate count-only population',
                    }[key];
                    return (
                      <Panel key={key}>
                        <SectionHeading title={title} />
                        <DataTable label={title}>
                          <table>
                            <thead>
                              <tr>
                                <th>Group</th>
                                <th>Baseline</th>
                                <th>Recent</th>
                              </tr>
                            </thead>
                            <tbody>
                              {labels.map((label) => (
                                <tr key={label}>
                                  <th>{label}</th>
                                  <td>{baseline[label] ?? 0}</td>
                                  <td>{recent[label] ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </DataTable>
                      </Panel>
                    );
                  })}
                </>
              ) : (
                <EmptyState title="Population context unavailable">
                  {e.reason ?? 'This period could not be evaluated.'}
                </EmptyState>
              )}
            </>
          ) : (
            <>
              <Panel>
                <SectionHeading
                  title="Observation timeline"
                  description="Collection periods and recorded alert transitions."
                />
                <div className="investigation-timeline">
                  {e.baseline && (
                    <article>
                      <span className="timeline-dot" />
                      <h3>Baseline period closes</h3>
                      <p>
                        {formatRange({
                          start_inclusive: e.baseline.start_date,
                          end_exclusive: e.baseline.end_date_exclusive,
                        })}
                      </p>
                    </article>
                  )}
                  {e.recent && (
                    <article>
                      <span className="timeline-dot" />
                      <h3>Recent observation window opens</h3>
                      <p>
                        {formatRange({
                          start_inclusive: e.recent.start_date,
                          end_exclusive: e.recent.end_date_exclusive,
                        })}
                      </p>
                    </article>
                  )}
                  <article>
                    <span className="timeline-dot" />
                    <h3>Evaluation for review</h3>
                    <p>
                      {formatDate(report.context.monitoring_as_of)} · {evaluationLabel(report)}
                    </p>
                  </article>
                </div>
              </Panel>
              <Panel>
                <SectionHeading title="Alert history" />
                <ol className="alert-history">
                  {transitions.map((transition) => (
                    <li key={transition.state_revision}>
                      {formatDate(transition.monitoring_as_of)} ·{' '}
                      <Badge tone={transition.status === 'cleared' ? 'neutral' : 'warning'}>
                        {alertStatusLabels[transition.status]}
                      </Badge>{' '}
                      · revision {transition.state_revision}
                    </li>
                  ))}
                </ol>
              </Panel>
            </>
          )}
        </div>
        <Panel>
          <SectionHeading
            title="Export this analysis"
            description={`Samples through ${formatDate(report.context.monitoring_as_of)} · revision ${report.context.state_revision}`}
          />
          <SnapshotDownloads report={report} />
          <details className="data-disclosure">
            <summary>Snapshot & method</summary>
            <p>Analysis {report.analysis_id}</p>
            <p>
              Run {report.context.run_id} · {report.context.method_version} ·{' '}
              {report.context.rule_version}
            </p>
            <p>Source {report.context.source_manifest_id}</p>
            {report.context.mode === 'feed' && (
              <>
                <p>Feed: {report.context.feed_source_label ?? report.context.feed_source_id}</p>
                <p>
                  Clock:{' '}
                  {report.context.clock_mode === 'wall_utc'
                    ? 'UTC reporting date'
                    : 'Simulated reporting date'}
                </p>
                <p>Imported-dataset coverage does not certify external-feed completeness.</p>
                {report.context.feed_data_digest && (
                  <p>Feed digest: {report.context.feed_data_digest}</p>
                )}
              </>
            )}
            <p>Rule proposal pending partner confirmation.</p>
            <ul>
              {report.context.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
        </Panel>
      </div>
      <aside className="investigation-aside">
        <Panel>
          <SectionHeading eyebrow="The exact population" title="Review context" />
          <dl className="context-list">
            <div>
              <dt>Ward</dt>
              <dd>
                {meta.wards.find((ward) => ward.code === monitor.ward_code)?.label ?? 'All wards'}
              </dd>
            </div>
            <div>
              <dt>Specimen</dt>
              <dd>{monitor.specimen}</dd>
            </div>
            <div>
              <dt>Organism</dt>
              <dd>
                <em>{monitor.organism}</em>
              </dd>
            </div>
            <div>
              <dt>Antibiotic</dt>
              <dd>{drugLabel(monitor.antibiotic_code, meta)}</dd>
            </div>
            <div>
              <dt>Population</dt>
              <dd>
                {monitor.sex === 'F' ? 'Women' : monitor.sex === 'M' ? 'Men' : 'All sexes'} ·{' '}
                {monitor.age_min !== null || monitor.age_max !== null
                  ? `ages ${monitor.age_min ?? 0}–${monitor.age_max ?? 'any'}`
                  : 'all ages'}
              </dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{report.context.method_version}</dd>
            </div>
          </dl>
        </Panel>
        <Panel className="reading-note">
          <h3>Read this as a starting point.</h3>
          <p>Review the population and testing context before interpreting an observed change.</p>
          <p>
            A threshold crossing is a proposed signal for review, not a significance test or
            evidence of an outbreak.
          </p>
          <span className="small-note">
            Rule: {report.context.rule_version}
            <br />
            Minimum: {report.context.minimum_tested} tests in each period
          </span>
        </Panel>
      </aside>
    </div>
  );
}
export function ResistanceInvestigation({ state, meta }: { state: ReplayState; meta: Meta }) {
  const { investigationId = '' } = useParams();
  const location = useLocation();
  const [view, setView] = useState<'current' | 'original'>('current');
  const result = useAnalysis('resistance-investigation', state, investigationId, (signal) =>
    api.resistanceInvestigation(investigationId, state, signal),
  );
  const data = result.data;
  const report =
    view === 'current' && data?.current_analysis ? data.current_analysis : data?.original_detection;
  return (
    <>
      <Link to={`/alerts${location.search}`} className="back-link">
        <ArrowLeft size={16} />
        Back to resistance alerts
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Resistance alert investigation</span>
          <h1 tabIndex={-1}>Investigate a resistance increase</h1>
          <p>
            Compare the original detection with the latest evaluation of the same patient group.
          </p>
        </div>
      </div>
      {result.isPending ? (
        <Loading label="Loading alert investigation…" />
      ) : result.isError ? (
        <ErrorPanel error={result.error} onRetry={() => void result.refetch()} />
      ) : (
        data &&
        report && (
          <>
            <RefreshNotice
              error={result.refreshError}
              onRetry={() => void result.refetch()}
              pending={result.isFetching}
            />
            <div className="alert-snapshot-row">
              <div
                className="alert-snapshot-selector"
                role="group"
                aria-label="Investigation snapshot"
              >
                <Button
                  aria-pressed={view === 'current' && !!data.current_analysis}
                  disabled={!data.current_analysis}
                  onClick={() => setView('current')}
                >
                  Current evaluation
                </Button>
                <Button
                  aria-pressed={view === 'original' || !data.current_analysis}
                  onClick={() => setView('original')}
                >
                  Original detection · {formatDate(data.alert.first_trigger_date)}
                </Button>
              </div>
              {data.current_analysis_status === 'archived_run' && (
                <p className="inline-notice">
                  Archived investigation from an earlier run. The original detection remains
                  available; no current-run result is substituted.
                </p>
              )}
              <p className="snapshot-label">
                Showing{' '}
                {view === 'current' && data.current_analysis
                  ? 'current evaluation'
                  : 'original detection'}{' '}
                · Current alert state:{' '}
                <Badge tone={data.alert.status === 'cleared' ? 'neutral' : 'warning'}>
                  {alertStatusLabels[data.alert.status]}
                </Badge>
              </p>
            </div>
            <AlertEvaluation
              key={report.analysis_id}
              report={report}
              meta={meta}
              transitions={data.transitions}
            />
          </>
        )
      )}
    </>
  );
}
