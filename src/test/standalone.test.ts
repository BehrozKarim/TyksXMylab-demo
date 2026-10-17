import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DemoEngine,
  DemoError,
  exportCsv,
  periodStart,
  priorAnniversary,
  wilson,
  type DemoData,
} from '../demo/engine';
import reference from './reference-parity.json';
import {
  backendEvidenceSchema,
  backendComparisonSchema,
  backendHistorySchema,
  backendMetaSchema,
  backendStateSchema,
} from '../api/backend';
import { alertListSchema, resistanceInvestigationSchema } from '../api/alerts';
import { summarySchema } from '../api/summaries';

const data = JSON.parse(readFileSync('public/data/demo-v1.json', 'utf8')) as DemoData;
function matches(actual: unknown, expected: unknown) {
  if (typeof expected === 'number') expect(actual).toBeCloseTo(expected, 10);
  else if (expected && typeof expected === 'object')
    for (const [key, value] of Object.entries(expected))
      matches((actual as Record<string, unknown>)[key], value);
  else expect(actual).toEqual(expected);
}
describe('reference parity with the supplied synthetic dataset', () => {
  for (const [index, row] of reference.entries())
    it(`matches Python evidence and paired calculation ${index + 1}, stage ${row.stage}`, () => {
      const engine = new DemoEngine(data, row.stage);
      const report = engine.evidence(row.query);
      matches(report.windows, row.windows);
      expect(backendEvidenceSchema.safeParse(report).success).toBe(true);
      const comparison = engine.comparison(row.comparison_query);
      matches(comparison.comparison, row.comparison);
      expect(backendComparisonSchema.safeParse(comparison).success).toBe(true);
    });
});
it('publishes complete bundles once, rejects stale reads, and retains old exports', () => {
  const engine = new DemoEngine(data),
    first = engine.state();
  const query = {
    ...reference[0].query,
    expected_run_id: first.run_id,
    expected_revision: first.state_revision,
  };
  const before = engine.request('/evidence', query) as ReturnType<DemoEngine['evidence']>;
  const frozen = JSON.stringify(before);
  const next = engine.demoStatus().next_batch!;
  engine.request('/demo/next', {}, 'POST', { delivery_id: next.delivery_id });
  expect(engine.state().published_cultures - first.published_cultures).toBe(next.cultures);
  expect(engine.state().state_revision).toBe(first.state_revision + 1);
  expect(() => engine.request('/evidence', query)).toThrow(DemoError);
  expect(() => engine.request('/demo/next', {}, 'POST', { delivery_id: next.delivery_id })).toThrow(
    DemoError,
  );
  expect(JSON.stringify(engine.request(`/analyses/${before.analysis_id}/export`))).toBe(frozen);
  const csv = exportCsv(before);
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv).toContain('"rolling_28_days"');
  expect(csv).toContain('context_source_files');
});
it('uses precomputed genuine alert lifecycle and exports original detection at every later stage', () => {
  let original: unknown;
  for (let stage = 0; stage < data.stages.length; stage++) {
    const engine = new DemoEngine(data, stage);
    expect(backendStateSchema.safeParse(engine.state()).success).toBe(true);
    expect(backendMetaSchema.safeParse(engine.request('/meta')).success).toBe(true);
    const alerts = alertListSchema.parse(engine.request('/alerts'));
    expect(alerts.state_revision).toBe(stage + 1);
    for (const alert of alerts.alerts) {
      const investigation = resistanceInvestigationSchema.parse(
        engine.request(`/investigations/${alert.investigation_id}`),
      );
      if (investigation.original_detection.context.monitor.ward_code === 'URO') {
        original ??= investigation.original_detection;
        expect(investigation.original_detection).toEqual(original);
      }
      expect(engine.request(`/analyses/${alert.original_analysis_id}/export`)).toBeDefined();
    }
  }
  expect(original).toBeDefined();
});
it('generates a schema-valid local summary tied to the frozen evidence', () => {
  const engine = new DemoEngine(data);
  const report = engine.request('/evidence', reference[0].query) as ReturnType<
    DemoEngine['evidence']
  >;
  const summary = summarySchema.parse(
    engine.request('/ai/summaries', {}, 'POST', { analysis_id: report.analysis_id }),
  );
  expect(summary.output_mode).toBe('template');
  expect(summary.analysis_id).toBe(report.analysis_id);
  expect(summary.paragraph).toContain('not treatment efficacy');
});
it('keeps history cutoff exclusive and never reveals unpublished cultures', () => {
  const engine = new DemoEngine(data);
  const patient = data.cultures[data.seed_count - 1][1];
  const report = backendHistorySchema.parse(
    engine.request(`/patients/${patient}/history`, { as_of: engine.state().demo_date }),
  );
  for (const culture of report.cultures) {
    expect(culture.record.sample_date < engine.state().demo_date).toBe(true);
    expect(culture.record.sample_date >= priorAnniversary(engine.state().demo_date)).toBe(true);
  }
  expect(() =>
    engine.request(`/patients/${patient}/history`, { cursor: 'another-snapshot:25' }),
  ).toThrow();
});
it('handles leap dates, Wilson endpoints and the minimum reporting threshold', () => {
  expect(periodStart('2024-02-29', 'rolling_12_months')).toBe('2023-03-01');
  expect(periodStart('2024-03-01', 'rolling_28_days')).toBe('2024-02-03');
  expect(wilson(0, 30).lower).toBe(0);
  expect(wilson(30, 30).upper).toBe(100);
  const mini = structuredClone(data);
  mini.cultures = [
    ['a', 'patient', '2026-09-01', 0, 0, 'F', 20, 0, null],
    ['b', 'patient', '2026-09-02', 1, 0, 'M', 70, 0, null],
    ['c', 'other', '2026-09-03', 1, 0, 'M', 70, 0, null],
  ];
  const cip = data.antibiotics.findIndex((d) => d.antibiotic_code === 'CIP');
  const tests = '-'.repeat(data.antibiotics.length).split('');
  tests[cip] = 'S';
  const organism = data.organisms.indexOf('Escherichia coli');
  mini.isolates = [
    ['i1', 0, organism, '-'.repeat(tests.length), '0000'],
    ['i2', 1, organism, tests.join(''), '0000'],
    ['i3', 2, organism, tests.join(''), '0000'],
  ];
  mini.stages[0].state.published_cultures = 3;
  const engine = new DemoEngine(mini);
  const query = {
    as_of: '2026-09-24',
    organism: 'Escherichia coli',
    specimen: 'urine',
    antibiotic_code: 'CIP',
  };
  const all = engine.evidence(query).windows.rolling_28_days;
  expect(all.n_eligible).toBe(2);
  expect(all.n_tested).toBe(1);
  expect(all.susceptibility_pct).toBeNull();
  // Older first isolate remains first even when age/sex/test availability differs.
  expect(engine.evidence({ ...query, sex: 'M' }).windows.rolling_28_days.n_eligible).toBe(1);
  const ward = data.wards[1].ward_code;
  expect(engine.evidence({ ...query, ward_code: ward }).windows.rolling_28_days.n_eligible).toBe(2);
  expect(
    engine.evidence({ ...query, ward_code: ward, dedup_scope: 'all_wards' }).windows.rolling_28_days
      .n_eligible,
  ).toBe(1);
});
it('finishes every batch, restores a valid stage and restarts at the seed', () => {
  const engine = new DemoEngine(data);
  while (engine.demoStatus().next_batch)
    engine.request('/demo/next', {}, 'POST', {
      delivery_id: engine.demoStatus().next_batch!.delivery_id,
    });
  expect(engine.state().published_cultures).toBe(46792);
  expect(engine.state().published_isolates).toBe(24571);
  expect(engine.demoStatus().phase).toBe('complete');
  expect(new DemoEngine(data, engine.stage).demoStatus()).toEqual(engine.demoStatus());
  expect(new DemoEngine(data, -1).stage).toBe(0);
  engine.request('/demo/reset', {}, 'POST');
  expect(engine.stage).toBe(0);
});
