import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToUpdates } from '../api/updates';

class FakeEventSource {
  static current: FakeEventSource;
  onopen?: () => void;
  onerror?: () => void;
  listener?: (event: { data: string }) => void;
  close = vi.fn();
  constructor(public url: string) {
    FakeEventSource.current = this;
  }
  addEventListener(_type: string, listener: (event: { data: string }) => void) {
    this.listener = listener;
  }
}
const state = {
  run_id: 'new-run',
  state_revision: 2,
  status: 'receiving',
  mode: 'feed',
  clock_mode: 'simulated',
  demo_date: '2026-09-27',
  seed_through: '2026-09-26',
  replay_through: '2026-09-27',
  latest_visible_sample_date: '2026-09-27',
  source_kind: 'directory',
  published_cultures: 50,
  published_isolates: 50,
};
describe('durable state notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('coalesces notifications into fresh reads instead of assigning event payloads', () => {
    const refresh = vi.fn(),
      connection = vi.fn();
    const close = subscribeToUpdates(refresh, connection);
    const source = FakeEventSource.current;
    expect(source.url).toBe('/api/v1/updates');
    source.onopen?.();
    source.listener?.({ data: JSON.stringify(state) });
    source.listener?.({
      data: JSON.stringify({ ...state, run_id: 'older-run', state_revision: 1 }),
    });
    vi.advanceTimersByTime(150);
    expect(refresh.mock.calls).toEqual([[]]);
    expect(connection).toHaveBeenCalledWith(true);
    source.onerror?.();
    expect(connection).toHaveBeenLastCalledWith(false);
    close();
    expect(source.close).toHaveBeenCalledOnce();
  });
  it('ignores malformed notifications and cancels queued refreshes when unmounted', () => {
    const refresh = vi.fn();
    const close = subscribeToUpdates(refresh, vi.fn());
    FakeEventSource.current.listener?.({ data: '{invalid' });
    FakeEventSource.current.listener?.({ data: JSON.stringify({ status: 'receiving' }) });
    vi.advanceTimersByTime(150);
    expect(refresh).not.toHaveBeenCalled();
    FakeEventSource.current.listener?.({ data: JSON.stringify(state) });
    close();
    vi.advanceTimersByTime(150);
    expect(refresh).not.toHaveBeenCalled();
  });
});
