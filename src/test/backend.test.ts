import { describe, expect, it } from 'vitest';
import {
  backendComparisonSchema,
  backendEvidenceSchema,
  backendHistorySchema,
  backendStateSchema,
  mapComparison,
  mapEvidence,
  mapHistory,
  mapState,
} from '../api/backend';
import { assertContext } from '../api/client';
import { initialState, makeComparison, makeEvidence, meta } from '../mocks/fixtures';
import { readCohort } from '../domain/cohort';
import { trendDates } from '../domain/trend';

const query = readCohort(new URLSearchParams(), meta, initialState).query;
const authored = makeEvidence(new URLSearchParams(), initialState, 'saved-evidence');
const filters = {
  as_of: query.as_of,
  ward_code: query.ward_code,
  specimen: query.specimen,
  organism: query.organism,
  sex: null,
  age_min: null,
  age_max: null,
  dedup_scope: 'selected_cohort',
  known_at: null,
};
const source = {
  run_id: initialState.run_id,
  state_revision: initialState.state_revision,
  method_version: 'evidence-v1',
  demo_date: query.as_of,
  source_manifest_id: 'source-1',
  source_kind: 'directory',
};
const metadata = {
  retained_before_demographic_filters: 40,
  unknown_age: 0,
  unknown_sex: 0,
  excluded_unknown: 0,
  excluded_nonmatching: 0,
};
const coverage = { source_date_span_covers_window: true, source_fully_imported: true };
const wireEvidence = () => ({
  analysis_id: 'saved-evidence',
  context: {
    ...source,
    ward_scope: 'selected_ward',
    filters: { ...filters, antibiotic_code: 'CIP' },
  },
  windows: {
    rolling_12_months: {
      ...authored.windows.rolling_12m,
      period: 'rolling_12_months',
      start_date: '2025-09-28',
      end_date: '2026-09-27',
      metadata,
      coverage,
    },
    rolling_28_days: {
      ...authored.windows.last_28d,
      period: 'rolling_28_days',
      start_date: '2026-08-31',
      end_date: '2026-09-27',
      metadata,
      coverage,
    },
  },
});

