import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Download, Info, Microscope } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Analysis, Meta, ReplayState } from '../api/contracts';
import { api } from '../api/client';
import { useAnalysis } from '../app/queries';
import {
  Badge,
  Button,
  DataTable,
  ErrorPanel,
  Loading,
  RefreshNotice,
  Panel,
  SectionHeading,
} from '../components/ui';
import { IntervalPlot } from '../components/IntervalPlot';
import { cohortLabel, drugLabel, formatDate, formatRange, percentage } from '../domain/formatters';

export function InvestigationPage({
  state,
  meta,
  onProvenance,
}: {
  state: ReplayState;
  meta: Meta;
  onProvenance: (a: Analysis) => void;
}) {
  const { investigationId = '' } = useParams();
  const location = useLocation();
  const [tab, setTab] = useState<'overview' | 'composition' | 'timeline'>('overview');
  const result = useAnalysis('investigation', state, investigationId, (signal) =>
    api.investigation(investigationId, state, signal),
  );
  if (result.isPending) return <Loading label="Opening investigation…" />;
  if (result.isError)
    return (
      <>
        <Link to={`/ward${location.search}`} className="back-link">
          <ArrowLeft size={16} />
          Back to ward overview
        </Link>
        <ErrorPanel
          title="Could not load this investigation"
          error={result.error}
          onRetry={() => void result.refetch()}
        />
      </>
    );
  const data = result.data;
  const flag = data.alert;
  const chartMax =
    Math.ceil(
      Math.max(1, ...data.composition.flatMap((row) => [row.recent_count, row.baseline_count])) /
        10,
    ) * 10;
  return (
    <>
      <RefreshNotice
        error={result.refreshError}
        onRetry={() => void result.refetch()}
        pending={result.isFetching}
      />
      <Link to={`/ward${location.search}`} className="back-link">
        <ArrowLeft size={16} />
        Back to ward overview
      </Link>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <span className="eyebrow">Evidence investigation</span>
            <Badge tone="warning">Review flag</Badge>
          </div>
          <h1 tabIndex={-1}>A change worth a closer look.</h1>
          <p>
            {drugLabel(flag.antibiotic_code, meta)} resistance in <em>{flag.organism}</em>
          </p>
        </div>
        <Button onClick={() => onProvenance(data)}>
          <Download size={16} />
          Export snapshot
        </Button>
      </div>
      <div className="investigation-context">
        <span className="context-symbol">
          <Microscope size={19} />
        </span>
        <div>
          <strong>{cohortLabel(data.context.filters, meta)}</strong>
          <p>
            Original detection: {formatDate(flag.detected_on, 'long')} ·{' '}
            {data.context.source_manifest_id}
          </p>
        </div>
        <Badge tone="violet">Detection snapshot</Badge>
      </div>
      <div className="investigation-grid">
        <div>
          <div className="page-tabs" role="tablist" aria-label="Investigation views">
            {(['overview', 'composition', 'timeline'] as const).map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                role="tab"
                aria-controls={`tabpanel-${t}`}
                aria-selected={tab === t}
                tabIndex={tab === t ? 0 : -1}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const tabs = ['overview', 'composition', 'timeline'] as const;
                    const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setTab(t)}
              >
                {t === 'overview'
                  ? 'Evidence overview'
                  : t === 'composition'
                    ? 'Population context'
                    : 'Timeline'}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' ? (
              <>
                <Panel>
                  <SectionHeading
                    title="Resistance, in context"
                    description="Recent observations beside a non-overlapping baseline."
                  />
                  <div className="investigation-measures">
                    {[
                      {
                        label: 'Preceding 12 months',
                        measure: data.baseline,
                        bounds: data.baseline_bounds,
                      },
                      {
                        label: 'Latest 28 days',
                        measure: data.recent,
                        bounds: data.context.date_bounds.last_28d,
                      },
                    ].map((item, i) => (
                      <div key={item.label} className={i ? 'recent-measure' : ''}>
                        <span className="field-label">{item.label}</span>
                        <div className="investigation-value">
                          {percentage(item.measure.resistance_pct)}
                        </div>
                        <p>
                          {item.measure.n_r} resistant / {item.measure.n_tested} tested
                        </p>
                        <span className="small-note">{formatRange(item.bounds)}</span>
                        {item.measure.status === 'available' && (
                          <IntervalPlot
                            value={item.measure.resistance_pct!}
                            lower={item.measure.ci95.resistance.lower!}
                            upper={item.measure.ci95.resistance.upper!}
                            variant={i ? 'primary' : 'secondary'}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="change-explanation">
                    <span className="change-icon">
                      <ArrowRight size={21} />
                    </span>
                    <p>
                      <strong>
                        {flag.change_pp === null
                          ? 'Insufficient evidence'
                          : `${flag.change_pp > 0 ? '+' : ''}${flag.change_pp.toFixed(1)} percentage points`}
                      </strong>
                      <br />
                      {flag.change_pp === null
                        ? 'The current support does not allow reevaluation of this flag.'
                        : `The configured review threshold is ${data.rule.threshold_pp} percentage points. This is a heuristic signal, not a significance test.`}
                    </p>
                  </div>
                </Panel>
                <Panel>
                  <SectionHeading title="The counts behind the change" />
                  <DataTable label="Recent versus baseline isolate counts">
                    <table>
                      <caption className="sr-only">Independent deduplicated periods</caption>
                      <thead>
                        <tr>
                          <th scope="col">Measure</th>
                          <th scope="col">Baseline</th>
                          <th scope="col">Recent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Eligible isolates', key: 'n_eligible' },
                          { label: 'Tested for ' + flag.antibiotic_code, key: 'n_tested' },
                          { label: 'Susceptible', key: 'n_s' },
                          { label: 'Resistant', key: 'n_r' },
                          { label: 'Not tested', key: 'n_not_tested' },
                        ].map((row) => (
                          <tr key={row.key}>
                            <td>{row.label}</td>
                            <td>{data.baseline[row.key as 'n_eligible']}</td>
                            <td>{data.recent[row.key as 'n_eligible']}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DataTable>
                  <Button variant="ghost" onClick={() => onProvenance(data)}>
                    Inspect calculation and provenance <ArrowRight size={14} />
                  </Button>
                </Panel>
              </>
            ) : tab === 'composition' ? (
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
                  {data.composition.map((row) => (
                    <div className="composition-row" key={row.label}>
                      <span>{row.label}</span>
                      <div>
                        <div
                          className="composition-bar secondary"
                          style={{ width: `${(row.baseline_count / chartMax) * 100}%` }}
                        />
                        <div
                          className="composition-bar"
                          style={{ width: `${(row.recent_count / chartMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="count-axis">
                    0<span>{chartMax / 2}</span>
                    {chartMax} isolates
                  </div>
                </div>
                <DataTable label="Age composition isolate counts">
                  <table>
                    <caption className="sr-only">Age composition, raw counts</caption>
                    <thead>
                      <tr>
                        <th>Age group</th>
                        <th>Baseline</th>
                        <th>Recent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.composition.map((row) => (
                        <tr key={row.label}>
                          <td>{row.label}</td>
                          <td>{row.baseline_count}</td>
                          <td>{row.recent_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DataTable>
                <div className="inline-notice">
                  <Info size={18} />
                  <p>{data.notes[0]}</p>
                </div>
              </Panel>
            ) : (
              <Panel>
                <SectionHeading
                  title="Observation timeline"
                  description="Collection periods and the original review event."
                />
                <div className="investigation-timeline">
                  {data.chronology.map((item) => (
                    <article key={item.date}>
                      <span className="timeline-icon">
                        <CalendarDays size={17} />
                      </span>
                      <span className="eyebrow">{formatDate(item.date)}</span>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
        <aside className="investigation-aside">
          <Panel>
            <SectionHeading eyebrow="The exact population" title="Review context" />
            <dl className="context-list">
              <div>
                <dt>Ward</dt>
                <dd>
                  {meta.wards.find((w) => w.code === data.context.filters.ward_code)?.label ??
                    'All wards'}
                </dd>
              </div>
              <div>
                <dt>Specimen</dt>
                <dd>{flag.specimen}</dd>
              </div>
              <div>
                <dt>Organism</dt>
                <dd>
                  <em>{flag.organism}</em>
                </dd>
              </div>
              <div>
                <dt>Antibiotic</dt>
                <dd>{drugLabel(flag.antibiotic_code, meta)}</dd>
              </div>
              <div>
                <dt>Population</dt>
                <dd>
                  {data.context.filters.sex === 'F'
                    ? 'Women'
                    : data.context.filters.sex === 'M'
                      ? 'Men'
                      : 'All sexes'}{' '}
                  ·{' '}
                  {data.context.filters.age_min !== null || data.context.filters.age_max !== null
                    ? `ages ${data.context.filters.age_min ?? 0}–${data.context.filters.age_max ?? '120+'}`
                    : 'all ages'}
                </dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{data.context.method_version}</dd>
              </div>
            </dl>
          </Panel>
          <Panel className="reading-note">
            <span className="note-icon">
              <Info size={21} />
            </span>
            <h3>Read this as a starting point.</h3>
            <p>Review the population and testing context before interpreting an observed change.</p>
            <p>{data.notes[2]}</p>
            <span className="small-note">
              Rule: {data.rule.version}
              <br />
              Minimum: {data.rule.minimum_tested} tests in each period
            </span>
          </Panel>
        </aside>
      </div>
    </>
  );
}
