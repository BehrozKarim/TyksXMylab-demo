import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { keys, useAnalysis } from '../app/queries';
import { useTrendRefresh, TREND_REFRESH_MS } from '../app/useTrendRefresh';
import { initialState, meta } from '../mocks/fixtures';
import { readCohort } from '../domain/cohort';

const query = readCohort(new URLSearchParams(), meta, initialState).query;
afterEach(() => vi.useRealTimers());

describe('retaining valid results after refresh failure', () => {
  it('keeps an exact-population snapshot across revision failure, then replaces it on retry', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const saved = { analysis_id: 'frozen-original' };
    client.setQueryData(keys.analysis('evidence', initialState, query), saved);
    let offline = true;
    const load = vi.fn(async () => {
      if (offline) throw new ApiError('Offline', 503);
      return { analysis_id: 'fresh-result' };
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () =>
        useAnalysis(
          'evidence',
          { ...initialState, state_revision: initialState.state_revision + 1 },
          query,
          load,
        ),
      { wrapper },
    );
    expect(result.current.data).toEqual(saved);
    await waitFor(() => expect(result.current.refreshError?.message).toBe('Offline'));
    expect(result.current.data).toEqual(saved);
    act(() =>
      client.removeQueries({
        queryKey: keys.analysis('evidence', initialState, query),
        exact: true,
      }),
    );
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual(saved);
    offline = false;
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.data?.analysis_id).toBe('fresh-result'));
    expect(result.current.refreshError).toBeNull();
    unmount();
    client.clear();
  });
  it.each(['population', 'date', 'cursor', 'run'])(
    'never borrows results across a changed %s',
    async (changed) => {
      const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
      const oldParams = { ...query, cursor: 'old-page' };
      client.setQueryData(keys.analysis('evidence', initialState, oldParams), {
        analysis_id: 'wrong-snapshot',
      });
      const params = {
        ...oldParams,
        ...(changed === 'population'
          ? { ward_code: 'ICU' }
          : changed === 'date'
            ? { as_of: '2026-09-20' }
            : changed === 'cursor'
              ? { cursor: 'new-page' }
              : {}),
      };
      const state = {
        ...initialState,
        run_id: changed === 'run' ? 'different-run' : initialState.run_id,
        state_revision: initialState.state_revision + 1,
      };
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const { result, unmount } = renderHook(
        () =>
          useAnalysis('evidence', state, params, async () => {
            throw new ApiError('Offline', 503);
          }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.data).toBeUndefined();
      expect(result.current.refreshError).toBeNull();
      unmount();
      client.clear();
    },
  );
});

describe('historical chart refresh scheduling', () => {
  it('loads the initial target immediately and coalesces continuous revisions at a fixed deadline', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ state }) => useTrendRefresh(state, query), {
      initialProps: { state: initialState },
    });
    expect(result.current.snapshot.state.state_revision).toBe(initialState.state_revision);
    act(() => vi.advanceTimersByTime(10_000));
    rerender({ state: { ...initialState, state_revision: 9 } });
    act(() => vi.advanceTimersByTime(10_000));
    rerender({ state: { ...initialState, state_revision: 10 } });
    act(() => vi.advanceTimersByTime(TREND_REFRESH_MS - 20_000 - 1));
    expect(result.current.snapshot.state.state_revision).toBe(initialState.state_revision);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.snapshot.state.state_revision).toBe(10);
  });
  it('manual refresh uses the newest snapshot and resets the automatic deadline', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ state }) => useTrendRefresh(state, query), {
      initialProps: { state: initialState },
    });
    act(() => vi.advanceTimersByTime(5000));
    rerender({ state: { ...initialState, state_revision: 9 } });
    act(() => result.current.refresh());
    expect(result.current.snapshot.state.state_revision).toBe(9);
    rerender({ state: { ...initialState, state_revision: 10 } });
    act(() => vi.advanceTimersByTime(TREND_REFRESH_MS - 1));
    expect(result.current.snapshot.state.state_revision).toBe(9);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.snapshot.state.state_revision).toBe(10);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
