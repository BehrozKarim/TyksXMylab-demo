import type { CSSProperties } from 'react';
import { percentage } from '../domain/formatters';
export function IntervalPlot({
  value,
  lower,
  upper,
  variant = 'primary',
}: {
  value: number;
  lower: number;
  upper: number;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <div className={`interval-plot interval-plot--${variant}`}>
      <div className="interval-track" aria-hidden="true">
        <span className="interval-tick tick-25" />
        <span className="interval-tick tick-50" />
        <span className="interval-tick tick-75" />
        <span
          className="interval-range"
          style={{ '--lower': `${lower}%`, '--width': `${upper - lower}%` } as CSSProperties}
        />
        <span className="interval-dot" style={{ left: `${value}%` }} />
      </div>
      <div className="axis-labels" aria-hidden="true">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <p className="interval-caption">
        95% interval{' '}
        <strong>
          {percentage(lower)}–{percentage(upper)}
        </strong>
      </p>
    </div>
  );
}
