import { ArrowRight, CircleHelp, Clock3, Layers3 } from 'lucide-react';
import type { Evidence, WindowKey, WindowMeasure } from '../api/contracts';
import { Badge, Button } from '../components/ui';
import { IntervalPlot } from '../components/IntervalPlot';
import { formatRange, number, windowLabels } from '../domain/formatters';

const supportTitles: Record<WindowMeasure['status'], string> = {
  available: 'Available',
  insufficient_data: 'Insufficient data',
  no_tests: 'No susceptibility tests recorded',
  empty_cohort: 'No eligible isolates in this period',
  not_applicable: 'This comparison is not applicable',
};
export function EvidenceCards({
  evidence,
  onProvenance,
  onLongerWindow,
}: {
  evidence: Evidence;
  onProvenance: (key: WindowKey) => void;
  onLongerWindow: () => void;
}) {
  return (
    <div className="period-grid">
      {(['rolling_12m', 'last_28d'] as const).map((key) => {
        const m = evidence.windows[key];
        const title = windowLabels[key];
        const Icon = key === 'rolling_12m' ? Layers3 : Clock3;
        const featured = key === 'rolling_12m' && m.status === 'available';
        const cov = evidence.context.coverage[key];
        return (
          <section
            className={`period-card ${featured ? 'period-card--featured' : ''}`}
            key={key}
            aria-label={`${title} evidence`}
          >
            <div className="period-title">
              <span className="period-icon">
                <Icon size={17} />
              </span>
              <h3>{title}</h3>
              <Button
                variant="ghost"
                className="icon-button"
                aria-label={`How calculated: ${title}`}
                onClick={() => onProvenance(key)}
              >
                <CircleHelp size={17} />
              </Button>
            </div>
            <p className="period-date">{formatRange(evidence.context.date_bounds[key])}</p>
            {m.status === 'available' ? (
              <>
                <div className="period-value">
                  {m.susceptibility_pct!.toFixed(1)}
                  <span>%</span>
                </div>
                <p className="measure-label">
                  susceptible · <strong>{number(m.n_tested)}</strong> tested isolates
                </p>
                <details className="metric-details">
                  <summary>Counts & uncertainty</summary>
                  <div className="period-counts">
                    {m.n_s} susceptible · {m.n_r} resistant
                  </div>
                  <IntervalPlot
                    value={m.susceptibility_pct!}
                    lower={m.ci95.susceptibility.lower!}
                    upper={m.ci95.susceptibility.upper!}
                  />
                  <div className="period-footer">
                    <span>{m.n_eligible} eligible</span>
                    <span>{m.n_not_tested} not tested</span>
                  </div>
                </details>
              </>
            ) : (
              <div className="support-state">
                <Badge tone="success">
                  {m.status === 'insufficient_data'
                    ? `${m.n_tested} tested · minimum 30`
                    : 'Evidence unavailable'}
                </Badge>
                <h3>{supportTitles[m.status]}</h3>
                <p>
                  {m.reason ??
                    (m.status === 'insufficient_data'
                      ? 'Estimates require at least 30 tested isolates.'
                      : `${m.n_eligible} eligible isolates; ${m.n_not_tested} not tested.`)}
                </p>
                {key === 'last_28d' && (
                  <Button variant="ghost" onClick={onLongerWindow}>
                    View 12-month evidence <ArrowRight size={14} />
                  </Button>
                )}
              </div>
            )}
            {!cov.source_covers_requested_window && (
              <p className="coverage-warning">Partial imported-dataset coverage</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
