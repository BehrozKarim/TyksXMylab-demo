import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { ReplayState } from '../api/contracts';
import { API_BASE, DATA_MODE } from '../api/client';
import { localRequest } from '../demo/transport';
import { Button, Drawer, RefreshNotice } from '../components/ui';
import { rememberTrigger } from '../components/focus';

const statusSchema = z.object({
  phase: z.enum(['starting', 'ready', 'processing', 'complete', 'error']),
  run_id: z.string(),
  next_batch: z
    .object({ delivery_id: z.string(), cultures: z.number(), as_of: z.string() })
    .nullable(),
  published_batches: z.number(),
  skipped_batches: z.number(),
  last_publication: z
    .object({ cultures: z.number(), as_of: z.string(), revision: z.number() })
    .nullable(),
  error: z.string().nullable(),
});

async function controlRequest(path: string, init?: RequestInit) {
  if (DATA_MODE === 'standalone')
    return statusSchema.parse(
      await localRequest(
        `/demo/${path}`,
        {},
        init?.signal ?? undefined,
        init?.method ?? 'GET',
        init?.body ? JSON.parse(String(init.body)) : {},
      ),
    );
  const base = import.meta.env.VITE_HOSTED_DEMO === '1' ? `${API_BASE}/demo` : '/__demo';
  const response = await fetch(`${base}/${path}`, {
    ...init,
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(90_000),
  });
  // A stale tab or duplicate click returns the current status without advancing.
  if (!response.ok && response.status !== 409)
    throw new Error('Could not reach demo controls. The server may be waking up; retry shortly.');
  return statusSchema.parse(await response.json());
}

export function DemoControls({ state }: { state: ReplayState }) {
  if (DATA_MODE !== 'standalone' && import.meta.env.VITE_DEMO_CONTROLS !== '1') return null;
  return <ManualFeed state={state} />;
}

function ManualFeed({ state }: { state: ReplayState }) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const key = ['demo-control', state.run_id];
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => controlRequest('status', { signal }),
    refetchInterval: (query) =>
      DATA_MODE === 'standalone' ? false : query.state.data?.phase === 'processing' ? 1000 : 5000,
    retry: false,
  });
  const send = useMutation({
    mutationFn: (deliveryId: string) =>
      controlRequest('next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_id: deliveryId }),
      }),
    retry: false,
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (value) => client.setQueryData(key, value),
    onSettled: () => void client.invalidateQueries({ queryKey: key }),
  });
  const data = status.data;
  const matches =
    data?.run_id === state.run_id && state.mode === 'feed' && state.status === 'receiving';
  const busy = send.isPending || data?.phase === 'processing';
  const last = data?.last_publication;
  return (
    <>
      <Button
        className="demo-feed-trigger"
        aria-label="Demo feed"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-busy={busy || undefined}
        onClick={() => {
          rememberTrigger();
          setOpen(true);
        }}
      >
        <FlaskConical size={16} aria-hidden="true" />
        Demo feed
        <span
          className="demo-feed-dot"
          data-error={status.isError || data?.phase === 'error' || undefined}
          aria-hidden="true"
        />
      </Button>
      <span className="sr-only" role="status">
        {busy
          ? 'Demo feed: processing laboratory results.'
          : last
            ? `Demo feed: ${last.cultures} cultures published through ${last.as_of}, revision ${last.revision}.`
            : ''}
      </span>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Demo feed"
        description={
          DATA_MODE === 'standalone'
            ? 'Publish the next synthetic lab batch in this browser.'
            : 'Send synthetic lab results and watch the evidence update automatically.'
        }
      >
        <section className="demo-controls" aria-label="Demo controls">
          {DATA_MODE === 'standalone' && (
            <p className="small-note">
              Your demo progress is saved in this tab. Each batch reveals existing synthetic
              records.
            </p>
          )}
          <dl className="demo-feed-summary">
            <div>
              <dt>Current report date</dt>
              <dd>{state.demo_date}</dd>
            </div>
            <div>
              <dt>Published batches</dt>
              <dd>{data?.published_batches ?? '—'}</dd>
            </div>
          </dl>
          <div className="demo-controls-row">
            <div>
              <strong>Publish laboratory results</strong>
              <p>Each click sends the next batch. Close this panel to see the updated dashboard.</p>
            </div>
            <Button
              variant="primary"
              disabled={!matches || data?.phase !== 'ready' || busy || status.isError}
              onClick={() => data?.next_batch && send.mutate(data.next_batch.delivery_id)}
            >
              {busy ? 'Processing batch…' : 'Send next lab batch'}
            </Button>
          </div>
          <p role="status" aria-live="polite">
            {!data
              ? 'Connecting to demo controls…'
              : !matches
                ? 'Demo run changed. Ask the demo owner to initialize it again.'
                : busy
                  ? 'Processing — waiting for publication.'
                  : data.phase === 'complete'
                    ? DATA_MODE === 'standalone'
                      ? 'All demo batches published. Restart the demo to run it again.'
                      : 'All demo batches published. The demo owner can start a new run.'
                    : data.phase === 'error'
                      ? data.error
                      : data.next_batch
                        ? `Ready: ${data.next_batch.cultures} cultures dated ${data.next_batch.as_of}.`
                        : 'Preparing the next batch…'}
          </p>
          {last && (
            <p>
              Published {last.cultures} cultures · {last.as_of} · revision {last.revision}. The
              dashboard updates automatically.
            </p>
          )}
          {!!data?.skipped_batches && (
            <p>{data.skipped_batches} previously published batches skipped.</p>
          )}
          <RefreshNotice
            error={status.error ?? send.error}
            onRetry={() => {
              send.reset();
              void status.refetch();
            }}
            pending={status.isFetching}
            title="Could not confirm demo status"
          />
        </section>
        {DATA_MODE === 'standalone' && (
          <Button
            disabled={busy}
            onClick={async () => {
              await controlRequest('reset', { method: 'POST' });
              window.location.assign(window.location.pathname);
            }}
          >
            Restart demo
          </Button>
        )}
      </Drawer>
    </>
  );
}
