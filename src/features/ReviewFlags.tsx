import { ArrowRight, BellDot, CircleCheck, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ReplayState } from '../api/contracts';
import { useAnalysis } from '../app/queries';
import {
  Badge,
  Button,
  ErrorPanel,
  Loading,
  Panel,
  SectionHeading,
  RefreshNotice,
} from '../components/ui';
import { formatDate } from '../domain/formatters';
export function ReviewFlags({
  state,
  asOf,
  search,
  onFollow,
}: {
  state: ReplayState;
  asOf: string;
  search: string;
  onFollow: () => void;
}) {
  const result = useAnalysis('alerts', state, {}, (signal) => api.alerts(state, signal));
  const pinned = asOf !== state.demo_date;
  return (
    <Panel className="review-panel">
      <RefreshNotice
        error={result.refreshError}
        onRetry={() => void result.refetch()}
        pending={result.isFetching}
      />
      <SectionHeading
        eyebrow="Monitoring"
        title="Changes for review"
        action={
          <span className="section-icon">
            <BellDot size={19} />
          </span>
        }
      />
      {pinned ? (
        <div className="review-empty">
          <Clock3 size={25} />
          <h3>Viewing a pinned report</h3>
          <p>
            Current monitoring flags belong to {formatDate(state.demo_date)}. They are hidden for
            this earlier report.
          </p>
          <Button onClick={onFollow}>
            Use latest date <ArrowRight size={14} />
          </Button>
        </div>
      ) : result.isPending ? (
        <Loading />
      ) : result.isError ? (
        <ErrorPanel error={result.error} onRetry={() => void result.refetch()} />
      ) : result.data.alerts.length === 0 ? (
        <div className="review-empty">
          <CircleCheck size={28} />
          <h3>No flags in this snapshot</h3>
          <p>No review flags are available at {formatDate(state.demo_date)}.</p>
        </div>
      ) : (
        result.data.alerts.map((flag) => (
          <article className="review-flag" key={flag.id}>
            <div className="flag-status">
              <Badge tone={flag.status === 'cleared' ? 'success' : 'warning'}>
                {flag.status.replaceAll('_', ' ')}
              </Badge>
              <span>{formatDate(flag.detected_on)}</span>
            </div>
            <h3>{flag.organism}</h3>
            <p className="flag-drug">{flag.antibiotic_code} resistance</p>
            {flag.change_pp !== null ? (
              <div className="flag-change">
                {flag.change_pp > 0 ? '+' : ''}
                {flag.change_pp.toFixed(1)}
                <span>percentage points</span>
              </div>
            ) : (
              <p>Insufficient evidence to reevaluate this change.</p>
            )}
            <p className="flag-context">{flag.cohort_label}</p>
            <div className="flag-counts">
              <div>
                <span>Recent tested</span>
                <strong>{flag.n_recent}</strong>
              </div>
              <div>
                <span>Baseline tested</span>
                <strong>{flag.n_baseline}</strong>
              </div>
            </div>
            <Link
              className="button button--secondary inspect-link"
              to={`/investigate/${flag.id}${search}`}
            >
              Inspect evidence <ArrowRight size={16} />
            </Link>
          </article>
        ))
      )}
      <div className="review-note">
        <span className="tiny-dot" />
        <p>
          A descriptive signal for review.
          <br />
          Not a statistical-significance claim.
        </p>
      </div>
    </Panel>
  );
}
