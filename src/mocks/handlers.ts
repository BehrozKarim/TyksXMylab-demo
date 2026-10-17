import { http, HttpResponse, delay } from 'msw';
import { API_BASE } from '../api/client';
import type { Analysis, Investigation, InvestigationResponse, ReplayState } from '../api/contracts';
import {
  addDays,
  flag,
  initialState,
  makeComparison,
  makeEvidence,
  makeHistory,
  makeInvestigation,
  meta,
} from './fixtures';

let state: ReplayState = structuredClone(initialState);
let serial = 0;
let run = 1;
let lastTick = Date.now();
const snapshots = new Map<string, Analysis>();
const detections = new Map<string, Investigation>();
function save<T extends Analysis>(value: T) {
  snapshots.set(value.analysis_id, structuredClone(value));
  return value;
}
function nextId() {
  return `fixture-${run}-${++serial}`;
}
function captureDetection() {
  if (state.demo_date >= flag.detected_on && !detections.has(state.run_id))
    detections.set(state.run_id, save(makeInvestigation(state, nextId())));
}
function step() {
  const date = addDays(state.demo_date, 1);
  state = {
    ...state,
    demo_date: date,
    state_revision: state.state_revision + 1,
    status: date >= state.replay_bounds.end ? 'completed' : state.status,
    latest_visible_sample_date: date <= meta.source.end ? date : meta.source.end,
    published_bundles:
      date <= meta.source.end ? state.published_bundles + 8 : state.published_bundles,
  };
  captureDetection();
}
function advance() {
  if (state.status === 'running' && Date.now() - lastTick >= 4000) {
    step();
    lastTick = Date.now();
  }
}
// Imported only by the development browser test harness, never by feature code.
export const fixtureTestControl = { snapshot: () => structuredClone(state), step };
function guard(params: URLSearchParams) {
  if (
    (params.has('expected_run_id') && params.get('expected_run_id') !== state.run_id) ||
    (params.has('expected_revision') &&
      Number(params.get('expected_revision')) !== state.state_revision)
  )
    return HttpResponse.json(
      {
        error: {
          code: 'state_changed',
          message: 'The replay state changed; refresh the analysis.',
          details: { current_run_id: state.run_id, current_revision: state.state_revision },
        },
      },
      { status: 409 },
    );
}
const path = (suffix: string) => `${API_BASE}${suffix}`;
captureDetection();
export const handlers = [
  http.get(path('/meta'), () => HttpResponse.json(meta)),
  http.get(path('/state'), () => {
    advance();
    return HttpResponse.json(state);
  }),
  http.get(path('/evidence'), async ({ request }) => {
    await delay(180);
    const p = new URL(request.url).searchParams;
    const stale = guard(p);
    if (stale) return stale;
    return HttpResponse.json(save(makeEvidence(p, state, nextId())));
  }),
  http.get(path('/comparisons'), async ({ request }) => {
    await delay(220);
    const p = new URL(request.url).searchParams;
    const stale = guard(p);
    if (stale) return stale;
    if (
      p.get('antibiotic_a') === p.get('antibiotic_b') ||
      [p.get('antibiotic_a'), p.get('antibiotic_b')].includes('FOX')
    )
      return HttpResponse.json(
        { error: { message: 'Choose two different non-screening antibiotics.' } },
        { status: 422 },
      );
    return HttpResponse.json(save(makeComparison(p, state, nextId())));
  }),
  http.get(path('/alerts'), ({ request }) => {
    const p = new URL(request.url).searchParams;
    const stale = guard(p);
    if (stale) return stale;
    return HttpResponse.json({
      run_id: state.run_id,
      state_revision: state.state_revision,
      monitoring_as_of: state.demo_date,
      alerts:
        state.demo_date >= '2026-09-27'
          ? [
              {
                ...flag,
                status:
                  state.demo_date >= '2026-09-30'
                    ? 'insufficient_evidence'
                    : state.demo_date > '2026-09-27'
                      ? 'ongoing'
                      : 'new',
                change_pp: state.demo_date >= '2026-09-30' ? null : 12.5,
                n_recent: state.demo_date >= '2026-09-30' ? 29 : 40,
              },
            ]
          : [],
    });
  }),
  http.get(path('/investigations/:id'), ({ request, params }) => {
    const stale = guard(new URL(request.url).searchParams);
    if (stale) return stale;
    const detection = detections.get(state.run_id);
    if (params.id !== flag.id || !detection)
      return HttpResponse.json(
        { error: { message: 'This review flag is not available in the current replay snapshot.' } },
        { status: 404 },
      );
    const response: InvestigationResponse = {
      serving_context: {
        run_id: state.run_id,
        state_revision: state.state_revision,
        method_version: state.method_version,
        demo_date: state.demo_date,
      },
      analysis: detection,
    };
    return HttpResponse.json(response);
  }),
  http.get(path('/patients'), async ({ request }) => {
    await delay(120);
    const p = new URL(request.url).searchParams;
    const stale = guard(p);
    if (stale) return stale;
    const search = (p.get('search') ?? '').toLowerCase();
    return HttpResponse.json({
      patients: search
        ? ['P-00142', 'P-00187', 'P-00204']
            .filter((id) => id.toLowerCase().includes(search))
            .map((patient_id) => ({ patient_id, label: 'Synthetic patient' }))
        : [],
    });
  }),
  http.get(path('/patients/:id/history'), ({ request, params }) => {
    const p = new URL(request.url).searchParams;
    const stale = guard(p);
    if (stale) return stale;
    if (!['P-00142', 'P-00187', 'P-00204'].includes(String(params.id)))
      return HttpResponse.json({ error: { message: 'Patient not found.' } }, { status: 404 });
    return HttpResponse.json(
      save(makeHistory(String(params.id), p.get('as_of') ?? state.demo_date, state, nextId())),
    );
  }),
  http.post(path('/replay/:action'), async ({ params }) => {
    await delay(150);
    if (params.action === 'reset') {
      run++;
      state = {
        ...initialState,
        run_id: `fixture-run-${String(run).padStart(3, '0')}`,
        demo_date: '2026-09-20',
        latest_visible_sample_date: '2026-09-20',
        state_revision: 1,
        published_bundles: 264,
      };
    } else if (params.action === 'start') {
      if (state.status === 'completed')
        return HttpResponse.json(
          { error: { message: 'Replay completed. Reset to start again.' } },
          { status: 409 },
        );
      if (state.status !== 'running')
        state = { ...state, status: 'running', state_revision: state.state_revision + 1 };
      lastTick = Date.now();
    } else if (params.action === 'pause')
      state = { ...state, status: 'paused', state_revision: state.state_revision + 1 };
    else if (params.action === 'step') {
      if (state.status === 'running' || state.status === 'completed')
        return HttpResponse.json(
          { error: { message: 'Pause or reset the replay before stepping.' } },
          { status: 409 },
        );
      step();
    }
    return HttpResponse.json(state);
  }),
  http.get(path('/analyses/:id/export'), ({ params, request }) => {
    const snapshot = snapshots.get(String(params.id));
    if (!snapshot)
      return HttpResponse.json({ error: { message: 'Analysis not found.' } }, { status: 404 });
    if (new URL(request.url).searchParams.get('format') === 'json')
      return HttpResponse.json(snapshot, {
        headers: { 'Content-Disposition': `attachment; filename="${params.id}.json"` },
      });
    const provenance = {
      analysis_id: snapshot.analysis_id,
      ...snapshot.context,
      filters: JSON.stringify(snapshot.context.filters),
      date_bounds: JSON.stringify(snapshot.context.date_bounds),
      coverage: JSON.stringify(snapshot.context.coverage),
      scope_labels: JSON.stringify(snapshot.context.scope_labels),
    };
    const records =
      'windows' in snapshot
        ? Object.entries(snapshot.windows).map(([window, value]) => ({
            record_type: 'evidence',
            window,
            ...value,
            ...provenance,
          }))
        : 'comparison' in snapshot
          ? [{ record_type: 'comparison', ...snapshot.comparison, ...provenance }]
          : [{ record_type: 'analysis', data: snapshot, ...provenance }];
    const flatten = (value: Record<string, unknown>, prefix = ''): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(value).flatMap(([key, v]) => {
          const name = prefix ? `${prefix}_${key}` : key;
          return v !== null && typeof v === 'object' && !Array.isArray(v)
            ? Object.entries(flatten(v as Record<string, unknown>, name))
            : [[name, v]];
        }),
      );
    const flatRecords = records.map((record) => flatten(record));
    const headers = Array.from(new Set(flatRecords.flatMap((r) => Object.keys(r))));
    const cell = (v: unknown) =>
      `"${(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replaceAll('"', '""')}"`;
    const csv = [
      headers.join(','),
      ...flatRecords.map((row) => headers.map((key) => cell(row[key])).join(',')),
    ].join('\r\n');
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="${params.id}.csv"`,
      },
    });
  }),
];
