/** Validates the published Python API, then maps its names to UI view models.
 * No susceptibility, interval or paired statistic is calculated here.
 * Exports always use the original saved backend analysis ID.
 */
import { z } from 'zod';
import { feedProvenanceSchema } from './provenance';
import { measureSchema, comparisonSchema } from './contracts';
import type {
  AnalysisContext,
  CohortQuery,
  Evidence,
  History,
  Meta,
  ReplayState,
} from './contracts';

const date = z.iso.date();
const count = z.number().int().nonnegative();
const sourceCoverage = z
  .object({
    coverage_scope: z.literal('imported_dataset_only').default('imported_dataset_only'),
    includes_feed_data: z.boolean().default(false),
    source_date_span_covers_window: z.boolean(),
    source_fully_imported: z.boolean(),
  })
  .passthrough();
const windowSchema = measureSchema.safeExtend({
  period: z.enum(['rolling_28_days', 'rolling_12_months']),
  start_date: date,
  end_date: date,
  coverage: sourceCoverage,
  metadata: z.object({
    retained_before_demographic_filters: count,
    unknown_sex: count,
    unknown_age: count,
    excluded_unknown: count,
    excluded_nonmatching: count,
  }),
});
const filters = z
  .object({
    as_of: date,
    ward_code: z.string().nullable(),
    organism: z.string(),
    specimen: z.enum(['urine', 'blood', 'wound']),
    sex: z.enum(['F', 'M']).nullable(),
    age_min: count.nullable(),
    age_max: count.nullable(),
    dedup_scope: z.enum(['selected_cohort', 'all_wards']),
  })
  .passthrough();
const sourceContext = z
  .object({
    ...feedProvenanceSchema.shape,
    run_id: z.string(),
    state_revision: count,
    method_version: z.string(),
    demo_date: date,
    source_manifest_id: z.string(),
    source_kind: z.string(),
  })
  .passthrough();
