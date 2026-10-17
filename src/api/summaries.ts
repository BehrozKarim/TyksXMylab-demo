import { z } from 'zod';

const statement = z.object({
  fact_id: z.string(),
  text: z.string().min(1),
  paths: z.array(z.string()),
});
export const summarySchema = z
  .object({
    summary_id: z.string(),
    analysis_id: z.string(),
    run_id: z.string(),
    state_revision: z.number().int().positive(),
    method_version: z.string(),
    as_of: z.iso.date(),
    language: z.literal('en'),
    status: z.enum(['queued', 'generating', 'ready']),
    output_mode: z.enum(['ai', 'template']).nullable(),
    paragraph: z.string().nullable(),
    statements: z.array(statement),
    limitations: z.array(statement),
    supporting_facts: z.array(statement),
    created_at: z.iso.datetime({ offset: true }),
    generated_at: z.iso.datetime({ offset: true }).nullable(),
    provider: z.string(),
    model: z.string().nullable(),
    fact_version: z.string(),
    prompt_version: z.string(),
    output_version: z.string(),
    validation: z.enum(['pending', 'approved_sentences', 'template']),
    fallback_reason: z
      .enum([
        'not_configured',
        'disabled',
        'provider_unavailable',
        'invalid_output',
        'interrupted',
        'configuration_changed',
      ])
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'ready') {
      if (
        !value.output_mode ||
        !value.generated_at ||
        !value.paragraph ||
        value.statements.length === 0 ||
        value.paragraph !== value.statements.map((s) => s.text).join(' ') ||
        new Set(value.statements.map((s) => s.fact_id)).size !== value.statements.length ||
        value.statements[0]?.fact_id !== 'scope' ||
        value.statements.at(-1)?.fact_id !== 'interpretation' ||
        (value.output_mode === 'ai' &&
          (value.validation !== 'approved_sentences' || value.fallback_reason !== null)) ||
        (value.output_mode === 'template' &&
          (value.validation !== 'template' || !value.fallback_reason))
      )
        ctx.addIssue({ code: 'custom', message: 'Invalid completed summary' });
    } else if (
      value.output_mode !== null ||
      value.paragraph !== null ||
      value.statements.length > 0
    ) {
      ctx.addIssue({ code: 'custom', message: 'Unfinished summary contains output' });
    }
  });
export type ReportSummary = z.infer<typeof summarySchema>;
