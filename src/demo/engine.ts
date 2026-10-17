import type { z } from 'zod';
import type { backendStateSchema } from '../api/backend';
import type { alertListSchema, AlertInvestigation } from '../api/alerts';

// Normalized synthetic source. Dates and IDs remain exact; '-' means no AST test.
export type Culture = [
  string,
  string,
  string,
  number,
  number,
  'F' | 'M',
  number,
  number,
  string | null,
];
export type Isolate = [string, number, number, string, string];
type State = z.infer<typeof backendStateSchema> & { source_manifest_id: string };
export type DemoData = {
  version: number;
  manifest: {
    manifest_id: string;
    importer_version: string;
    source_start: string;
    source_end: string;
    files: Record<string, { rows: number; sha256: string }>;
    observed_panels: { organism: string; specimen: string; antibiotic_codes: string[] }[];
  };
  wards: { ward_code: string; ward_en: string; ward_type: string }[];
  antibiotics: {
    antibiotic_code: string;
    antibiotic: string;
    is_screening: boolean;
    reported_for: string;
  }[];
  organisms: string[];
  specimens: string[];
  results: string[];
  cultures: Culture[];
  isolates: Isolate[];
  seed_count: number;
  batches: { delivery_id: string; as_of: string; cultures: number; visible_cultures: number }[];
  stages: {
    state: State;
    alerts: z.infer<typeof alertListSchema>;
    investigations: Record<string, AlertInvestigation>;
  }[];
};
type Params = Record<string, unknown>;
type Query = {
  as_of: string;
  ward_code: string | null;
  organism: string;
  specimen: string;
  sex: string | null;
  age_min: number | null;
  age_max: number | null;
  dedup_scope: string;
  known_at: null;
};
type Period = 'rolling_28_days' | 'rolling_12_months';
type Status = 'available' | 'not_applicable' | 'empty_cohort' | 'no_tests' | 'insufficient_data';