const context = sourceContext.extend({ filters });
export const backendEvidenceSchema = z.object({
  analysis_id: z.string(),
  context: context.extend({
    method_version: z.literal('evidence-v1'),
    ward_scope: z.enum(['all_wards', 'selected_ward']),
    filters: filters.extend({ antibiotic_code: z.string() }),
  }),
  windows: z.object({ rolling_12_months: windowSchema, rolling_28_days: windowSchema }),
});
export const backendStateSchema = z.object({
  ...feedProvenanceSchema.shape,
  run_id: z.string(),
  state_revision: count,
  status: z.enum(['paused', 'running', 'completed', 'error', 'receiving']),
  demo_date: date,
  seed_through: date,
  replay_through: date,
  latest_visible_sample_date: date.nullable(),
  source_kind: z.string(),
  published_cultures: count,
  published_isolates: count,
});
export function mapState(value: z.infer<typeof backendStateSchema>): ReplayState {
  return {
    ...value,
    method_version: 'evidence-v1',
    latest_visible_sample_date: value.latest_visible_sample_date ?? value.demo_date,
    replay_bounds: { start: value.seed_through, end: value.replay_through },
    published_bundles: value.published_cultures,
  };
}
export const backendMetaSchema = z.object({
  method_version: z.literal('evidence-v1'),
  minimum_tested: count,
  periods: z.array(z.enum(['rolling_28_days', 'rolling_12_months'])),
  source: z.object({ start_date: date, end_date: date, kind: z.string() }),
  wards: z.array(z.object({ ward_code: z.string(), ward_en: z.string() })),
  antibiotics: z.array(
    z.object({
      antibiotic_code: z.string(),
      antibiotic: z.string(),
      is_screening: z.boolean(),
      reported_for: z.enum(['all', 'urine', 'blood', 'wound']),
    }),
  ),
  organisms: z.array(z.string()),
  specimens: z.array(z.enum(['urine', 'blood', 'wound'])),
  sex: z.array(z.enum(['F', 'M'])),
  analysis_methods: z.object({ alert: z.string().optional() }).optional(),
  observed_panels: z.array(
    z.object({ organism: z.string(), specimen: z.string(), antibiotic_codes: z.array(z.string()) }),
  ),
});
export function mapMeta(value: z.infer<typeof backendMetaSchema>): Meta {
  return {
    wards: value.wards.map((w) => ({ code: w.ward_code, label: w.ward_en })),
    antibiotics: value.antibiotics.map((a) => ({
      code: a.antibiotic_code,
      label: a.antibiotic.charAt(0).toUpperCase() + a.antibiotic.slice(1),
      screening: a.is_screening,
      specimens: a.reported_for === 'all' ? value.specimens : [a.reported_for],
      organisms: [
        ...new Set(
          value.observed_panels
            .filter((p) => p.antibiotic_codes.includes(a.antibiotic_code))
            .map((p) => p.organism),
        ),
      ],
    })),
    organisms: value.organisms,
    specimens: value.specimens,
    sexes: value.sex.map((code) => ({ code, label: code === 'F' ? 'Women' : 'Men' })),
    source: {
      start: value.source.start_date,
      end: value.source.end_date,
      label: 'Imported synthetic dataset',
    },
    method_version: value.method_version,
    minimum_tested: value.minimum_tested,
    interval_method: '95% Wilson score',
    supported_windows: ['rolling_12m', 'last_28d'],
    capabilities: { alerts: value.analysis_methods?.alert === 'alert-v1', calendar_year: false },
  };
}
export function nextDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function bounds(w: { start_date: string; end_date: string }) {
  return { start_inclusive: w.start_date, end_exclusive: nextDate(w.end_date) };
}
function mapCoverage(value?: z.infer<typeof sourceCoverage>) {
  return {
    coverage_scope: value?.coverage_scope,
    includes_feed_data: value?.includes_feed_data,
    source_covers_requested_window: value?.source_date_span_covers_window ?? false,
    replay_complete_through_as_of: value?.source_fully_imported ?? false,
  };
}
function uiContext(
  c: z.infer<typeof context>,
  query: CohortQuery,
  periods?: z.infer<typeof backendEvidenceSchema>['windows'],
): AnalysisContext {
  const period = periods?.rolling_28_days;
  const rolling = periods?.rolling_12_months;
  // Calendar bounds are a UI label only; no annual result is invented.
  const blank = {
    start_inclusive: `${query.calendar_year}-01-01`,
    end_exclusive: `${query.calendar_year + 1}-01-01`,
  };
  const coverage = (w?: z.infer<typeof windowSchema>) => mapCoverage(w?.coverage);
  return {
    mode: c.mode,
    clock_mode: c.clock_mode,
    feed_source_id: c.feed_source_id,
    feed_source_label: c.feed_source_label,
    feed_data_digest: c.feed_data_digest,
    run_id: c.run_id,
    state_revision: c.state_revision,
    method_version: c.method_version,
    as_of: c.filters.as_of,
    source_manifest_id: c.source_manifest_id,
    filters: {
      ward_code: c.filters.ward_code,
      specimen: c.filters.specimen,
      organism: c.filters.organism,
      sex: c.filters.sex,
      age_min: c.filters.age_min,
      age_max: c.filters.age_max,
      dedup_scope: c.filters.dedup_scope,
      calendar_year: query.calendar_year,
    },
    scope_labels: {
      ward_scope: c.filters.ward_code ? 'selected_ward' : 'all_wards',
      source_kind: c.source_kind,
    },
    date_bounds: {
      annual: blank,
      last_28d: period ? bounds(period) : blank,
      rolling_12m: rolling ? bounds(rolling) : blank,
    },
    coverage: { annual: coverage(), last_28d: coverage(period), rolling_12m: coverage(rolling) },
  };
}
export function mapEvidence(
  value: z.infer<typeof backendEvidenceSchema>,
  query: CohortQuery,
): Evidence {
  return {
    analysis_id: value.analysis_id,
    context: uiContext(value.context, query, value.windows),
    antibiotic_code: String(value.context.filters.antibiotic_code),
    windows: {
      rolling_12m: value.windows.rolling_12_months,
      last_28d: value.windows.rolling_28_days,
    },
  };
}
const paired = z
  .object({
    ...comparisonSchema.shape.comparison.shape,
    status: z.enum([
      'available',
      'insufficient_data',
      'no_tests',
      'empty_cohort',
      'not_applicable',
      'no_paired_tests',
    ]),
    window: z.enum(['rolling_12_months', 'rolling_28_days']),
    start_date: date,
    end_date: date,
    coverage: sourceCoverage,
  })
  .transform((p) => ({
    ...p,
    status: p.status === 'no_paired_tests' ? ('no_tests' as const) : p.status,
    window: p.window === 'rolling_12_months' ? ('rolling_12m' as const) : ('last_28d' as const),
  }))
  .pipe(
    comparisonSchema.shape.comparison.safeExtend({
      window: z.enum(['rolling_12m', 'last_28d']),
      start_date: date,
      end_date: date,
      coverage: sourceCoverage.extend({
        coverage_scope: sourceCoverage.shape.coverage_scope.removeDefault(),
        includes_feed_data: sourceCoverage.shape.includes_feed_data.removeDefault(),
      }),
    }),
  );
