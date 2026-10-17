import { useEffect, useRef, useState } from 'react';
import type { CohortQuery, ReplayState } from '../api/contracts';
import { DATA_MODE } from '../api/client';

export const TREND_REFRESH_MS = DATA_MODE === 'standalone' ? 0 : 30_000;

/** The caller remounts for a new population, explicit date/year, or run.
 * Revision bursts have a fixed deadline, so a continuous feed cannot starve refresh.
 */
export function useTrendRefresh(state: ReplayState, query: CohortQuery) {
  const [snapshot, setSnapshot] = useState({ state, query });
  const lastRefresh = useRef(Date.now());
  const latest = useRef({ state, query });
  useEffect(() => {
    latest.current = { state, query };
    if (
      snapshot.state.state_revision === state.state_revision &&
      snapshot.query.as_of === query.as_of
    )
      return;
    const timer = setTimeout(
      () => {
        lastRefresh.current = Date.now();
        setSnapshot(latest.current);
      },
      Math.max(0, lastRefresh.current + TREND_REFRESH_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [state, query, snapshot]);
  const refresh = () => {
    lastRefresh.current = Date.now();
    setSnapshot({ state, query });
  };
  return { snapshot, refresh };
}
