import { z } from 'zod';
import { optionalFeedProvenanceSchema } from './provenance.js';

export const windowKeys = ['annual', 'rolling_12m', 'last_28d'] as const;
export type WindowKey = (typeof windowKeys)[number];
export const windowStatus = z.enum([
  'available',
  'insufficient_data',
  'no_tests',
  'empty_cohort',
  'not_applicable',
]);
export type WindowStatus = z.infer<typeof windowStatus>;
const count = z.number().int().nonnegative();
const pct = z.number().min(0).max(100).nullable();
const interval = z.object({ lower: pct, upper: pct });
export const measureSchema = z
  .object({
    status: windowStatus,
    n_eligible: count,
    n_tested: count,
    n_s: count,
    n_r: count,
    n_not_tested: count,
    susceptibility_pct: pct,
    resistance_pct: pct,
    ci95: z.object({ susceptibility: interval, resistance: interval }),
    reason: z.string().optional(),
  })
  .superRefine((m, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (m.n_s + m.n_r !== m.n_tested || m.n_tested + m.n_not_tested !== m.n_eligible)
      fail('Inconsistent isolate counts');
    const values = [
      m.susceptibility_pct,
      m.resistance_pct,
      ...Object.values(m.ci95.susceptibility),
      ...Object.values(m.ci95.resistance),
    ];
    if (m.status === 'available') {
      if (m.n_tested < 30 || values.some((v) => v === null))
        fail('Available evidence needs at least 30 tests and complete intervals');
      for (const ci of Object.values(m.ci95))
        if (ci.lower !== null && ci.upper !== null && ci.lower > ci.upper)
          fail('Reversed interval');
    } else if (values.some((v) => v !== null))
      fail('Suppressed evidence must not contain percentages or intervals');
  });
