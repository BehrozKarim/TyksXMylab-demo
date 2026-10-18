import { z } from 'zod';
import { evidenceSchema, type Evidence } from '../api/contracts.js';
import { summarySchema, type ReportSummary } from '../api/summaries.js';

export const SUMMARY_VERSION = 'standalone-summary-v2';
const safeLabel = /^[\p{L}\p{N} .()/+_-]+$/u;
export const summaryRequestSchema = z
  .object({ report: evidenceSchema.strict(), language: z.literal('en').default('en') })
  .strict()
  .superRefine(({ report: r }, ctx) => {
    const fail = () => ctx.addIssue({ code: 'custom', message: 'Invalid aggregate report' });
    if (
      [
        r.analysis_id,
        r.context.run_id,
        r.context.source_manifest_id,
        r.context.method_version,
      ].some((s) => !s.length || s.length > 100 || [...s].some((ch) => ch.charCodeAt(0) < 32))
    )
      fail();
    if (r.context.method_version !== 'evidence-v1' || r.context.state_revision < 1) fail();
    const f = r.context.filters;
    if (
      [f.organism, f.ward_code ?? '', r.antibiotic_code].some(
        (s) => s.length > 120 || (s !== '' && !safeLabel.test(s)),
      )
    )
      fail();
    if (
      !f.organism ||
      !r.antibiotic_code ||
      [f.age_min, f.age_max].some((n) => n !== null && n > 120) ||
      (f.age_min !== null && f.age_max !== null && f.age_min > f.age_max)
    )
      fail();
    for (const key of ['rolling_12m', 'last_28d'] as const) {
      const w = r.windows[key],
        b = r.context.date_bounds[key];
      if (
        w.n_eligible > 100000 ||
        b.start_inclusive >= b.end_exclusive ||
        new Date(`${b.end_exclusive}T12:00:00Z`).getTime() -
          new Date(`${r.context.as_of}T12:00:00Z`).getTime() !==
          86400000
      )
        fail();
      const expected = !w.n_eligible
        ? 'empty_cohort'
        : !w.n_tested
          ? 'no_tests'
          : w.n_tested < 30
            ? 'insufficient_data'
            : 'available';
      if (w.status !== 'not_applicable' && w.status !== expected) fail();
      if (
        w.status === 'available' &&
        (Math.abs(w.susceptibility_pct! - (100 * w.n_s) / w.n_tested) > 1e-7 ||
          Math.abs(w.resistance_pct! - (100 * w.n_r) / w.n_tested) > 1e-7 ||
          w.ci95.susceptibility.lower! > w.susceptibility_pct! ||
          w.ci95.susceptibility.upper! < w.susceptibility_pct! ||
          w.ci95.resistance.lower! > w.resistance_pct! ||
          w.ci95.resistance.upper! < w.resistance_pct!)
      )
        fail();
    }
  });

export type SummaryFact = {
  fact_id: string;
  variants: [string, string];
  paths: string[];
  section: 'paragraph' | 'support' | 'limitation';
};
export type SentenceChoice = { fact_id: string; variant: number };
export type FallbackReason = NonNullable<ReportSummary['fallback_reason']>;

