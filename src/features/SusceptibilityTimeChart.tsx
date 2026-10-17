import { useId, useState } from 'react';
import type { Evidence } from '../api/contracts';
import { formatDate, percentage } from '../domain/formatters';
import { trendStatusLabel } from '../domain/trend';

export function SusceptibilityTimeChart({
  points,
  antibiotic,
  year,
}: {
  points: Evidence[];
  antibiotic: string;
  year: number;
}) {
  const helpId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = points.find((p) => p.analysis_id === selectedId);
  const available = points.filter((p) => p.windows.last_28d.status === 'available').length;
  const x = (index: number) => (points.length === 1 ? 50 : 4 + (index / (points.length - 1)) * 92);
  const y = (value: number) => 100 - value;
  const segments: string[] = [];
  let segment = '';
  points.forEach((p, i) => {
    const value = p.windows.last_28d.susceptibility_pct;
    if (value === null) {
      if (segment) segments.push(segment);
      segment = '';
    } else segment += `${segment ? ' L' : 'M'}${x(i)},${y(value)}`;
  });
  if (segment) segments.push(segment);
  return (
    <>
      <div className="trend-legend" aria-label="Chart legend">
        <span className="trend-series-key">
          <span className="trend-line-key" aria-hidden="true" />
          {antibiotic}
        </span>
        <span>
          <span className="trend-missing-key" aria-hidden="true">
            —
          </span>{' '}
          Not reported
        </span>
        <span className="trend-coverage">
          Estimates available for {available} of {points.length} cutoffs
        </span>
      </div>
      <div className="trend-chart-frame">
        <div className="trend-y-axis">
          <span className="trend-y-title">Susceptibility (%)</span>
          <span className="trend-availability-label">Availability</span>
          {[0, 25, 50, 75, 100].map((v) => (
            <span className="trend-y-tick" key={v} style={{ bottom: `${v}%` }}>
              {v}%
            </span>
          ))}
        </div>
        <div
          className="trend-chart"
          role="region"
          aria-label="Susceptibility time chart"
          tabIndex={0}
        >
          <div className="trend-canvas">
            <div className="trend-plot">
              {[0, 25, 50, 75, 100].map((v) => (
                <div key={v} className="trend-grid" style={{ bottom: `${v}%` }} />
              ))}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${antibiotic} susceptibility, ${year}. ${available} of ${points.length} cutoffs reported. Details available in the month buttons below.`}
              >
                {segments.map((d, i) => (
                  <path key={i} d={d} className="trend-line" vectorEffect="non-scaling-stroke" />
                ))}
              </svg>
              {points.map(
                (p, i) =>
                  p.windows.last_28d.susceptibility_pct !== null && (
                    <span
                      key={p.analysis_id}
                      className="trend-point"
                      aria-hidden="true"
                      style={{
                        left: `${x(i)}%`,
                        top: `${y(p.windows.last_28d.susceptibility_pct!)}%`,
                      }}
                      data-selected={p.analysis_id === selectedId || undefined}
                      onPointerEnter={() => setSelectedId(p.analysis_id)}
                      onClick={() => setSelectedId(p.analysis_id)}
                      title={`${formatDate(p.context.as_of)}: ${percentage(p.windows.last_28d.susceptibility_pct)}, ${p.windows.last_28d.n_tested} tested isolates`}
                    />
                  ),
              )}
            </div>
            <div className="trend-availability" role="group" aria-label="Monthly data availability">
              {points.map((p, i) => {
                const m = p.windows.last_28d;
                return (
                  <button
                    key={p.analysis_id}
                    type="button"
                    className="trend-month"
                    style={{ left: `${x(i)}%` }}
                    aria-label={`${formatDate(p.context.as_of)}: ${trendStatusLabel(m)}, ${m.n_tested} tested isolates`}
                    aria-describedby={helpId}
                    aria-pressed={selectedId === p.analysis_id}
                    onPointerEnter={() => setSelectedId(p.analysis_id)}
                    onFocus={() => setSelectedId(p.analysis_id)}
                    onClick={() => setSelectedId(p.analysis_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setSelectedId(null);
                    }}
                  >
                    <span>
                      {new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(
                        new Date(`${p.context.as_of}T12:00:00Z`),
                      )}
                    </span>
                    <span
                      className={
                        m.status === 'available' ? 'trend-available-marker' : 'trend-missing-marker'
                      }
                      aria-hidden="true"
                    >
                      {m.status === 'available' ? '●' : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="trend-x-label">28-day period ending · {year}</p>
      <p className="trend-scroll-hint">
        Scroll horizontally to see all months. You can also tab between months.
      </p>
      <div
        className="trend-cutoff-detail"
        role="status"
        aria-label="Selected cutoff details"
        aria-live="polite"
        aria-atomic="true"
      >
        {selected ? (
          <>
            <strong>28-day period ending {formatDate(selected.context.as_of)}</strong>
            <p>
              {selected.windows.last_28d.status === 'available'
                ? `${percentage(selected.windows.last_28d.susceptibility_pct)} susceptible`
                : trendStatusLabel(selected.windows.last_28d)}
              {' · '}
              {selected.windows.last_28d.n_tested} tested isolates
              {' · '}
              {selected.windows.last_28d.n_eligible} eligible isolates
            </p>
          </>
        ) : (
          <p>Select a month or hover over a point to see its date, counts and reporting status.</p>
        )}
      </div>
      <p className="small-note trend-help" id={helpId}>
        Percentages are not reported when fewer than 30 isolates were tested. Dashes mark unreported
        cutoffs; select a month for the reason. Gaps are not zero susceptibility. All points use the
        same published snapshot; they do not reproduce when results became known.
      </p>
    </>
  );
}
