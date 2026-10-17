import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import type { Analysis, CohortQuery, Meta, ReplayState } from '../api/contracts';
import { api } from '../api/client';
import { useAnalysis } from '../app/queries';
import {
  Button,
  DataTable,
  ErrorPanel,
  Loading,
  Panel,
  SectionHeading,
  RefreshNotice,
} from '../components/ui';
import { IntervalPlot } from '../components/IntervalPlot';
import { AntibioticComparison } from './AntibioticComparison';
import {
  cohortLabel,
  drugLabel,
  formatRange,
  percentage,
  windowLabels,
} from '../domain/formatters';

export function CohortInvestigation({
  query,
  state,
  meta,
  onApply,
  onProvenance,
}: {
  query: CohortQuery;
  state: ReplayState;
  meta: Meta;
  onApply: (q: CohortQuery) => void;
  onProvenance: (a: Analysis) => void;
}) {
  const location = useLocation();
  const result = useAnalysis('evidence', state, query, (signal) =>
    api.evidence(query, state, signal),
  );
  return (
    <>
      <Link className="back-link" to={`/ward${location.search}`}>
        <ArrowLeft size={16} />
        Back to ward overview
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Cohort investigation</span>
          <h1 tabIndex={-1}>Investigate susceptibility</h1>
          <p>Inspect the counts and uncertainty behind {drugLabel(query.antibiotic_code, meta)}.</p>
        </div>
        <Button disabled={!result.data} onClick={() => result.data && onProvenance(result.data)}>
          <Download size={16} />
          Export snapshot
        </Button>
      </div>
      <div className="investigation-context">
        <div>
          <strong>{cohortLabel(query, meta)}</strong>
          <p>Your selected cohort, including the applied population filters.</p>
        </div>
        <Link className="button button--ghost" to={`/ward${location.search}`}>
          Change cohort →
        </Link>
      </div>
      {result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <ErrorPanel error={result.error} onRetry={() => void result.refetch()} />
      ) : (
        <>
          <RefreshNotice
            error={result.refreshError}
            onRetry={() => void result.refetch()}
            pending={result.isFetching}
          />
          <Panel>
            <SectionHeading
              title="Evidence behind the estimate"
              description="Each period selects its first isolates independently."
            />
            <div className="investigation-measures">
              {(['rolling_12m', 'last_28d'] as const).map((key) => {
                const m = result.data.windows[key];
                return (
                  <div key={key}>
                    <span className="field-label">{windowLabels[key]}</span>
                    <div className="investigation-value">
                      {m.status === 'available' ? percentage(m.susceptibility_pct) : 'Not reported'}
                    </div>
                    <p>
                      {m.n_s} susceptible / {m.n_tested} tested
                    </p>
                    <span className="small-note">
                      {formatRange(result.data.context.date_bounds[key])}
                    </span>
                    {m.status === 'available' ? (
                      <IntervalPlot
                        value={m.susceptibility_pct!}
                        lower={m.ci95.susceptibility.lower!}
                        upper={m.ci95.susceptibility.upper!}
                      />
                    ) : (
                      <p>At least 30 tests are required for an estimate.</p>
                    )}
                  </div>
                );
              })}
            </div>
            <details className="data-disclosure">
              <summary>Full count table</summary>
              <DataTable label="Evidence isolate counts">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Eligible</th>
                      <th>Tested</th>
                      <th>Susceptible</th>
                      <th>Resistant</th>
                      <th>Not tested</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['rolling_12m', 'last_28d'] as const).map((key) => {
                      const m = result.data.windows[key];
                      return (
                        <tr key={key}>
                          <th>{windowLabels[key]}</th>
                          <td>{m.n_eligible}</td>
                          <td>{m.n_tested}</td>
                          <td>{m.n_s}</td>
                          <td>{m.n_r}</td>
                          <td>{m.n_not_tested}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DataTable>
            </details>
            <Button variant="ghost" onClick={() => onProvenance(result.data)}>
              Calculation & provenance
            </Button>
          </Panel>
          <AntibioticComparison
            query={query}
            state={state}
            meta={meta}
            onChange={onApply}
            onProvenance={onProvenance}
          />
        </>
      )}
      <p className="small-note investigation-limit">
        The overview periods overlap. For increases detected against a separate preceding baseline,{' '}
        <Link to={`/alerts${location.search}`}>view resistance alerts</Link>.
      </p>
    </>
  );
}
