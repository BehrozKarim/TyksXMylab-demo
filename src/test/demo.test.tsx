import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { DemoControls } from '../features/DemoControls';
import { initialState } from '../mocks/fixtures';

const state = { ...initialState, mode: 'feed' as const, status: 'receiving' as const };
const ready = {
  phase: 'ready',
  run_id: state.run_id,
  next_batch: { delivery_id: 'first-batch', cultures: 20, as_of: '2026-09-25' },
  published_batches: 0,
  skipped_batches: 0,
  last_publication: null,
  error: null,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <DemoControls state={state} />
    </QueryClientProvider>,
  );
  return () => {
    view.unmount();
    client.clear();
  };
}

it('does not expose controls or send requests in ordinary app startup', () => {
  vi.stubEnv('VITE_DEMO_CONTROLS', '');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const close = mount();
  expect(screen.queryByRole('region', { name: 'Demo controls' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Demo feed' })).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  close();
});

it('waits for a click, sends only the advertised ID and disables while publishing', async () => {
  vi.stubEnv('VITE_DEMO_CONTROLS', '1');
  let status = ready;
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') status = { ...ready, phase: 'processing' };
    return new Response(JSON.stringify(status), { status: init.method === 'POST' ? 202 : 200 });
  });
  vi.stubGlobal('fetch', fetcher);
  const close = mount();
  expect(screen.queryByRole('region', { name: 'Demo controls' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Demo feed' }));
  const button = await screen.findByRole('button', { name: 'Send next lab batch' });
  await waitFor(() => expect(button).toBeEnabled());
  expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0);
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  await screen.findByText('Processing — waiting for publication.');
  fireEvent.click(button);
  const posts = fetcher.mock.calls.filter(([, init]) => init.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0][1].body).toBe(JSON.stringify({ delivery_id: 'first-batch' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
  expect(screen.getByRole('button', { name: 'Demo feed' })).toHaveAttribute('data-busy', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Demo feed' }));
  expect(screen.getByRole('button', { name: 'Processing batch…' })).toBeDisabled();
  expect(fetcher.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1);
  close();
});

it('uses the public hosted API with no password or local controller', async () => {
  vi.stubEnv('VITE_DEMO_CONTROLS', '1');
  vi.stubEnv('VITE_HOSTED_DEMO', '1');
  const fetcher = vi.fn(async () => new Response(JSON.stringify(ready)));
  vi.stubGlobal('fetch', fetcher);
  const close = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Demo feed' }));
  const button = await screen.findByRole('button', { name: 'Send next lab batch' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/v1/demo/next', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ delivery_id: 'first-batch' }),
    headers: { 'Content-Type': 'application/json' },
  })));
  expect(fetcher).toHaveBeenCalledWith('/api/v1/demo/status', expect.any(Object));
  close();
});

it.each([
  { ...ready, phase: 'complete', next_batch: null },
  { ...ready, run_id: 'a-replaced-run' },
  { ...ready, phase: 'error', error: 'Delivery could not be confirmed.' },
])('prevents sending when complete, mismatched or failed ($phase)', async (status) => {
  vi.stubEnv('VITE_DEMO_CONTROLS', '1');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(status))),
  );
  const close = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Demo feed' }));
  await waitFor(() =>
    expect(screen.queryByText('Connecting to demo controls…')).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Send next lab batch' })).toBeDisabled();
  close();
});
