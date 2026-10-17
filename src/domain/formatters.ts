import type { AnalysisContext, CohortQuery, Meta, WindowKey } from '../api/contracts';
export const windowLabels: Record<WindowKey, string> = {
  annual: 'Calendar year',
  rolling_12m: 'Last 12 months',
  last_28d: 'Last 28 days',
};
export function formatDate(value: string, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}
// Only converts an API half-open endpoint to its inclusive display date.
export function inclusiveEnd(exclusive: string) {
  const date = new Date(`${exclusive}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export function formatRange(bounds: AnalysisContext['date_bounds']['annual']) {
  return `${formatDate(bounds.start_inclusive)} – ${formatDate(inclusiveEnd(bounds.end_exclusive))}`;
}
export const number = (value: number) => new Intl.NumberFormat('en-GB').format(value);
export const percentage = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
export function cohortLabel(q: CohortQuery | AnalysisContext['filters'], meta: Meta) {
  const ward = meta.wards.find((w) => w.code === q.ward_code)?.label ?? 'All wards';
  return `${ward} / ${q.specimen} / ${q.organism} / ${q.sex === 'F' ? 'women' : q.sex === 'M' ? 'men' : 'all sexes'} / ${q.age_min !== null || q.age_max !== null ? `ages ${q.age_min ?? 0}–${q.age_max ?? '120+'}` : 'all ages'}`;
}
export const drugLabel = (code: string, meta: Meta) =>
  meta.antibiotics.find((a) => a.code === code)?.label ?? code;
