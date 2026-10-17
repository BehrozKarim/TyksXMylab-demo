import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrendRefresh } from '../app/useTrendRefresh';
import type { Analysis, CohortQuery, Evidence, Meta, ReplayState } from '../api/contracts';
import { api, DATA_MODE } from '../api/client';
import { trendDates, trendStatusLabel } from '../domain/trend';
import { useAnalysis } from '../app/queries';
import {
  Button,
  DataTable,
  ErrorPanel,
  Loading,
  Panel,
  SectionHeading,
  Select,
  RefreshNotice,
} from '../components/ui';
import { SusceptibilityTimeChart } from './SusceptibilityTimeChart';
import { drugLabel, formatDate, percentage } from '../domain/formatters';

export function SusceptibilityTrend({
  followLatest,
  ...props
}: {
  followLatest: boolean;
  query: CohortQuery;
  state: ReplayState;
  meta: Meta;
  onProvenance: (analysis: Analysis) => void;
  onYearChange: (year: number) => void;
}) {
  const { antibiotic_b: _b, window: _window, as_of, ...selection } = props.query;
  void _b;
  void _window;
  const identity = JSON.stringify([
    props.state.run_id,
    props.state.method_version,
    selection,
    followLatest ? 'latest' : as_of,
    props.meta.source.start,
  ]);
  return <TrendView key={identity} {...props} />;
}

function TrendView({
  query,
  state,
  meta,
  onProvenance,
  onYearChange,
}: {
  query: CohortQuery;
  state: ReplayState;
  meta: Meta;
  onProvenance: (analysis: Analysis) => void;
  onYearChange: (year: number) => void;
}) {
  const client = useQueryClient();
  const { snapshot, refresh } = useTrendRefresh(state, query);
  const [complete, setComplete] = useState<Evidence[] | undefined>(undefined);
  const dates = trendDates(snapshot.query.calendar_year, snapshot.query.as_of, meta.source.start);
  const current = snapshot.state.state_revision === state.state_revision;
  useEffect(() => {
    void client.cancelQueries({
      queryKey: ['analysis', 'trend', state.run_id],
      predicate: (q) => q.queryKey[3] !== state.state_revision,
    });
  }, [client, state.run_id, state.state_revision]);
  const result = useAnalysis(
    'trend',
    snapshot.state,
    { query: snapshot.query, dates },
    async (signal) => {
      // One historical request at a time leaves publication fewer queued readers.
      const points = [];
      for (const as_of of dates) {
        signal.throwIfAborted();
        points.push(await api.evidence({ ...snapshot.query, as_of }, snapshot.state, signal));
      }
      return points;
    },
    current && dates.length > 0 && state.status !== 'running',
  );
  useEffect(() => {
    if (result.data && !result.isPlaceholderData) setComplete(result.data);
  }, [result.data, result.isPlaceholderData]);
  const points = result.data ?? complete ?? [];
  const displayed = points.at(-1)?.context;
  const behind = !current || (!!displayed && displayed.state_revision !== state.state_revision);
  const refreshNow = () => {
    refresh();
    if (current) void result.refetch();
  };
  const label = '28-day susceptibility at monthly collection cutoffs';
  return (
    <Panel className="trend-panel">
      <SectionHeading
        eyebrow="Trend"
        title="Susceptibility over time"
        description="28-day estimates sampled at each month end, up to the report end date."
        action={
          <Button onClick={refreshNow} disabled={result.isFetching || state.status === 'running'}>
            <RefreshCw size={17} /> Refresh now
          </Button>
        }
      />
      <div className="chart-controls">
        <Select
          id="chart-year"
          label="Chart year"
          value={query.calendar_year}
          aria-describedby="chart-year-help"
          onChange={(event) => onYearChange(Number(event.target.value))}
        >
          {Array.from(
            {
              length: Number(query.as_of.slice(0, 4)) - Number(meta.source.start.slice(0, 4)) + 1,
            },
            (_, i) => Number(meta.source.start.slice(0, 4)) + i,
          ).map((year) => (
            <option key={year}>{year}</option>
          ))}
        </Select>
        <p id="chart-year-help">
          Showing {query.calendar_year} in this chart only. The overview still ends on{' '}
          {formatDate(query.as_of)}.
        </p>
      </div>
      <div className="trend-freshness" role="status">
        {displayed
          ? `Chart snapshot: latest cutoff ${formatDate(displayed.as_of)} · revision ${displayed.state_revision}.`
          : 'The chart loads automatically.'}
        {behind &&
          (DATA_MODE === 'standalone'
            ? ' Refreshing for the latest lab batch.'
            : ' New data is available. Live chart updates are limited to once every 30 seconds.')}
        {result.isFetching && ' Updating chart…'}
      </div>
      <RefreshNotice
        error={result.refreshError ?? (points.length ? result.error : null)}
        onRetry={refreshNow}
        pending={result.isFetching}
      />
      {state.status === 'running' ? (
        <p className="inline-notice">
          The chart will load automatically when publication pauses, using one stable snapshot.
        </p>
      ) : !dates.length ? (
        <p className="inline-notice">No published collection dates are available in this year.</p>
      ) : result.isPending && !points.length ? (
        <Loading label={`Loading ${dates.length} monthly cutoffs…`} />
      ) : result.isError && !points.length ? (
        <ErrorPanel error={result.error} onRetry={refreshNow} />
      ) : (
        <>
          <SusceptibilityTimeChart
            points={points}
            antibiotic={drugLabel(points[0]?.antibiotic_code ?? query.antibiotic_code, meta)}
            year={snapshot.query.calendar_year}
          />
          <details className="data-disclosure">
            <summary>Monthly values, counts & exports</summary>
            <DataTable label={label}>
              <table>
                <thead>
                  <tr>
                    <th>28-day period ending</th>
                    <th>Susceptible</th>
                    <th>Tested</th>
                    <th>95% interval</th>
                    <th>Snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => {
                    const m = p.windows.last_28d;
                    return (
                      <tr key={p.analysis_id}>
                        <td>{formatDate(p.context.as_of)}</td>
                        <td>
                          {m.susceptibility_pct === null
                            ? trendStatusLabel(m)
                            : percentage(m.susceptibility_pct)}
                        </td>
                        <td>{m.n_tested}</td>
                        <td>
                          {m.status === 'available'
                            ? `${percentage(m.ci95.susceptibility.lower)}–${percentage(m.ci95.susceptibility.upper)}`
                            : 'Not reported'}
                        </td>
                        <td>
                          <Button variant="ghost" onClick={() => onProvenance(p)}>
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DataTable>
          </details>
        </>
      )}
    </Panel>
  );
}
