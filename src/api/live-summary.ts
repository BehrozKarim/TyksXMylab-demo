import type { Evidence } from './contracts';
import { summarySchema, type ReportSummary } from './summaries';
import { localRequest } from '../demo/transport';

export const LIVE_SUMMARIES =
  import.meta.env.VITE_AI_SUMMARY === '1' ||
  (import.meta.env.PROD && import.meta.env.VITE_AI_SUMMARY !== '0');
const completed = new Map<string, ReportSummary>();
function remember(summary: ReportSummary) {
  if (completed.size >= 100) completed.delete(completed.keys().next().value!);
  completed.set(summary.analysis_id, summary);
  return summary;
}
function matches(summary: ReportSummary, report: Evidence) {
  const c = report.context;
  return (
    summary.analysis_id === report.analysis_id &&
    summary.run_id === c.run_id &&
    summary.state_revision === c.state_revision &&
    summary.method_version === c.method_version &&
    summary.as_of === c.as_of
  );
}
export async function createStandaloneSummary(
  report: Evidence,
  signal?: AbortSignal,
): Promise<ReportSummary> {
  signal?.throwIfAborted();
  const cached = completed.get(report.analysis_id);
  if (cached?.output_mode === 'ai' && matches(cached, report)) return cached;
  let reason: NonNullable<ReportSummary['fallback_reason']> = LIVE_SUMMARIES
    ? 'provider_unavailable'
    : 'disabled';
  if (LIVE_SUMMARIES && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
          : AbortSignal.timeout(25000),
        body: JSON.stringify({ report, language: 'en' }),
      });
      if (response.ok) {
        const summary = summarySchema.parse(await response.json());
        if (summary.status !== 'ready' || !matches(summary, report))
          throw new Error('Summary belongs to a different report');
        return remember(summary);
      }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      reason = 'provider_unavailable';
    }
  }
  const fallback = summarySchema.parse(
    await localRequest('/ai/summaries', {}, signal, 'POST', { analysis_id: report.analysis_id }),
  );
  return remember({ ...fallback, fallback_reason: reason });
}
export async function getStandaloneSummary(id: string, report: Evidence, signal?: AbortSignal) {
  const cached = completed.get(report.analysis_id);
  if (cached?.summary_id === id && matches(cached, report)) return cached;
  return summarySchema.parse(
    await localRequest(`/ai/summaries/${encodeURIComponent(id)}`, {}, signal),
  );
}
