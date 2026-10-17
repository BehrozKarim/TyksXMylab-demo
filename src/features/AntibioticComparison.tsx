import { ArrowRight, CircleHelp, GitCompareArrows } from 'lucide-react';
import type { CohortQuery, Comparison, Meta, ReplayState } from '../api/contracts';
import { api } from '../api/client';
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
  Select,
} from '../components/ui';
import { drugLabel, formatRange, percentage, windowLabels } from '../domain/formatters';

export function AntibioticComparison({
  query,
  state,
  meta,
  onChange,
  onProvenance,
}: {
  query: CohortQuery;
  state: ReplayState;
  meta: Meta;
  onChange: (q: CohortQuery) => void;
  onProvenance: (data: Comparison) => void;
}) {
  const result = useAnalysis(
    'comparison',
    state,
    query,
    (signal) => api.comparison(query, state, signal),
    !!query.antibiotic_b && query.antibiotic_code !== 'FOX',
  );
  const c = result.data?.comparison;
  return (
    <Panel className="comparison-panel" id="comparison">
      <RefreshNotice
        error={result.refreshError}
        onRetry={() => void result.refetch()}
        pending={result.isFetching}
      />
      <SectionHeading
        eyebrow="A shared isolate set"
        title="Antibiotic comparison"
        action={
          <span className="section-icon">
            <GitCompareArrows size={19} />
          </span>
        }
      />
      <div className="comparison-controls">
        <div className="drug-a">
          <span className="field-label">Antibiotic A</span>
          <div>
            <span className="series-dot" />
            {drugLabel(query.antibiotic_code, meta)}
            <Badge tone="violet">Primary</Badge>
          </div>
        </div>
        <Select
          id="antibiotic-b"
          label="Compare with B"
          value={query.antibiotic_b}
          onChange={(e) => onChange({ ...query, antibiotic_b: e.target.value })}
        >
          <option value="">Choose antibiotic</option>
          {meta.antibiotics
            .filter((a) => !a.screening && a.code !== query.antibiotic_code)
            .map((a) => (
              <option key={a.code} value={a.code} disabled={!a.specimens.includes(query.specimen)}>
                {a.label}
              </option>
            ))}
        </Select>
        <div className="comparison-window">
          <span className="field-label">Comparison period</span>
          <div className="segmented" role="group" aria-label="Comparison period">
            {(meta.supported_windows ?? (['rolling_12m', 'last_28d'] as const)).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={query.window === key}
                onClick={() => onChange({ ...query, window: key })}
              >
                {windowLabels[key]}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!query.antibiotic_b || query.antibiotic_code === 'FOX' ? (
        <EmptyState title="Choose two antibiotics">
          Select a second non-screening antibiotic to compare observed tests.
        </EmptyState>
      ) : result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <ErrorPanel error={result.error} onRetry={() => void result.refetch()} />
      ) : (
        c &&
        result.data && (
          <>
            <div className="comparison-period">
              <span>{formatRange(result.data.context.date_bounds[c.window])}</span>
              <Badge>{c.n_paired} paired isolates</Badge>
            </div>
            {c.status === 'available' ? (
              <div className="comparison-results">
                <div
                  className="paired-chart"
                  aria-label="Historical laboratory susceptibility on the same isolates"
                >
                  {[
                    { code: c.antibiotic_a, value: c.a_susceptibility_pct!, variant: 'primary' },
                    { code: c.antibiotic_b, value: c.b_susceptibility_pct!, variant: 'secondary' },
                  ].map((row) => (
                    <div
                      className={`paired-chart-row paired-chart-row--${row.variant}`}
                      key={row.code}
                    >
                      <span>{row.code}</span>
                      <div className="paired-bar-track">
                        <span style={{ width: `${row.value}%` }} />
                      </div>
                      <strong>{percentage(row.value)}</strong>
                    </div>
                  ))}
                  <div className="paired-chart-axis">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div className="difference-strip">
                  <div>
                    <span className="field-label">Net difference · B minus A</span>
                    <strong>
                      {c.net_difference_pp! > 0 ? '+' : ''}
                      {c.net_difference_pp!.toFixed(1)} <small>pp</small>
                    </strong>
                  </div>
                  <div>
                    <span className="field-label">Additional isolates susceptible to B</span>
                    <strong>
                      {c.cells.b_only_s} <small>({percentage(c.b_only_added_pct)})</small>
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="inline-notice">
                <CircleHelp size={18} />
                <p>
                  <strong>
                    {c.status === 'insufficient_data'
                      ? `Only ${c.n_paired} paired tests`
                      : c.status === 'empty_cohort'
                        ? 'No eligible isolates'
                        : c.status === 'not_applicable'
                          ? 'Comparison not applicable'
                          : 'No paired susceptibility tests recorded'}
                  </strong>
                  <br />
                  Percentages are hidden until at least 30 isolates have both results.
                </p>
              </div>
            )}
            <details className="data-disclosure">
              <summary>Paired counts & missing tests</summary>
              <DataTable label="Paired susceptibility counts">
                <table className="paired-table">
                  <caption className="sr-only">
                    Both antibiotics tested on the same {c.n_paired} isolates
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Paired result</th>
                      <th scope="col">Isolates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: `Susceptible to both ${c.antibiotic_a} and ${c.antibiotic_b}`,
                        value: c.cells.both_s,
                      },
                      { label: `Susceptible to ${c.antibiotic_a} only`, value: c.cells.a_only_s },
                      { label: `Susceptible to ${c.antibiotic_b} only`, value: c.cells.b_only_s },
                      { label: 'Resistant to both', value: c.cells.both_r },
                    ].map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
              <div className="comparison-footnote">
                <span>
                  {c.n_eligible} eligible · {c.n_missing_either} missing either test
                  <br />
                  {c.n_missing_a} missing A · {c.n_missing_b} missing B
                </span>
                <Button variant="ghost" onClick={() => onProvenance(result.data!)}>
                  How calculated <ArrowRight size={14} />
                </Button>
              </div>
            </details>
            <p className="small-note">
              Historical laboratory susceptibility. This comparison does not establish clinical
              suitability or treatment success.
            </p>
          </>
        )
      )}
    </Panel>
  );
}
