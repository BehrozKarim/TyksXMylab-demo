import type { CohortQuery, Meta, ReplayState, WindowKey } from '../api/contracts';
import { queryString } from '../api/client';
export const defaults: Omit<CohortQuery, 'as_of'> = {
  ward_code: 'URO',
  specimen: 'urine',
  organism: 'Escherichia coli',
  sex: null,
  age_min: null,
  age_max: null,
  calendar_year: 2026,
  antibiotic_code: 'CIP',
  antibiotic_b: 'TMP',
  window: 'last_28d',
  dedup_scope: 'selected_cohort',
};
export function readCohort(
  search: URLSearchParams,
  meta: Meta,
  state: ReplayState,
): { query: CohortQuery; issues: string[]; pinned: boolean } {
  const issues: string[] = [];
  const pick = (key: string, choices: string[], fallback: string) => {
    if (!choices.includes(fallback))
      fallback = choices.includes('') ? '' : (choices[0] ?? fallback);
    const value = search.get(key);
    if (value === null) return fallback;
    if (!choices.includes(value)) {
      issues.push(`Invalid ${key.replaceAll('_', ' ')}; using ${fallback || 'all'}.`);
      return fallback;
    }
    return value;
  };
  const age = (key: string) => {
    const v = search.get(key);
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 120) {
      issues.push('Age must be a whole number from 0 to 120.');
      return null;
    }
    return n;
  };
  const pinned =
    search.get('date_mode') === 'pinned' || (search.has('as_of') && !search.has('date_mode'));
  let as_of = pinned ? (search.get('as_of') ?? state.demo_date) : state.demo_date;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(as_of) ||
    Number.isNaN(Date.parse(as_of)) ||
    new Date(`${as_of}T12:00:00Z`).toISOString().slice(0, 10) !== as_of ||
    as_of > state.demo_date ||
    as_of < meta.source.start
  ) {
    issues.push('Reporting date was outside the available range; using the latest reporting date.');
    as_of = state.demo_date;
  }
  const query: CohortQuery = {
    ward_code:
      pick(
        'ward_code',
        ['', ...meta.wards.map((w) => w.code)],
        search.has('ward_code') ? '' : defaults.ward_code!,
      ) || null,
    specimen: pick('specimen', meta.specimens, defaults.specimen) as CohortQuery['specimen'],
    organism: pick('organism', meta.organisms, defaults.organism),
    sex: (pick('sex', ['', ...meta.sexes.map((s) => s.code)], '') as CohortQuery['sex']) || null,
    dedup_scope: pick(
      'dedup_scope',
      ['selected_cohort', 'all_wards'],
      'selected_cohort',
    ) as CohortQuery['dedup_scope'],
    age_min: age('age_min'),
    age_max: age('age_max'),
    calendar_year: Number(
      pick(
        'calendar_year',
        Array.from(
          { length: Number(as_of.slice(0, 4)) - Number(meta.source.start.slice(0, 4)) + 1 },
          (_, i) => String(Number(meta.source.start.slice(0, 4)) + i),
        ),
        as_of.slice(0, 4),
      ),
    ),
    antibiotic_code: pick(
      'antibiotic_code',
      meta.antibiotics.map((a) => a.code),
      defaults.antibiotic_code,
    ),
    antibiotic_b: pick(
      'antibiotic_b',
      ['', ...meta.antibiotics.filter((a) => !a.screening).map((a) => a.code)],
      defaults.antibiotic_b,
    ),
    window: pick('window', ['annual', 'rolling_12m', 'last_28d'], defaults.window) as WindowKey,
    as_of,
  };
  if (query.calendar_year > Number(as_of.slice(0, 4))) {
    query.calendar_year = Number(as_of.slice(0, 4));
    issues.push('Calendar year adjusted to the reporting date.');
  }
  if (query.age_min !== null && query.age_max !== null && query.age_min > query.age_max) {
    query.age_min = null;
    query.age_max = null;
    issues.push('Inverted age bounds were removed.');
  }
  if (
    query.antibiotic_b === query.antibiotic_code ||
    meta.antibiotics.find((a) => a.code === query.antibiotic_code)?.screening
  )
    query.antibiotic_b = '';
  if (!(meta.supported_windows ?? ['rolling_12m', 'last_28d']).includes(query.window))
    query.window = 'rolling_12m';
  return { query, issues, pinned };
}
export function writeCohort(q: CohortQuery, pinned: boolean) {
  // Keep the explicit empty ward code so an all-wards link cannot default to Urology.
  const params = new URLSearchParams(
    queryString({ ...q, date_mode: pinned ? 'pinned' : 'follow' }),
  );
  if (!q.ward_code) params.set('ward_code', '');
  if (!q.antibiotic_b) params.set('antibiotic_b', '');
  return params;
}
