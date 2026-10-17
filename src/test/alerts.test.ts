import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alertAnalysisSchema,
  alertWindowSchema,
  resistanceInvestigationSchema,
} from '../api/alerts';
import { api } from '../api/client';
import { initialState } from '../mocks/fixtures';

import { monitor, recent, context, analysis, record } from './alert-fixtures';

afterEach(() => vi.restoreAllMocks());
describe('Published resistance alerts', () => {
  it('validates separate baseline/recent dates and rejects date overlap', () => {
    expect(alertAnalysisSchema.safeParse(analysis).success).toBe(true);
    expect(
      alertAnalysisSchema.safeParse({
        ...analysis,
        evaluation: {
          ...analysis.evaluation,
          baseline: { ...analysis.evaluation.baseline, end_date_exclusive: '2026-09-28' },
        },
      }).success,
    ).toBe(false);
  });
  it('rejects leaked resistance below 30 tested isolates', () => {
    const sparse = { ...recent, n_eligible: 29, n_tested: 29, n_s: 20 };
    expect(alertWindowSchema.safeParse(sparse).success).toBe(false);
    expect(alertWindowSchema.safeParse({ ...sparse, resistance_pct: null }).success).toBe(true);
  });
  it('withholds a percentage-point change when the alert is insufficient', () => {
    expect(
      alertAnalysisSchema.safeParse({
        ...analysis,
        evaluation: { ...analysis.evaluation, status: 'insufficient_evidence' },
      }).success,
    ).toBe(false);
  });
  it('keeps archived original detections and rejects substituted identities', () => {
    const archived = {
      alert: record,
      original_detection: analysis,
      current_analysis: null,
      current_analysis_status: 'archived_run',
      transitions: [],
    };
    expect(resistanceInvestigationSchema.safeParse(archived).success).toBe(true);
    expect(
      resistanceInvestigationSchema.safeParse({
        ...archived,
        original_detection: { ...analysis, analysis_id: 'different' },
      }).success,
    ).toBe(false);
  });
  it('accepts a lagging monitoring revision after a replay control revision', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        run_id: initialState.run_id,
        state_revision: 8,
        monitoring_revision: 7,
        monitoring_as_of: '2026-09-27',
        configuration: { threshold_pp: 10, minimum_tested: 30, monitors: [monitor] },
        alerts: [record],
        monitors: [analysis],
      }),
    );
    const data = await api.resistanceAlerts(initialState);
    expect(data.monitoring_revision).toBe(7);
  });
  it('accepts alert-v1 current analysis separately from the evidence method', async () => {
    const current = {
      ...analysis,
      analysis_id: 'latest',
      context: { ...context, state_revision: 8 },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        alert: record,
        original_detection: analysis,
        current_analysis: current,
        current_analysis_status: 'available',
        transitions: [],
      }),
    );
    const result = await api.resistanceInvestigation('alert1', initialState);
    expect(result.original_detection.context.state_revision).toBe(7);
    expect(result.current_analysis?.context.state_revision).toBe(8);
  });
});