/** The model receives approved sentences, never patient records or raw suppressed S/R counts. */
export function buildSummaryFacts(report: Evidence): SummaryFact[] {
  const facts: SummaryFact[] = [];
  const add = (
    id: string,
    text: string,
    alternative: string,
    paths: string[],
    section: SummaryFact['section'] = 'paragraph',
  ) => facts.push({ fact_id: id, variants: [text, alternative], paths, section });
  const c = report.context,
    f = c.filters;
  const ages =
    f.age_min !== null && f.age_max !== null
      ? `ages ${f.age_min}–${f.age_max}`
      : f.age_min !== null
        ? `ages ${f.age_min} and above`
        : f.age_max !== null
          ? `ages up to ${f.age_max}`
          : 'all ages';
  const subject = `${f.organism} in ${f.specimen} from ${f.ward_code ? `ward ${f.ward_code}` : 'all wards'} (${f.sex === 'F' ? 'women' : f.sex === 'M' ? 'men' : 'all sexes'}, ${ages}), ${report.antibiotic_code}`;
  add(
    'scope',
    `This report covers ${subject}, through ${c.as_of}.`,
    `Through ${c.as_of}, the selected report covers ${subject}.`,
    ['context.filters', 'context.as_of', 'antibiotic_code'],
  );
  for (const key of ['rolling_12m', 'last_28d'] as const) {
    const w = report.windows[key],
      title = key === 'last_28d' ? 'Last 28 days' : 'Last 12 months';
    const b = c.date_bounds[key];
    const end = new Date(new Date(`${b.end_exclusive}T12:00:00Z`).getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const period = `${title} (${b.start_inclusive} to ${end}, inclusive)`;
    if (w.status === 'available') {
      const metric =
        report.antibiotic_code === 'FOX' ? 'screening-marker S results' : 'susceptibility';
      add(
        key,
        `${period}: ${metric} was ${w.susceptibility_pct!.toFixed(1)}% among ${w.n_tested} tested isolates.`,
        `${period}: ${w.n_tested} isolates were tested, with ${w.susceptibility_pct!.toFixed(1)}% ${metric}.`,
        [
          `windows.${key}.susceptibility_pct`,
          `windows.${key}.n_tested`,
          `context.date_bounds.${key}`,
        ],
      );
      const interval = `${title}: the 95% Wilson confidence interval is ${w.ci95.susceptibility.lower!.toFixed(1)}% to ${w.ci95.susceptibility.upper!.toFixed(1)}%.`;
      add(`${key}.interval`, interval, interval, [`windows.${key}.ci95.susceptibility`], 'support');
    } else {
      const reason =
        w.status === 'empty_cohort'
          ? 'no eligible isolates matched'
          : w.status === 'no_tests'
            ? 'no tests were recorded for the selected antibiotic'
            : w.status === 'not_applicable'
              ? 'the antibiotic is not applicable to this specimen'
              : `${w.n_tested} tested isolates is below the minimum of 30`;
      const sentence = `${period}: ${reason}; no percentage is reported.`;
      add(key, sentence, `${period}: no percentage is reported because ${reason}.`, [
        `windows.${key}.status`,
        `windows.${key}.n_tested`,
        `context.date_bounds.${key}`,
      ]);
    }
    const denominator = `${title}: ${w.n_eligible} eligible isolates; ${w.n_tested} tested; ${w.n_not_tested} without a recorded test.`;
    add(
      `${key}.denominator`,
      denominator,
      denominator,
      [`windows.${key}.n_eligible`, `windows.${key}.n_tested`, `windows.${key}.n_not_tested`],
      'support',
    );
    if (!c.coverage[key].source_covers_requested_window) {
      const text = `${title}: the source date span does not cover the full requested period.`;
      add(`${key}.coverage`, text, text, [`context.coverage.${key}`], 'limitation');
    }
    if (w.n_not_tested) {
      const text = `${title}: missing tests do not count as resistance; percentages describe tested isolates only.`;
      add(`${key}.missing`, text, text, [`windows.${key}.n_not_tested`], 'limitation');
    }
  }
  add(
    'counting',
    'Each period selects its first isolate per patient, organism and specimen; age and sex filters apply after selection.',
    'Age and sex filters apply after each period selects its first isolate per patient, organism and specimen.',
    ['context.filters.dedup_scope'],
  );
  add(
    'overlap',
    'The 12-month period includes the recent 28 days; their difference alone does not establish a trend.',
    'The periods overlap, so these figures alone do not establish a change over time.',
    ['context.date_bounds'],
  );
  add(
    'interpretation',
    'These synthetic laboratory results describe susceptibility, not treatment efficacy or prescribing advice.',
    'These synthetic laboratory observations do not establish treatment effectiveness or select therapy for an individual patient.',
    ['context'],
  );
  add(
    'synthetic',
    'Synthetic demo data; results require clinical interpretation.',
    'Synthetic demo data; results require clinical interpretation.',
    ['context.source_manifest_id'],
    'limitation',
  );
  if (c.mode === 'feed')
    add(
      'feed',
      'Imported-source coverage does not certify completeness of incoming lab batches.',
      'Imported-source coverage does not certify completeness of incoming lab batches.',
      ['context.mode'],
      'limitation',
    );
  if (report.antibiotic_code === 'FOX')
    add(
      'screening',
      'This code is a screening marker, not a therapeutic susceptibility estimate.',
      'This code is a screening marker, not a therapeutic susceptibility estimate.',
      ['antibiotic_code'],
      'limitation',
    );
  return facts;
}

export function validateChoices(value: unknown, facts: SummaryFact[]): SentenceChoice[] {
  const result = z
    .object({
      sentences: z.array(
        z.object({ fact_id: z.string(), variant: z.number().int().min(0).max(1) }).strict(),
      ),
    })
    .strict()
    .parse(value);
  const paragraph = facts.filter((f) => f.section === 'paragraph');
  const ids = result.sentences.map((s) => s.fact_id);
  if (
    ids.length !== paragraph.length ||
    new Set(ids).size !== ids.length ||
    paragraph.some((f) => !ids.includes(f.fact_id)) ||
    ids[0] !== 'scope' ||
    ids.at(-1) !== 'interpretation'
  )
    throw new Error('Invalid summary sentence selection');
  return result.sentences;
}

export function renderSummary(
  report: Evidence,
  facts: SummaryFact[],
  options: {
    choices?: SentenceChoice[];
    model?: string;
    fallbackReason?: FallbackReason;
    now?: string;
  } = {},
): ReportSummary {
  const byId = new Map(facts.map((f) => [f.fact_id, f]));
  const statement = (f: SummaryFact, variant = 0) => ({
    fact_id: f.fact_id,
    text: f.variants[variant],
    paths: f.paths,
  });
  const statements = options.choices
    ? options.choices.map((s) => statement(byId.get(s.fact_id)!, s.variant))
    : facts.filter((f) => f.section === 'paragraph').map((f) => statement(f));
  const now = options.now ?? new Date().toISOString();
  return summarySchema.parse({
    summary_id: `summary-${report.analysis_id}`,
    analysis_id: report.analysis_id,
    run_id: report.context.run_id,
    state_revision: report.context.state_revision,
    method_version: report.context.method_version,
    as_of: report.context.as_of,
    language: 'en',
    status: 'ready',
    output_mode: options.choices ? 'ai' : 'template',
    paragraph: statements.map((s) => s.text).join(' '),
    statements,
    limitations: facts.filter((f) => f.section === 'limitation').map((f) => statement(f)),
    supporting_facts: facts.filter((f) => f.section === 'support').map((f) => statement(f)),
    created_at: now,
    generated_at: now,
    provider: options.choices ? 'openai' : 'local-template',
    model: options.model ?? null,
    fact_version: SUMMARY_VERSION,
    prompt_version: SUMMARY_VERSION,
    output_version: SUMMARY_VERSION,
    validation: options.choices ? 'approved_sentences' : 'template',
    fallback_reason: options.choices ? null : (options.fallbackReason ?? 'not_configured'),
  });
}