export class DemoError extends Error {
  constructor(
    message: string,
    public status = 422,
    public code = 'invalid_filter',
  ) {
    super(message);
  }
}
export const addDays = (day: string, count: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
export function priorAnniversary(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}
export function periodStart(day: string, period: Period) {
  return period === 'rolling_28_days' ? addDays(day, -27) : addDays(priorAnniversary(day), 1);
}
export function wilson(successes: number, tested: number) {
  if (!tested) return { lower: null, upper: null };
  const z = 1.9599639845400536;
  const p = successes / tested,
    denominator = 1 + (z * z) / tested;
  const center = (p + (z * z) / (2 * tested)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / tested + (z * z) / (4 * tested * tested))) / denominator;
  return {
    lower: successes === 0 ? 0 : Math.max(0, 100 * (center - half)),
    upper: successes === tested ? 100 : Math.min(100, 100 * (center + half)),
  };
}
const text = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : String(value);
const numeric = (value: unknown) => (text(value) === null ? null : Number(value));
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class DemoEngine {
  private saved = new Map<string, unknown>();
  private cache = new Map<string, unknown>();
  private cultureIsolates = new Map<number, Isolate[]>();
  private summaries = new Map<string, ReturnType<DemoEngine['makeSummary']>>();
  stage: number;
  constructor(
    public readonly data: DemoData,
    stage = 0,
  ) {
    if (data.version !== 1 || !data.stages.length || data.stages.length !== data.batches.length + 1)
      throw new Error('Unsupported demo dataset. Reload the latest deployment.');
    this.stage = Number.isInteger(stage) && stage >= 0 && stage < data.stages.length ? stage : 0;
    for (const isolate of data.isolates) {
      const rows = this.cultureIsolates.get(isolate[1]) ?? [];
      rows.push(isolate);
      this.cultureIsolates.set(isolate[1], rows);
    }
  }
  state() {
    return this.data.stages[this.stage].state;
  }
  private guard(params: Params) {
    const state = this.state();
    if (
      params.expected_run_id !== undefined &&
      (params.expected_run_id !== state.run_id ||
        Number(params.expected_revision) !== state.state_revision)
    )
      throw new DemoError('The demo batch changed; refreshing the report.', 409, 'state_changed');
  }
  private query(p: Params): Query {
    const q = {
      as_of: String(p.as_of ?? this.state().demo_date),
      ward_code: text(p.ward_code),
      organism: String(p.organism ?? 'Escherichia coli'),
      specimen: String(p.specimen ?? 'urine'),
      sex: text(p.sex),
      age_min: numeric(p.age_min),
      age_max: numeric(p.age_max),
      dedup_scope: String(p.dedup_scope ?? 'selected_cohort'),
      known_at: null,
    };
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(q.as_of) ||
      !Number.isFinite(Date.parse(q.as_of)) ||
      q.as_of > this.state().demo_date ||
      Number(q.as_of.slice(0, 4)) < 2
    )
      throw new DemoError('Choose a valid report date on or before the current demo date.');
    if (
      !this.data.organisms.includes(q.organism) ||
      !this.data.specimens.includes(q.specimen) ||
      (q.ward_code && !this.data.wards.some((w) => w.ward_code === q.ward_code)) ||
      (q.sex !== null && !['F', 'M'].includes(q.sex)) ||
      !['selected_cohort', 'all_wards'].includes(q.dedup_scope) ||
      [q.age_min, q.age_max].some((age) => age !== null && (!Number.isInteger(age) || age < 0)) ||
      (q.age_min !== null && q.age_max !== null && q.age_min > q.age_max)
    )
      throw new DemoError('Invalid population filters.');
    if (p.known_at)
      throw new DemoError('Knowledge-time queries are not part of this synthetic snapshot.');
    return q;
  }
  private drug(code: unknown) {
    const index = this.data.antibiotics.findIndex((d) => d.antibiotic_code === code);
    if (index < 0) throw new DemoError('Unknown antibiotic.');
    return { ...this.data.antibiotics[index], index };
  }
  private select(q: Query, period: Period) {
    const start = periodStart(q.as_of, period),
      seen = new Set<string>(),
      retained: Isolate[] = [];
    let beforeDemographics = 0,
      excluded = 0;
    for (const isolate of this.data.isolates) {
      const c = this.data.cultures[isolate[1]];
      if (
        isolate[1] >= this.state().published_cultures ||
        c[2] < start ||
        c[2] > q.as_of ||
        this.data.organisms[isolate[2]] !== q.organism ||
        this.data.specimens[c[4]] !== q.specimen
      )
        continue;
      const ward = this.data.wards[c[3]].ward_code;
      if (q.dedup_scope === 'selected_cohort' && q.ward_code && ward !== q.ward_code) continue;
      // Input is ordered by date/culture/isolate, exactly like the reference selector.
      const key = `${c[1]}\0${isolate[2]}\0${c[4]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (q.ward_code && ward !== q.ward_code) continue;
      beforeDemographics++;
      if (
        (q.sex && c[5] !== q.sex) ||
        (q.age_min !== null && c[6] < q.age_min) ||
        (q.age_max !== null && c[6] > q.age_max)
      ) {
        excluded++;
        continue;
      }
      retained.push(isolate);
    }
    return {
      retained,
      start,
      metadata: {
        retained_before_demographic_filters: beforeDemographics,
        unknown_sex: 0,
        unknown_age: 0,
        excluded_unknown: 0,
        excluded_nonmatching: excluded,
      },
    };
  }
  private coverage(start: string, end: string) {
    const m = this.data.manifest,
      seed = this.data.stages[0].state;
    const overlapStart = start > m.source_start ? start : m.source_start;
    const overlapEnd = end < m.source_end ? end : m.source_end;
    return {
      coverage_scope: 'imported_dataset_only',
      includes_feed_data: this.stage > 0,
      source_start: m.source_start,
      source_end: m.source_end,
      overlap_start: overlapStart <= overlapEnd ? overlapStart : null,
      overlap_end: overlapStart <= overlapEnd ? overlapEnd : null,
      source_date_span_covers_window: m.source_start <= start && end <= m.source_end,
      imported_culture_start: m.source_start,
      imported_culture_end: seed.demo_date,
      source_fully_imported: seed.published_cultures === this.data.cultures.length,
      source_cultures_expected: this.data.cultures.length,
      source_cultures_imported: seed.published_cultures,
      source_isolates_expected: this.data.isolates.length,
      source_isolates_enriched: seed.published_isolates,
    };
  }
  private context(method: string, filters: Params) {
    const {
      status: _status,
      seed_through: _seed,
      replay_through: _through,
      ...state
    } = this.state();
    void _status;
    void _seed;
    void _through;
    return {
      ...state,
      method_version: method,
      filters,
      base_rules_version: 'prototype-v2',
      minimum_tested: 30,
      interval_method: 'wilson_95',
      demographic_filter_order: 'after_first_isolate',
      source_files: this.data.manifest.files,
      importer_version: this.data.manifest.importer_version,
      generated_at: new Date().toISOString(),
      visibility: 'published_culture_bundles',
      ward_scope: filters.ward_code ? 'selected_ward' : 'all_wards',
      latest_received_at: `${state.latest_visible_sample_date}T12:00:00Z`,
    };
  }
  evidence(p: Params) {
    const q = this.query(p),
      drug = this.drug(p.antibiotic_code);
    const measure = (period: Period) => {
      const { retained, start, metadata } = this.select(q, period);
      const tests = retained.map((i) => i[3][drug.index]).filter((t) => t !== '-');
      const n = tests.length,
        susceptible = tests.filter((t) => t === 'S').length;
      const status: Status =
        drug.reported_for !== 'all' && drug.reported_for !== q.specimen
          ? 'not_applicable'
          : !retained.length
            ? 'empty_cohort'
            : !n
              ? 'no_tests'
              : n < 30
                ? 'insufficient_data'
                : 'available';
      const available = status === 'available';
      return {
        period,
        start_date: start,
        end_date: q.as_of,
        status,
        n_eligible: retained.length,
        n_tested: n,
        n_s: susceptible,
        n_r: n - susceptible,
        n_not_tested: retained.length - n,
        susceptibility_pct: available ? (100 * susceptible) / n : null,
        resistance_pct: available ? (100 * (n - susceptible)) / n : null,
        ci95: {
          susceptibility: wilson(available ? susceptible : 0, available ? n : 0),
          resistance: wilson(available ? n - susceptible : 0, available ? n : 0),
        },
        metadata,
        coverage: this.coverage(start, q.as_of),
      };
    };
    return {
      analysis_id: crypto.randomUUID(),
      context: {
        ...this.context('evidence-v1', { ...q, antibiotic_code: drug.antibiotic_code }),
        antibiotic_is_screening: drug.is_screening,
      },
      windows: {
        rolling_28_days: measure('rolling_28_days'),
        rolling_12_months: measure('rolling_12_months'),
      },
    };
  }
  comparison(p: Params) {
    const q = this.query(p),
      a = this.drug(p.antibiotic_a),
      b = this.drug(p.antibiotic_b);
    if (a.index === b.index || a.is_screening || b.is_screening)
      throw new DemoError('Choose two different non-screening antibiotics.');
    const window = String(p.window ?? 'rolling_28_days') as Period;
    if (!['rolling_28_days', 'rolling_12_months'].includes(window))
      throw new DemoError('Unknown period.');
    const { retained, start, metadata } = this.select(q, window);
    const cells = { both_s: 0, a_only_s: 0, b_only_s: 0, both_r: 0 };
    let missingA = 0,
      missingB = 0,
      missingEither = 0;
    for (const row of retained) {
      const ar = row[3][a.index],
        br = row[3][b.index];
      if (ar === '-') missingA++;
      if (br === '-') missingB++;
      if (ar === '-' || br === '-') {
        missingEither++;
        continue;
      }
      cells[
        ar === 'S' ? (br === 'S' ? 'both_s' : 'a_only_s') : br === 'S' ? 'b_only_s' : 'both_r'
      ]++;
    }
    const n = retained.length - missingEither;
    const status = [a, b].some((d) => d.reported_for !== 'all' && d.reported_for !== q.specimen)
      ? 'not_applicable'
      : !retained.length
        ? 'empty_cohort'
        : !n
          ? 'no_paired_tests'
          : n < 30
            ? 'insufficient_data'
            : 'available';
    const pct = (value: number) => (status === 'available' ? (100 * value) / n : null);
    return {
      analysis_id: crypto.randomUUID(),
      context: this.context('comparison-v1', {
        ...q,
        antibiotic_a: a.antibiotic_code,
        antibiotic_b: b.antibiotic_code,
        window,
      }),
      comparison: {
        status,
        antibiotic_a: a.antibiotic_code,
        antibiotic_b: b.antibiotic_code,
        window,
        start_date: start,
        end_date: q.as_of,
        n_eligible: retained.length,
        n_tested_a: retained.length - missingA,
        n_tested_b: retained.length - missingB,
        n_paired: n,
        n_missing_a: missingA,
        n_missing_b: missingB,
        n_missing_either: missingEither,
        cells,
        a_susceptibility_pct: pct(cells.both_s + cells.a_only_s),
        b_susceptibility_pct: pct(cells.both_s + cells.b_only_s),
        net_difference_pp: pct(cells.b_only_s - cells.a_only_s),
        b_only_added_pct: pct(cells.b_only_s),
        at_least_one_s_pct: pct(n - cells.both_r),
        metadata,
        coverage: this.coverage(start, q.as_of),
      },
    };
  }
  private history(patient: string, p: Params) {
    const asOf = String(p.as_of ?? this.state().demo_date),
      start = priorAnniversary(asOf);
    if (asOf > this.state().demo_date)
      throw new DemoError('History cutoff is later than the demo date.');
    const tokenPrefix = `${this.stage}:${patient}:${asOf}:`;
    if (p.cursor && !String(p.cursor).startsWith(tokenPrefix))
      throw new DemoError('History cursor does not match this snapshot.');
    const offset = p.cursor ? Number(String(p.cursor).slice(tokenPrefix.length)) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw new DemoError('Invalid history cursor.');
    const matches = this.data.cultures
      .slice(0, this.state().published_cultures)
      .map((c, index) => ({ c, index }))
      .filter(({ c }) => c[1] === patient && c[2] >= start && c[2] < asOf)
      .sort((a, b) => order(b.c[2], a.c[2]) || order(b.c[0], a.c[0]));
    const rows = matches.slice(offset, offset + 25);
    return {
      analysis_id: crypto.randomUUID(),
      context: {
        ...this.context('history-v1', { patient_id: patient, as_of: asOf, limit: 25 }),
        start_date: start,
        end_date_exclusive: asOf,
      },
      has_more: offset + 25 < matches.length,
      next_cursor: offset + 25 < matches.length ? `${tokenPrefix}${offset + 25}` : null,
      cultures: rows.map(({ c, index }) => ({
        record: {
          culture_id: c[0],
          sample_date: c[2],
          specimen: this.data.specimens[c[4]],
          ward_en: this.data.wards[c[3]].ward_en,
          result: this.data.results[c[7]],
        },
        isolates: (this.cultureIsolates.get(index) ?? []).map((i) => ({
          event: {
            isolate_id: i[0],
            organism: this.data.organisms[i[2]],
            tests: this.data.antibiotics.flatMap((d, j) =>
              i[3][j] === '-' ? [] : [{ antibiotic_code: d.antibiotic_code, result: i[3][j] }],
            ),
          },
          enrichment: {
            esbl: Number(i[4][0]),
            mrsa: Number(i[4][1]),
            vre: Number(i[4][2]),
            cpe: Number(i[4][3]),
          },
        })),
      })),
    };
  }
  private patients(p: Params) {
    const asOf = String(p.as_of ?? this.state().demo_date),
      search = String(p.search ?? '');
    if (asOf > this.state().demo_date)
      throw new DemoError('Search date is later than the demo date.');
    const patients = new Map<
      string,
      { patient_id: string; visible_cultures: number; latest_sample_date: string }
    >();
    for (let i = 0; i < this.state().published_cultures; i++) {
      const c = this.data.cultures[i];
      if (c[2] > asOf || !c[1].includes(search)) continue;
      const row = patients.get(c[1]) ?? {
        patient_id: c[1],
        visible_cultures: 0,
        latest_sample_date: c[2],
      };
      row.visible_cultures++;
      row.latest_sample_date = c[2];
      patients.set(c[1], row);
    }
    return {
      run_id: this.state().run_id,
      state_revision: this.state().state_revision,
      as_of: asOf,
      has_more: patients.size > 20,
      patients: [...patients.values()]
        .sort((a, b) => order(a.patient_id, b.patient_id))
        .slice(0, 20),
    };
  }
  demoStatus() {
    const next = this.data.batches[this.stage],
      last = this.data.batches[this.stage - 1];
    return {
      phase: next ? 'ready' : 'complete',
      run_id: this.state().run_id,
      next_batch: next
        ? { delivery_id: next.delivery_id, as_of: next.as_of, cultures: next.cultures }
        : null,
      published_batches: this.stage,
      skipped_batches: 0,
      last_publication: last
        ? { cultures: last.cultures, as_of: last.as_of, revision: this.stage + 1 }
        : null,
      error: null,
    };
  }
  private remember<T extends { analysis_id: string }>(report: T) {
    this.saved.set(report.analysis_id, report);
    return report;
  }
  private analysis(id: string) {
    if (this.saved.has(id)) return this.saved.get(id);
    // Original detections remain exportable after subsequent batches and reloads.
    for (let i = 0; i <= this.stage; i++)
      for (const report of this.data.stages[i].alerts.monitors)
        if (report.analysis_id === id) return report;
    throw new DemoError(
      'Saved analysis not found in this demo session.',
      404,
      'analysis_not_found',
    );
  }
  private makeSummary(id: string) {
    const report = this.analysis(id) as ReturnType<DemoEngine['evidence']>;
    if (!report.windows) throw new DemoError('Select an evidence report to summarize.');
    const q = report.context.filters;
    const population = `${q.sex === 'F' ? 'women' : q.sex === 'M' ? 'men' : 'all sexes'}, ages ${q.age_min ?? 0}–${q.age_max ?? 'any'}`;
    const statements = [
      {
        fact_id: 'scope',
        text: `This report covers ${q.organism} in ${q.specimen} from ${q.ward_code ?? 'all wards'} (${population}), ${q.antibiotic_code}, through ${q.as_of}.`,
        paths: ['context.filters'],
      },
    ];
    for (const period of ['rolling_12_months', 'rolling_28_days'] as const) {
      const w = report.windows[period],
        title = period === 'rolling_28_days' ? 'Last 28 days' : 'Last 12 months';
      statements.push({
        fact_id: period,
        text:
          w.status === 'available'
            ? `${title}: ${w.susceptibility_pct!.toFixed(1)}% ${report.context.antibiotic_is_screening ? 'screening-marker S results' : 'susceptible'} among ${w.n_tested} tested isolates (${w.start_date} to ${w.end_date}).`
            : `${title}: ${w.n_tested} tested isolates; no percentage is reported (${w.status.replaceAll('_', ' ')}).`,
        paths: [`windows.${period}`],
      });
    }
    statements.push({
      fact_id: 'interpretation',
      text: 'These synthetic laboratory results describe susceptibility, not treatment efficacy or prescribing advice.',
      paths: ['context'],
    });
    const now = new Date().toISOString();
    return {
      summary_id: `summary-${id}`,
      analysis_id: id,
      run_id: report.context.run_id,
      state_revision: report.context.state_revision,
      method_version: report.context.method_version,
      as_of: String(q.as_of),
      language: 'en',
      status: 'ready',
      output_mode: 'template',
      paragraph: statements.map((s) => s.text).join(' '),
      statements,
      limitations: [
        {
          fact_id: 'synthetic',
          text: 'Synthetic demo data; results require clinical interpretation.',
          paths: ['context.source_manifest_id'],
        },
      ],
      supporting_facts: [],
      created_at: now,
      generated_at: now,
      provider: 'local-template',
      model: null,
      fact_version: 'demo-v1',
      prompt_version: 'demo-v1',
      output_version: 'demo-v1',
      validation: 'template',
      fallback_reason: 'disabled',
    };
  }
  request(path: string, p: Params = {}, method = 'GET', body: Params = {}): unknown {
    if (path === '/state') return this.state();
    if (path === '/meta')
      return {
        method_version: 'evidence-v1',
        minimum_tested: 30,
        periods: ['rolling_28_days', 'rolling_12_months'],
        source: {
          kind: 'directory',
          start_date: this.data.manifest.source_start,
          end_date: this.data.manifest.source_end,
        },
        wards: this.data.wards,
        antibiotics: this.data.antibiotics,
        organisms: this.data.organisms,
        specimens: this.data.specimens,
        sex: ['F', 'M'],
        analysis_methods: { alert: 'alert-v1' },
        observed_panels: this.data.manifest.observed_panels,
      };
    if (path === '/demo/status') return this.demoStatus();
    if (path === '/demo/next' && method === 'POST') {
      const next = this.data.batches[this.stage];
      if (!next || next.delivery_id !== body.delivery_id)
        throw new DemoError('This batch has already been published.', 409, 'state_changed');
      this.stage++;
      return this.demoStatus();
    }
    if (path === '/demo/reset' && method === 'POST') {
      this.stage = 0;
      this.cache.clear();
      this.saved.clear();
      this.summaries.clear();
      return this.demoStatus();
    }
    this.guard(p);
    if (path === '/evidence' || path === '/comparisons') {
      const key = JSON.stringify([
        this.stage,
        path,
        Object.entries(p)
          .filter(([k]) => !k.startsWith('expected_'))
          .sort(),
      ]);
      if (!this.cache.has(key))
        this.cache.set(
          key,
          this.remember(path === '/evidence' ? this.evidence(p) : this.comparison(p)),
        );
      return this.cache.get(key);
    }
    if (path === '/patients') return this.patients(p);
    const history = path.match(/^\/patients\/([^/]+)\/history$/);
    if (history) return this.remember(this.history(decodeURIComponent(history[1]), p));
    if (path === '/alerts') return this.data.stages[this.stage].alerts;
    const investigation = path.match(/^\/investigations\/([^/]+)$/);
    if (investigation) {
      const result = this.data.stages[this.stage].investigations[investigation[1]];
      if (!result) throw new DemoError('Investigation not found in this demo snapshot.', 404);
      return result;
    }
    const analysis = path.match(/^\/analyses\/([^/]+)(?:\/export)?$/);
    if (analysis) return this.analysis(analysis[1]);
    if (path === '/ai/summaries' && method === 'POST') {
      const id = String(body.analysis_id);
      if (!this.summaries.has(id)) this.summaries.set(id, this.makeSummary(id));
      return this.summaries.get(id);
    }
    if (path.startsWith('/ai/summaries/')) {
      const summary = this.summaries.get(path.slice('/ai/summaries/summary-'.length));
      if (summary) return summary;
      throw new DemoError('Summary not found.', 404);
    }
    throw new DemoError('This operation is not available in the standalone demo.', 404);
  }
}

export function exportCsv(report: unknown): string {
  const r = report as Record<string, unknown>;
  const flatten = (value: Record<string, unknown>, prefix = ''): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(value).flatMap(([k, v]) => {
        const name = prefix ? `${prefix}_${k}` : k;
        return v && typeof v === 'object' && !Array.isArray(v)
          ? Object.entries(flatten(v as Record<string, unknown>, name))
          : [[name, v]];
      }),
    );
  const windows = r.windows as Record<string, unknown> | undefined;
  const records = windows
    ? Object.entries(windows).map(([period, window]) => ({
        analysis_id: r.analysis_id,
        context: r.context,
        period,
        ...(window as Record<string, unknown>),
      }))
    : [r];
  const rows = records.map((row) => flatten(row));
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value: unknown) =>
    `"${String(
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : value,
    ).replaceAll('"', '""')}"`;
  return [
    headers.map(quote).join(','),
    ...rows.map((row) => headers.map((h) => quote(row[h])).join(',')),
  ].join('\r\n');
}
