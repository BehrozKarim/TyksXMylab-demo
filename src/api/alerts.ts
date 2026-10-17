import { z } from 'zod';
import { feedProvenanceSchema } from './provenance';
import type { Meta } from './contracts';

const date = z.iso.date();
const count = z.number().int().nonnegative();
const pct = z.number().min(0).max(100).nullable();
export const monitorSchema = z.object({
  organism: z.string(),
  specimen: z.enum(['urine', 'blood', 'wound']),
  ward_code: z.string().nullable(),
  antibiotic_code: z.string(),
  sex: z.enum(['F', 'M']).nullable(),
  age_min: count.nullable(),
  age_max: count.nullable(),
  dedup_scope: z.enum(['selected_cohort', 'all_wards']),
});
const status = z.enum(['new', 'ongoing', 'cleared', 'insufficient_evidence']);
const measurements = z.object({
  raw_isolates_before_dedup_and_demographics: count,
  sex_counts: z.record(z.string(), count),
  age_bin_counts: z.record(z.string(), count),
  collection_setting_counts: z.record(z.string(), count),
  organism_mix_counts: z.record(z.string(), count),
  hospital_day_3_or_later: count,
  hospital_day_1_or_2: count,
  timing_unknown: count,
  timing_not_applicable: count,
});
export const alertWindowSchema = z
  .object({
    start_date: date,
    end_date_exclusive: date,
    n_eligible: count,
    n_tested: count,
    n_s: count,
    n_r: count,
    n_not_tested: count,
    resistance_pct: pct,
    measurements,
    coverage: z
      .object({ source_date_span_covers_window: z.boolean(), source_fully_imported: z.boolean() })
      .passthrough(),
  })
  .superRefine((w, c) => {
    if (w.n_s + w.n_r !== w.n_tested || w.n_tested + w.n_not_tested !== w.n_eligible)
      c.addIssue({ code: 'custom', message: 'Inconsistent alert counts' });
    if (
      (w.n_tested < 30 && w.resistance_pct !== null) ||
      (w.n_tested >= 30 && w.resistance_pct === null)
    )
      c.addIssue({ code: 'custom', message: 'Invalid alert suppression' });
  });
export const alertAnalysisSchema = z.object({
  analysis_id: z.string(),
  context: z.object({
    ...feedProvenanceSchema.shape,
    run_id: z.string(),
    state_revision: count,
    demo_date: date,
    method_version: z.literal('alert-v1'),
    source_manifest_id: z.string(),
    monitoring_as_of: date,
    monitor_id: z.string(),
    monitor: monitorSchema,
    rule_version: z.string(),
    minimum_tested: z.literal(30),
    threshold_pp: z.number(),
    confirmation: z.literal('proposed_pending_partner_confirmation'),
    caveats: z.array(z.string()),
  }),
  evaluation: z
    .object({
      status: z.enum(['triggered', 'below_threshold', 'insufficient_evidence', 'unavailable']),
      reason: z.string().nullable(),
      baseline: alertWindowSchema.nullable(),
      recent: alertWindowSchema.nullable(),
      resistance_change_pp: z.number().nullable(),
      shared_patients_between_windows: count,
    })
    .superRefine((e, c) => {
      if (e.status !== 'unavailable' && (!e.baseline || !e.recent))
        c.addIssue({ code: 'custom', message: 'Missing alert periods' });
      if (
        (e.status === 'insufficient_evidence' || e.status === 'unavailable') &&
        e.resistance_change_pp !== null
      )
        c.addIssue({ code: 'custom', message: 'Suppressed alert change must be null' });
      if (e.baseline && e.recent && e.baseline.end_date_exclusive !== e.recent.start_date)
        c.addIssue({
          code: 'custom',
          message: 'Alert baseline must end at the recent period start',
        });
    }),
});
export const alertRecordSchema = z.object({
  alert_id: z.string(),
  investigation_id: z.string(),
  run_id: z.string(),
  monitor_id: z.string(),
  antibiotic_code: z.string(),
  rule_version: z.string(),
  status,
  last_sufficient_state: z.enum(['new', 'ongoing', 'cleared']),
  first_trigger_revision: count,
  last_trigger_revision: count,
  first_trigger_date: date,
  last_trigger_date: date,
  original_analysis_id: z.string(),
  current_analysis_id: z.string(),
});
export const alertListSchema = z.object({
  run_id: z.string(),
  state_revision: count,
  monitoring_revision: count,
  monitoring_as_of: date,
  configuration: z.object({
    minimum_tested: z.literal(30),
    threshold_pp: z.number(),
    monitors: z.array(monitorSchema),
  }),
  alerts: z.array(alertRecordSchema),
  monitors: z.array(alertAnalysisSchema),
});
export const resistanceInvestigationSchema = z
  .object({
    alert: alertRecordSchema,
    original_detection: alertAnalysisSchema,
    current_analysis: alertAnalysisSchema.nullable(),
    current_analysis_status: z.enum(['available', 'archived_run']),
    transitions: z.array(
      z.object({
        state_revision: count,
        monitoring_as_of: date,
        previous_status: status.nullable(),
        status,
        analysis_id: z.string(),
      }),
    ),
  })
  .superRefine((v, c) => {
    if (
      v.original_detection.analysis_id !== v.alert.original_analysis_id ||
      v.original_detection.context.run_id !== v.alert.run_id ||
      v.original_detection.context.monitor_id !== v.alert.monitor_id
    )
      c.addIssue({
        code: 'custom',
        message: 'Original detection identity does not match the alert',
      });
    if ((v.current_analysis_status === 'available') !== !!v.current_analysis)
      c.addIssue({ code: 'custom', message: 'Invalid current investigation state' });
  });
export type AlertAnalysis = z.infer<typeof alertAnalysisSchema>;
export type AlertMonitor = z.infer<typeof monitorSchema>;
export type AlertInvestigation = z.infer<typeof resistanceInvestigationSchema>;
export const alertStatusLabels: Record<z.infer<typeof status>, string> = {
  new: 'New',
  ongoing: 'Ongoing',
  cleared: 'Cleared',
  insufficient_evidence: 'Insufficient evidence',
};
export function monitorLabel(m: AlertMonitor, meta: Meta) {
  const ward = meta.wards.find((w) => w.code === m.ward_code)?.label ?? 'All wards';
  const population = `${m.sex === 'F' ? 'Women' : m.sex === 'M' ? 'Men' : 'All sexes'} · ${m.age_min !== null || m.age_max !== null ? `ages ${m.age_min ?? 0}–${m.age_max ?? 'any'}` : 'all ages'}`;
  return `${ward} / ${m.specimen} / ${m.organism} / ${population}`;
}
