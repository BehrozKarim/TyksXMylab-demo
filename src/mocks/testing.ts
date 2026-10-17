// Dev-server-only fault injection, loaded explicitly by Playwright. No UI imports.
import { http, HttpResponse, delay } from 'msw';
import { API_BASE } from '../api/client';
import { worker } from './browser';
import { fixtureTestControl } from './handlers';
import { makeEvidence } from './fixtures';
import { queryClient, keys } from '../app/queries';
export function failRefresh(endpoint: 'state' | 'meta' | 'evidence' | 'comparisons') {
  worker.use(
    http.get(`${API_BASE}/${endpoint}`, () =>
      HttpResponse.json({ error: { message: 'Refresh connection unavailable.' } }, { status: 503 }),
    ),
  );
  return queryClient.invalidateQueries({
    queryKey:
      endpoint === 'state'
        ? keys.state
        : endpoint === 'meta'
          ? keys.meta
          : ['analysis', endpoint === 'comparisons' ? 'comparison' : 'evidence'],
  });
}
export function fault(kind: 'state_changed' | 'network' | 'legacy' | 'delayed') {
  let calls = 0;
  worker.use(
    http.get(`${API_BASE}/evidence`, async ({ request }) => {
      calls++;
      if (kind === 'network')
        return HttpResponse.json(
          { error: { message: 'The evidence service is unavailable.' } },
          { status: 503 },
        );
      if (kind === 'legacy') return HttpResponse.json({ rules_version: 'prototype-v1', rows: [] });
      if (kind === 'state_changed' && calls === 1) {
        fixtureTestControl.step();
        return HttpResponse.json(
          {
            error: {
              code: 'state_changed',
              message: 'The replay state changed; refresh the analysis.',
            },
          },
          { status: 409 },
        );
      }
      if (kind === 'delayed' && new URL(request.url).searchParams.get('ward_code') === 'ICU') {
        const snapshot = fixtureTestControl.snapshot();
        await delay(1200);
        return HttpResponse.json(
          makeEvidence(new URL(request.url).searchParams, snapshot, 'delayed-old-response'),
        );
      }
      return undefined;
    }),
  );
}
export function recover() {
  worker.resetHandlers();
}