describe('Published backend adapter', () => {
  it('preserves supplied values and IDs without inventing annual evidence', () => {
    const data = mapEvidence(backendEvidenceSchema.parse(wireEvidence()), query);
    expect(data.analysis_id).toBe('saved-evidence');
    expect(data.windows.last_28d.susceptibility_pct).toBe(
      authored.windows.last_28d.susceptibility_pct,
    );
    expect(data.windows.annual).toBeUndefined();
    expect(data.context.date_bounds.last_28d).toEqual({
      start_inclusive: '2026-08-31',
      end_exclusive: '2026-09-28',
    });
    expect(() =>
      assertContext(data.context, { ...initialState, method_version: 'evidence-v1' }, query),
    ).not.toThrow();
    expect(data.context.filters).not.toHaveProperty('known_at');
  });
  it('rejects suppressed percentages and incomplete atomic windows', () => {
    const wire = wireEvidence();
    wire.windows.rolling_28_days.status = 'insufficient_data';
    expect(backendEvidenceSchema.safeParse(wire).success).toBe(false);
    expect(backendEvidenceSchema.safeParse({ ...wireEvidence(), windows: {} }).success).toBe(false);
  });
  it('maps paired period/status names while retaining the comparison method', () => {
    const cells = makeComparison(new URLSearchParams(), initialState, 'saved-pair').comparison;
    const wire = {
      analysis_id: 'saved-pair',
      context: {
        ...source,
        method_version: 'comparison-v1',
        filters: {
          ...filters,
          antibiotic_a: 'CIP',
          antibiotic_b: 'TMP',
          window: 'rolling_28_days',
        },
      },
      comparison: {
        ...cells,
        coverage,
        window: 'rolling_28_days',
        start_date: '2026-08-31',
        end_date: '2026-09-27',
      },
    };
    const data = mapComparison(backendComparisonSchema.parse(wire), query);
    expect(data.comparison.window).toBe('last_28d');
    expect(data.comparison.cells).toEqual(cells.cells);
    expect(data.context.method_version).toBe('comparison-v1');
    expect(data.context.coverage.last_28d.source_covers_requested_window).toBe(true);
    expect(data.context.coverage.last_28d.replay_complete_through_as_of).toBe(true);
    wire.comparison.coverage = {
      source_date_span_covers_window: false,
      source_fully_imported: false,
    };
    expect(
      mapComparison(backendComparisonSchema.parse(wire), query).context.coverage.last_28d,
    ).toMatchObject({
      source_covers_requested_window: false,
      replay_complete_through_as_of: false,
    });
    expect(
      backendComparisonSchema.safeParse({
        ...wire,
        comparison: { ...wire.comparison, coverage: undefined },
      }).success,
    ).toBe(false);
  });
  it('accepts receiving feed runs and preserves feed provenance separately from seed coverage', () => {
    const raw = backendStateSchema.parse({
      ...source,
      mode: 'feed',
      clock_mode: 'wall_utc',
      status: 'receiving',
      feed_source_id: 'lab-adapter',
      feed_source_label: 'Lab feed',
      feed_data_digest: 'feed-digest',
      seed_through: '2026-09-26',
      replay_through: '2026-09-27',
      latest_visible_sample_date: '2026-09-27',
      published_cultures: 50,
      published_isolates: 50,
    });
    expect(mapState(raw)).toMatchObject({
      status: 'receiving',
      mode: 'feed',
      clock_mode: 'wall_utc',
      feed_source_id: 'lab-adapter',
    });
    const report = structuredClone(wireEvidence());
    Object.assign(report.context, raw);
    Object.assign(report.windows.rolling_28_days.coverage, {
      includes_feed_data: true,
      coverage_scope: 'imported_dataset_only',
    });
    const mapped = mapEvidence(backendEvidenceSchema.parse(report), query);
    expect(mapped.context).toMatchObject({ mode: 'feed', feed_data_digest: 'feed-digest' });
    expect(mapped.context.coverage.last_28d).toMatchObject({
      includes_feed_data: true,
      coverage_scope: 'imported_dataset_only',
    });
  });
  it('retains completed replay counters and the actual seed/end dates', () => {
    const state = mapState(
      backendStateSchema.parse({
        ...source,
        status: 'completed',
        seed_through: '2026-08-30',
        replay_through: '2026-09-27',
        latest_visible_sample_date: null,
        published_cultures: 46792,
        published_isolates: 24571,
      }),
    );
    expect(state.published_bundles).toBe(46792);
    expect(state.published_isolates).toBe(24571);
    expect(state.replay_bounds).toEqual({ start: '2026-08-30', end: '2026-09-27' });
  });
  it('retains history cursors, zero-isolate cultures, raw AST and phenotype labels', () => {
    const raw = {
      analysis_id: 'saved-page',
      context: {
        ...source,
        method_version: 'history-v1',
        filters: { patient_id: '0001', as_of: '2026-09-27', limit: 25 },
        start_date: '2025-09-27',
        end_date_exclusive: '2026-09-27',
      },
      has_more: true,
      next_cursor: 'next-page',
      cultures: [
        {
          record: {
            culture_id: 'negative',
            sample_date: '2026-08-02',
            specimen: 'blood',
            ward_en: 'Urology',
            result: 'negative',
          },
          isolates: [],
        },
        {
          record: {
            culture_id: 'positive',
            sample_date: '2026-07-02',
            specimen: 'urine',
            ward_en: 'Urology',
            result: 'positive',
          },
          isolates: [
            {
              event: {
                isolate_id: 'i1',
                organism: 'Escherichia coli',
                tests: [{ antibiotic_code: 'CIP', result: 'R' }],
              },
              enrichment: { esbl: 1, mrsa: 0, vre: 0, cpe: 0 },
            },
          ],
        },
      ],
    };
    const mapped = mapHistory(backendHistorySchema.parse(raw));
    expect(mapped.next_cursor).toBe('next-page');
    expect(mapped.has_more).toBe(true);
    expect(mapped.cultures[0].result).toBe('No growth');
    expect(mapped.cultures[1].isolates[0].tests[0].result).toBe('R');
    expect(mapped.cultures[1].isolates[0].phenotypes).toEqual(['ESBL phenotype']);
  });
});

describe('Trend cutoffs', () => {
  it('defaults the chart to the reporting year when a live clock crosses into a new year', () => {
    const future = { ...initialState, demo_date: '2027-01-02' };
    expect(readCohort(new URLSearchParams(), meta, future).query.calendar_year).toBe(2027);
  });
  it('includes past month ends and only the current partial cutoff, never future dates', () => {
    expect(trendDates(2024, '2024-03-15', '2023-10-02')).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-15',
    ]);
    expect(trendDates(2023, '2026-09-27', '2023-10-02')).toEqual([
      '2023-10-31',
      '2023-11-30',
      '2023-12-31',
    ]);
  });
});
