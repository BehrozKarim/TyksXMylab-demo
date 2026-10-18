import { z } from 'zod';
import { localRequest, LocalRequestError } from '../demo/transport';
import { createStandaloneSummary, getStandaloneSummary } from './live-summary';
import {
  alertsSchema,
  comparisonSchema,
  evidenceSchema,
  historySchema,
  investigationResponseSchema,
  metaSchema,
  patientsSchema,
  stateSchema,
} from './contracts';
import type { AnalysisContext, CohortQuery, Evidence, ReplayState } from './contracts';
import { summarySchema, type ReportSummary } from './summaries';
import { alertListSchema, resistanceInvestigationSchema } from './alerts';
import {
  backendEvidenceSchema,
  backendComparisonSchema,
  backendStateSchema,
  backendMetaSchema,
  backendPatientsSchema,
  backendHistorySchema,
  mapEvidence,
  mapComparison,
  mapState,
  mapMeta,
  mapHistory,
} from './backend';

export const DATA_MODE = import.meta.env.VITE_DATA_MODE ?? 'standalone';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code = 'request_failed',
  ) {
    super(message);
  }
}
export const queryString = (params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
    });
  return search.toString();
};
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  if (DATA_MODE === 'standalone') {
    try {
      return schema.parse(await localRequest(path, params, signal, method, body));
    } catch (error) {
      if (error instanceof LocalRequestError)
        throw new ApiError(error.message, error.status, error.code);
      throw error;
    }
  }
  const response = await fetch(
    `${API_BASE}${path}${Object.keys(params).length ? `?${queryString(params)}` : ''}`,
    {
      signal,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.error?.message ?? `Request failed (${response.status}). Please try again.`,
      response.status,
      data.error?.code === 'stale_state' ? 'state_changed' : data.error?.code,
    );
  }
  const result = schema.safeParse(await response.json());
  if (!result.success)
    throw new ApiError(
      'The API returned an incompatible evidence contract. Check the /api/v1 integration.',
      502,
      'invalid_contract',
    );
  return result.data;
}
const guard = (state: ReplayState) => ({
  expected_run_id: state.run_id,
  expected_revision: state.state_revision,
});
export function assertContext(context: AnalysisContext, state: ReplayState, query?: CohortQuery) {
  if (
    context.run_id !== state.run_id ||
    context.state_revision !== state.state_revision ||
    context.method_version !== state.method_version
  )
    throw new ApiError('The snapshot changed. Refreshing evidence…', 409, 'state_changed');
  if (
    query &&
    (context.as_of !== query.as_of ||
      Object.keys(context.filters).some(
        (key) =>
          context.filters[key as keyof typeof context.filters] !== query[key as keyof CohortQuery],
      ))
  )
    throw new ApiError('The response does not match the selected cohort.', 502, 'invalid_context');
}
function cohortParams(q: CohortQuery) {
  const { antibiotic_b: _b, window: _w, calendar_year, ...rest } = q;
  void _b;
  void _w;
  return DATA_MODE !== 'fixtures'
    ? { ...rest, dedup_scope: q.dedup_scope ?? 'selected_cohort' }
    : { ...rest, calendar_year };
}
export const api = {
  async summarize(evidence: Evidence, signal?: AbortSignal) {
    const summary =
      DATA_MODE === 'standalone'
        ? await createStandaloneSummary(evidence, signal)
        : await request('/ai/summaries', summarySchema, {}, signal, 'POST', {
            analysis_id: evidence.analysis_id,
            language: 'en',
          });
    assertSummary(summary, evidence);
    return summary;
  },
  async summary(id: string, evidence: Evidence, signal?: AbortSignal) {
    const summary =
      DATA_MODE === 'standalone'
        ? await getStandaloneSummary(id, evidence, signal)
        : await request(`/ai/summaries/${encodeURIComponent(id)}`, summarySchema, {}, signal);
    assertSummary(summary, evidence);
    if (summary.summary_id !== id)
      throw new ApiError('The response belongs to a different summary.', 502, 'invalid_context');
    return summary;
  },
  async resistanceAlerts(state: ReplayState, signal?: AbortSignal) {
    const data = await request('/alerts', alertListSchema, guard(state), signal);
    if (
      data.run_id !== state.run_id ||
      data.state_revision !== state.state_revision ||
      data.monitoring_as_of !== state.demo_date ||
      data.monitoring_revision > state.state_revision ||
      data.monitors.some(
        (m) =>
          m.context.run_id !== state.run_id ||
          m.context.state_revision !== data.monitoring_revision ||
          m.context.monitoring_as_of !== data.monitoring_as_of,
      ) ||
      data.alerts.some(
        (a) =>
          a.run_id !== state.run_id ||
          !data.monitors.some((m) => m.context.monitor_id === a.monitor_id),
      )
    )
      throw new ApiError('Resistance monitoring is updating.', 409, 'state_changed');
    return data;
  },
  async resistanceInvestigation(id: string, state: ReplayState, signal?: AbortSignal) {
    const data = await request(
      `/investigations/${encodeURIComponent(id)}`,
      resistanceInvestigationSchema,
      guard(state),
      signal,
    );
    if (data.alert.investigation_id !== id)
      throw new ApiError(
        'This response belongs to a different investigation.',
        502,
        'invalid_context',
      );
    const current = data.current_analysis;
    if (
      current &&
      (current.context.run_id !== state.run_id ||
        current.context.state_revision !== state.state_revision ||
        current.context.monitoring_as_of !== state.demo_date ||
        current.context.monitor_id !== data.alert.monitor_id)
    )
      throw new ApiError('This investigation is updating.', 409, 'state_changed');
    return data;
  },
  meta: async (signal?: AbortSignal) =>
    DATA_MODE !== 'fixtures'
      ? mapMeta(await request('/meta', backendMetaSchema, {}, signal))
      : request('/meta', metaSchema, {}, signal),
  state: async (signal?: AbortSignal) =>
    DATA_MODE !== 'fixtures'
      ? mapState(await request('/state', backendStateSchema, {}, signal))
      : request('/state', stateSchema, {}, signal),
  async evidence(query: CohortQuery, state: ReplayState, signal?: AbortSignal) {
    const params = { ...cohortParams(query), ...guard(state) };
    const data =
      DATA_MODE !== 'fixtures'
        ? mapEvidence(await request('/evidence', backendEvidenceSchema, params, signal), query)
        : await request(
            '/evidence',
            evidenceSchema,
            { ...cohortParams(query), ...guard(state) },
            signal,
          );
    assertContext(data.context, state, query);
    if (data.antibiotic_code !== query.antibiotic_code)
      throw new ApiError('The response has a different antibiotic.', 502, 'invalid_context');
    return data;
  },
  async comparison(query: CohortQuery, state: ReplayState, signal?: AbortSignal) {
    const { antibiotic_code, ...params } = cohortParams(query);
    const window =
      DATA_MODE !== 'fixtures'
        ? query.window === 'rolling_12m'
          ? 'rolling_12_months'
          : 'rolling_28_days'
        : query.window;
    const p = {
      ...params,
      antibiotic_a: antibiotic_code,
      antibiotic_b: query.antibiotic_b,
      window,
      ...guard(state),
    };
    const data =
      DATA_MODE !== 'fixtures'
        ? mapComparison(await request('/comparisons', backendComparisonSchema, p, signal), query)
        : await request(
            '/comparisons',
            comparisonSchema,
            {
              ...params,
              antibiotic_a: antibiotic_code,
              antibiotic_b: query.antibiotic_b,
              window: query.window,
              ...guard(state),
            },
            signal,
          );
    assertContext(
      data.context,
      DATA_MODE !== 'fixtures' ? { ...state, method_version: 'comparison-v1' } : state,
      query,
    );
    if (
      data.comparison.antibiotic_a !== query.antibiotic_code ||
      data.comparison.antibiotic_b !== query.antibiotic_b ||
      data.comparison.window !== query.window
    )
      throw new ApiError('The response has a different comparison.', 502, 'invalid_context');
    return data;
  },
  async alerts(state: ReplayState, signal?: AbortSignal) {
    const data = await request('/alerts', alertsSchema, guard(state), signal);
    if (
      data.run_id !== state.run_id ||
      data.state_revision !== state.state_revision ||
      data.monitoring_as_of !== state.demo_date
    )
      throw new ApiError('Review flags are updating.', 409, 'state_changed');
    return data;
  },
  async investigation(id: string, state: ReplayState, signal?: AbortSignal) {
    const response = await request(
      `/investigations/${encodeURIComponent(id)}`,
      investigationResponseSchema,
      guard(state),
      signal,
    );
    const serving = response.serving_context;
    if (
      serving.run_id !== state.run_id ||
      serving.state_revision !== state.state_revision ||
      serving.method_version !== state.method_version ||
      serving.demo_date !== state.demo_date
    )
      throw new ApiError('The snapshot changed. Refreshing evidence…', 409, 'state_changed');
    const data = response.analysis;
    if (
      data.context.run_id !== state.run_id ||
      data.context.state_revision > state.state_revision ||
      data.context.as_of > state.demo_date ||
      data.context.as_of !== data.alert.detected_on ||
      data.alert.id !== id
    )
      throw new ApiError(
        'The response does not match this detection snapshot.',
        502,
        'invalid_context',
      );
    return data;
  },
  async patients(search: string, as_of: string, state: ReplayState, signal?: AbortSignal) {
    if (DATA_MODE === 'fixtures')
      return request('/patients', patientsSchema, { search, as_of, ...guard(state) }, signal);
    const data = await request(
      '/patients',
      backendPatientsSchema,
      { search, as_of, ...guard(state) },
      signal,
    );
    if (
      data.run_id !== state.run_id ||
      data.state_revision !== state.state_revision ||
      data.as_of !== as_of
    )
      throw new ApiError('Patient search is updating.', 409, 'state_changed');
    return {
      has_more: data.has_more,
      patients: data.patients.map((p) => ({
        ...p,
        label: `${p.visible_cultures} samples · latest ${p.latest_sample_date}`,
      })),
    };
  },
  async history(
    id: string,
    as_of: string,
    state: ReplayState,
    signal?: AbortSignal,
    cursor?: string,
  ) {
    const params = {
      as_of,
      ...guard(state),
      ...(cursor ? { cursor } : {}),
      ...(DATA_MODE !== 'fixtures' ? { limit: 25 } : {}),
    };
    const data =
      DATA_MODE !== 'fixtures'
        ? mapHistory(
            await request(
              `/patients/${encodeURIComponent(id)}/history`,
              backendHistorySchema,
              params,
              signal,
            ),
          )
        : await request(
            `/patients/${encodeURIComponent(id)}/history`,
            historySchema,
            { as_of, ...guard(state) },
            signal,
          );
    assertContext(
      data.context,
      DATA_MODE !== 'fixtures' ? { ...state, method_version: 'history-v1' } : state,
    );
    if (
      data.patient_id !== id ||
      data.cutoff !== as_of ||
      data.cultures.some((c) => c.sample_date >= as_of || c.sample_date < data.lookback_start)
    )
      throw new ApiError(
        'Patient history does not match the collection cutoff.',
        502,
        'invalid_context',
      );
    return data;
  },
  replay: async (action: 'start' | 'pause' | 'step' | 'reset', state?: ReplayState) => {
    const body =
      DATA_MODE !== 'fixtures'
        ? { ...(state ? guard(state) : {}), ...(action === 'start' ? { interval_seconds: 4 } : {}) }
        : action === 'start'
          ? { days_per_tick: 1, interval_ms: 4000 }
          : {};
    if (DATA_MODE !== 'fixtures')
      return mapState(
        await request(`/replay/${action}`, backendStateSchema, {}, undefined, 'POST', body),
      );
    return request(
      `/replay/${action}`,
      stateSchema,
      {},
      undefined,
      'POST',
      action === 'start' ? { days_per_tick: 1, interval_ms: 4000 } : {},
    );
  },
  async export(id: string, format: 'csv' | 'json') {
    if (DATA_MODE === 'standalone') {
      const result = await localRequest(`/analyses/${encodeURIComponent(id)}/export`, { format });
      const blob = new Blob(
        [format === 'json' ? JSON.stringify(result, null, 2) : String(result)],
        {
          type: format === 'json' ? 'application/json' : 'text/csv',
        },
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `ward-evidence-${id}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const response = await fetch(
      `${API_BASE}/analyses/${encodeURIComponent(id)}/export?format=${format}`,
    );
    if (!response.ok)
      throw new ApiError(
        'This snapshot could not be downloaded. Retry to export the same analysis.',
        response.status,
      );
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ward-evidence-${id}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

function assertSummary(summary: ReportSummary, evidence: Evidence) {
  if (
    summary.analysis_id !== evidence.analysis_id ||
    summary.run_id !== evidence.context.run_id ||
    summary.state_revision !== evidence.context.state_revision ||
    summary.method_version !== evidence.context.method_version ||
    summary.as_of !== evidence.context.as_of
  )
    throw new ApiError('The summary does not match this saved report.', 502, 'invalid_context');
}