export const backendComparisonSchema = z.object({
  analysis_id: z.string(),
  context: context.extend({
    method_version: z.literal('comparison-v1'),
    filters: filters.extend({
      antibiotic_a: z.string(),
      antibiotic_b: z.string(),
      window: z.enum(['rolling_12_months', 'rolling_28_days']),
    }),
  }),
  comparison: paired,
});
export function mapComparison(value: z.infer<typeof backendComparisonSchema>, query: CohortQuery) {
  const c = uiContext(value.context, query);
  c.date_bounds[value.comparison.window] = bounds(value.comparison);
  c.coverage[value.comparison.window] = mapCoverage(value.comparison.coverage);
  return { analysis_id: value.analysis_id, context: c, comparison: value.comparison };
}
export const backendPatientsSchema = z.object({
  run_id: z.string(),
  state_revision: count,
  as_of: date,
  has_more: z.boolean(),
  patients: z.array(
    z.object({ patient_id: z.string(), latest_sample_date: date, visible_cultures: count }),
  ),
});
export const backendHistorySchema = z.object({
  analysis_id: z.string(),
  context: sourceContext.extend({
    method_version: z.literal('history-v1'),
    filters: z.object({ patient_id: z.string(), as_of: date, limit: count }),
    start_date: date,
    end_date_exclusive: date,
  }),
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
  cultures: z.array(
    z.object({
      record: z.object({
        culture_id: z.string(),
        sample_date: date,
        specimen: z.string(),
        ward_en: z.string(),
        result: z.string(),
      }),
      isolates: z.array(
        z.object({
          event: z.object({
            isolate_id: z.string(),
            organism: z.string(),
            tests: z.array(z.object({ antibiotic_code: z.string(), result: z.enum(['S', 'R']) })),
          }),
          enrichment: z.object({ esbl: count, mrsa: count, vre: count, cpe: count }).nullable(),
        }),
      ),
    }),
  ),
});
export function mapHistory(value: z.infer<typeof backendHistorySchema>): History {
  const c = value.context;
  const q: CohortQuery = {
    ward_code: null,
    specimen: 'urine',
    organism: 'All organisms',
    sex: null,
    age_min: null,
    age_max: null,
    calendar_year: Number(c.filters.as_of.slice(0, 4)),
    as_of: c.filters.as_of,
    antibiotic_code: '',
    antibiotic_b: '',
    window: 'last_28d',
  };
  const u = uiContext({ ...c, filters: { ...q, dedup_scope: 'selected_cohort' } }, q);
  return {
    analysis_id: value.analysis_id,
    context: u,
    patient_id: c.filters.patient_id,
    cutoff: c.end_date_exclusive,
    lookback_start: c.start_date,
    has_more: value.has_more,
    next_cursor: value.next_cursor,
    cultures: value.cultures.map((item) => ({
      ...item.record,
      ward: item.record.ward_en,
      result:
        item.record.result === 'negative'
          ? 'No growth'
          : item.record.result === 'mixed_growth'
            ? 'Mixed growth'
            : 'Positive culture',
      isolates: item.isolates.map((i) => ({
        ...i.event,
        phenotypes: i.enrichment
          ? (['esbl', 'mrsa', 'vre', 'cpe'] as const)
              .filter((k) => i.enrichment![k] === 1)
              .map((k) => `${k.toUpperCase()} phenotype`)
          : [],
        tests: i.event.tests.map((t) => ({ ...t, label: t.antibiotic_code, screening: false })),
      })),
    })),
  };
}
