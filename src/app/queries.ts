import {
  hashKey,
  QueryClient,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api, ApiError, DATA_MODE } from '../api/client';
import { subscribeToUpdates } from '../api/updates';
import type { ReplayState } from '../api/contracts';
import { useEffect, useRef, useState } from 'react';
import { DEMO_UPDATE } from '../demo/transport';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: DATA_MODE === 'standalone' ? 'always' : 'online',
      staleTime: 30_000,
      retry: (count, error) =>
        count < 1 &&
        !(
          error instanceof ApiError &&
          (error.status < 500 ||
            error.code === 'invalid_contract' ||
            error.code === 'invalid_context')
        ),
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false, networkMode: DATA_MODE === 'standalone' ? 'always' : 'online' },
  },
});
export const keys = {
  meta: ['meta'] as const,
  state: ['state'] as const,
  analysis: (kind: string, state: ReplayState, params: unknown) =>
    ['analysis', kind, state.run_id, state.state_revision, state.method_version, params] as const,
};
export function useMeta() {
  return useQuery({
    queryKey: keys.meta,
    queryFn: ({ signal }) => api.meta(signal),
    staleTime: Infinity,
  });
}
export function useReplayState() {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (DATA_MODE === 'standalone') {
      const refresh = () => void client.invalidateQueries({ queryKey: keys.state });
      window.addEventListener(DEMO_UPDATE, refresh);
      setConnected(true);
      return () => window.removeEventListener(DEMO_UPDATE, refresh);
    }
    if (DATA_MODE !== 'api') return;
    return subscribeToUpdates(
      () => void client.invalidateQueries({ queryKey: keys.state }),
      setConnected,
    );
  }, [client]);
  const result = useQuery({
    queryKey: keys.state,
    queryFn: ({ signal }) => api.state(signal),
    refetchInterval: DATA_MODE === 'standalone' ? false : connected ? 30_000 : 2000,
    refetchIntervalInBackground: false,
  });
  const revision = result.data ? `${result.data.run_id}/${result.data.state_revision}` : undefined;
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Feed publication can introduce dictionary entries as well as result revisions.
    if (revision && previous.current && revision !== previous.current)
      void client.invalidateQueries({ queryKey: keys.meta });
    previous.current = revision;
  }, [revision, client]);
  return { ...result, updatesConnected: connected };
}
export function useAnalysis<T>(
  kind: string,
  state: ReplayState,
  params: unknown,
  fn: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const client = useQueryClient();
  const recoveredAt = useRef(0);
  const identity = hashKey([kind, state.run_id, state.method_version, params]);
  const [retained, setRetained] = useState<{ identity: string; data: T }>();
  const result = useQuery<T>({
    queryKey: keys.analysis(kind, state, params),
    enabled,
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      // Retain complete same-population snapshots during revision refresh only.
      // Never borrow values across filters, patient/cursor changes, dates or runs.
      return key?.[2] === state.run_id &&
        key[4] === state.method_version &&
        hashKey([key[5]]) === hashKey([params])
        ? previous
        : undefined;
    },
    queryFn: async ({ signal }) => {
      try {
        return await fn(signal);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.code === 'state_changed' &&
          Date.now() - recoveredAt.current >= 2000
        ) {
          // One refresh per request; changing the state key schedules the fresh snapshot.
          // A further race remains visible until the next state poll, without a retry loop.
          recoveredAt.current = Date.now();
          const latest = await api.state(signal);
          client.setQueryData(keys.state, latest);
        }
        throw error;
      }
    },
    retry: (count, error) =>
      count < 1 &&
      !(
        error instanceof ApiError &&
        ((error.status < 500 && error.code !== 'publication_busy') ||
          ['invalid_contract', 'invalid_context'].includes(error.code))
      ),
  });
  // Query placeholder data disappears after an error. Recover only a complete,
  // validated snapshot for exactly this population/date/cursor and current run.
  const previous =
    result.data === undefined && (result.isError || result.isPending)
      ? (client
          .getQueryCache()
          .findAll({ queryKey: ['analysis', kind, state.run_id] })
          .filter(
            (q) =>
              q.state.data !== undefined &&
              q.queryKey[4] === state.method_version &&
              Number(q.queryKey[3]) <= state.state_revision &&
              hashKey([q.queryKey[5]]) === hashKey([params]),
          )
          .sort((a, b) => Number(b.queryKey[3]) - Number(a.queryKey[3]))[0]?.state.data as
          T | undefined)
      : undefined;
  const data = result.data ?? (retained?.identity === identity ? retained.data : previous);
  useEffect(() => {
    // Keep one active-view snapshot even if an obsolete revision's cache is collected.
    if (data !== undefined)
      setRetained((current) =>
        current?.identity === identity && current.data === data ? current : { identity, data },
      );
  }, [identity, data]);
  const visible: UseQueryResult<T, Error> =
    (result.isError || result.isPending) && data !== undefined
      ? {
          ...result,
          data,
          error: null,
          status: 'success',
          isSuccess: true,
          isError: false,
          isPending: false,
          isLoading: false,
          isLoadingError: false,
          isRefetchError: false,
          isPlaceholderData: result.isPending || result.isPlaceholderData,
        }
      : result;
  return { ...visible, refreshError: result.isError && data !== undefined ? result.error : null };
}