export type WindowMeasure = z.infer<typeof measureSchema>;
const date = z.iso.date();
export const filtersSchema = z.object({
  ward_code: z.string().nullable(),
  specimen: z.enum(['urine', 'blood', 'wound']),
  organism: z.string(),
  sex: z.enum(['F', 'M']).nullable(),
  age_min: count.nullable(),
  age_max: count.nullable(),
  calendar_year: z.number().int(),
  dedup_scope: z.enum(['selected_cohort', 'all_wards']).optional(),
});
export type Filters = z.infer<typeof filtersSchema>;
const bounds = z.object({ start_inclusive: date, end_exclusive: date });
const coverage = z.object({
  coverage_scope: z.literal('imported_dataset_only').optional(),
  includes_feed_data: z.boolean().optional(),
  is_year_to_date: z.boolean().optional(),
  source_covers_requested_window: z.boolean(),
  replay_complete_through_as_of: z.boolean(),
});
export const contextSchema = z.object({
  ...optionalFeedProvenanceSchema.shape,
  run_id: z.string(),
  state_revision: count,
  method_version: z.string(),
  as_of: date,
  source_manifest_id: z.string(),
  filters: filtersSchema,
  scope_labels: z.object({
    ward_scope: z.enum(['all_wards', 'selected_ward']),
    source_kind: z.string(),
  }),
  date_bounds: z.object({ annual: bounds, rolling_12m: bounds, last_28d: bounds }),
  coverage: z.object({ annual: coverage, rolling_12m: coverage, last_28d: coverage }),
});
export type AnalysisContext = z.infer<typeof contextSchema>;
export const evidenceSchema = z.object({
  analysis_id: z.string(),
  context: contextSchema,
  antibiotic_code: z.string(),
  windows: z.object({
    annual: measureSchema.optional(),
    rolling_12m: measureSchema,
    last_28d: measureSchema,
  }),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const comparisonSchema = z.object({
  analysis_id: z.string(),
  context: contextSchema,
  comparison: z
    .object({
      status: windowStatus,
      antibiotic_a: z.string(),
      antibiotic_b: z.string(),
      window: z.enum(windowKeys),
      n_eligible: count,
      n_paired: count,
      n_missing_a: count,
      n_missing_b: count,
      n_missing_either: count,
      cells: z.object({ both_s: count, a_only_s: count, b_only_s: count, both_r: count }),
      a_susceptibility_pct: pct,
      b_susceptibility_pct: pct,
      net_difference_pp: z.number().min(-100).max(100).nullable(),
      b_only_added_pct: pct,
      at_least_one_s_pct: pct,
    })
    .superRefine((c, ctx) => {
      const values = [
        c.a_susceptibility_pct,
        c.b_susceptibility_pct,
        c.net_difference_pp,
        c.b_only_added_pct,
        c.at_least_one_s_pct,
      ];
      if (
        Object.values(c.cells).reduce((a, b) => a + b, 0) !== c.n_paired ||
        c.n_eligible !== c.n_paired + c.n_missing_either
      )
        ctx.addIssue({ code: 'custom', message: 'Inconsistent paired denominator' });
      if (
        c.status === 'available'
          ? c.n_paired < 30 || values.some((v) => v === null)
          : values.some((v) => v !== null)
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid paired suppression' });
    }),
});
export type Comparison = z.infer<typeof comparisonSchema>;
export const stateSchema = z.object({
  ...optionalFeedProvenanceSchema.shape,
  run_id: z.string(),
  state_revision: count,
  method_version: z.string(),
  status: z.enum(['ready', 'running', 'paused', 'completed', 'error', 'receiving']),
  demo_date: date,
  latest_visible_sample_date: date,
  source_kind: z.string(),
  replay_bounds: z.object({ start: date, end: date }),
  published_bundles: count,
  published_isolates: count.optional(),
});
export type ReplayState = z.infer<typeof stateSchema>;
export const metaSchema = z.object({
  wards: z.array(z.object({ code: z.string(), label: z.string() })),
  specimens: z.array(z.enum(['urine', 'blood', 'wound'])),
  organisms: z.array(z.string()),
  antibiotics: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      screening: z.boolean(),
      specimens: z.array(z.string()),
      organisms: z.array(z.string()),
    }),
  ),
  sexes: z.array(z.object({ code: z.enum(['F', 'M']), label: z.string() })),
  source: z.object({ start: date, end: date, label: z.string() }),
  method_version: z.string(),
  interval_method: z.string(),
  minimum_tested: count,
  supported_windows: z.array(z.enum(windowKeys)).optional(),
  capabilities: z.object({ alerts: z.boolean(), calendar_year: z.boolean() }).optional(),
});
export type Meta = z.infer<typeof metaSchema>;
export const alertSchema = z.object({
  id: z.string(),
  organism: z.string(),
  specimen: z.string(),
  antibiotic_code: z.string(),
  cohort_label: z.string(),
  status: z.enum(['new', 'ongoing', 'cleared', 'insufficient_evidence']),
  change_pp: z.number().nullable(),
  n_recent: count,
  n_baseline: count,
  detected_on: date,
});
export const alertsSchema = z.object({
  run_id: z.string(),
  state_revision: count,
  monitoring_as_of: date,
  alerts: z.array(alertSchema),
});
export type ReviewFlag = z.infer<typeof alertSchema>;
export const investigationSchema = z.object({
  analysis_id: z.string(),
  context: contextSchema,
  alert: alertSchema,
  baseline_bounds: bounds,
  recent: measureSchema,
  baseline: measureSchema,
  rule: z.object({ version: z.string(), threshold_pp: z.number(), minimum_tested: count }),
  composition: z.array(z.object({ label: z.string(), recent_count: count, baseline_count: count })),
  chronology: z.array(z.object({ date, title: z.string(), detail: z.string() })),
  notes: z.array(z.string()),
});
export type Investigation = z.infer<typeof investigationSchema>;
// Serving state guards the request; the nested detection analysis keeps its
// original run/revision, identity and evidence throughout later replay ticks.
export const investigationResponseSchema = z.object({
  serving_context: stateSchema.pick({
    run_id: true,
    state_revision: true,
    method_version: true,
    demo_date: true,
  }),
  analysis: investigationSchema,
});
export type InvestigationResponse = z.infer<typeof investigationResponseSchema>;
export const patientsSchema = z.object({
  patients: z.array(z.object({ patient_id: z.string(), label: z.string() })),
});
export const historySchema = z.object({
  analysis_id: z.string(),
  context: contextSchema,
  patient_id: z.string(),
  lookback_start: date,
  cutoff: date,
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
  cultures: z.array(
    z.object({
      culture_id: z.string(),
      sample_date: date,
      specimen: z.string(),
      ward: z.string(),
      result: z.string(),
      isolates: z.array(
        z.object({
          isolate_id: z.string(),
          organism: z.string(),
          phenotypes: z.array(z.string()),
          tests: z.array(
            z.object({
              antibiotic_code: z.string(),
              label: z.string(),
              result: z.enum(['S', 'R']),
              screening: z.boolean(),
            }),
          ),
        }),
      ),
    }),
  ),
});
export type History = z.infer<typeof historySchema>;
export type Analysis = Evidence | Comparison | Investigation | History;
export type CohortQuery = Filters & {
  as_of: string;
  antibiotic_code: string;
  antibiotic_b: string;
  window: WindowKey;
};
