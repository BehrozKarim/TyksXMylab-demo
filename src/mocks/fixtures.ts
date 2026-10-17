import type {
  AnalysisContext,
  Comparison,
  Evidence,
  Filters,
  History,
  Investigation,
  Meta,
  ReplayState,
  ReviewFlag,
  WindowMeasure,
} from '../api/contracts';

// Authored contract examples, deliberately separate from the supplied CSV dataset.
// Values are not calculated from clinical records or inferred by UI components.
export const meta: Meta = {
  wards: [
    ['ED', 'Emergency department'],
    ['MED-A', 'Internal medicine A'],
    ['MED-B', 'Internal medicine B'],
    ['SURG', 'Surgery'],
    ['URO', 'Urology'],
    ['ICU', 'Intensive care unit'],
    ['GER', 'Geriatrics'],
    ['PHC-N', 'Health centre North'],
    ['PHC-S', 'Health centre South'],
  ].map(([code, label]) => ({ code, label })),
  specimens: ['urine', 'blood', 'wound'],
  organisms: [
    'Escherichia coli',
    'Klebsiella pneumoniae',
    'Staphylococcus aureus',
    'Enterococcus faecalis',
    'Pseudomonas aeruginosa',
  ],
  antibiotics: [
    {
      code: 'CIP',
      label: 'Ciprofloxacin',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa'],
    },
    {
      code: 'TMP',
      label: 'Trimethoprim',
      screening: false,
      specimens: ['urine'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae'],
    },
    {
      code: 'NIT',
      label: 'Nitrofurantoin',
      screening: false,
      specimens: ['urine'],
      organisms: ['Escherichia coli', 'Enterococcus faecalis'],
    },
    {
      code: 'MEC',
      label: 'Mecillinam',
      screening: false,
      specimens: ['urine'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae'],
    },
    {
      code: 'AMP',
      label: 'Ampicillin',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Enterococcus faecalis'],
    },
    {
      code: 'CXM',
      label: 'Cefuroxime',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae'],
    },
    {
      code: 'CRO',
      label: 'Ceftriaxone',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae'],
    },
    {
      code: 'CAZ',
      label: 'Ceftazidime',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa'],
    },
    {
      code: 'TZP',
      label: 'Piperacillin–tazobactam',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa'],
    },
    {
      code: 'MEM',
      label: 'Meropenem',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Escherichia coli', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa'],
    },
    {
      code: 'VAN',
      label: 'Vancomycin',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Staphylococcus aureus', 'Enterococcus faecalis'],
    },
    {
      code: 'CLI',
      label: 'Clindamycin',
      screening: false,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Staphylococcus aureus'],
    },
    {
      code: 'FOX',
      label: 'Cefoxitin · screening',
      screening: true,
      specimens: ['urine', 'blood', 'wound'],
      organisms: ['Staphylococcus aureus'],
    },
  ],
  sexes: [
    { code: 'F', label: 'Women' },
    { code: 'M', label: 'Men' },
  ],
  source: { start: '2023-10-02', end: '2026-09-27', label: 'Authored demonstration fixtures' },
  method_version: 'surveillance-v1',
  interval_method: 'Wilson score, two-sided 95%',
  minimum_tested: 30,
};
export const initialState: ReplayState = {
  run_id: 'fixture-run-001',
  state_revision: 8,
  method_version: meta.method_version,
  status: 'paused',
  demo_date: '2026-09-27',
  latest_visible_sample_date: '2026-09-27',
  source_kind: 'scenario_fixture',
  replay_bounds: { start: '2026-09-20', end: '2026-10-04' },
  published_bundles: 320,
};
export const available: WindowMeasure = {
  status: 'available',
  n_eligible: 54,
  n_tested: 40,
  n_s: 30,
  n_r: 10,
  n_not_tested: 14,
  susceptibility_pct: 75,
  resistance_pct: 25,
  ci95: { susceptibility: { lower: 59.8, upper: 85.8 }, resistance: { lower: 14.2, upper: 40.2 } },
};
export const annual: WindowMeasure = {
  status: 'available',
  n_eligible: 258,
  n_tested: 250,
  n_s: 206,
  n_r: 44,
  n_not_tested: 8,
  susceptibility_pct: 82.4,
  resistance_pct: 17.6,
  ci95: { susceptibility: { lower: 77.2, upper: 86.6 }, resistance: { lower: 13.4, upper: 22.8 } },
};
export const rolling: WindowMeasure = {
  status: 'available',
  n_eligible: 290,
  n_tested: 280,
  n_s: 223,
  n_r: 57,
  n_not_tested: 10,
  susceptibility_pct: 79.642857,
  resistance_pct: 20.357143,
  ci95: { susceptibility: { lower: 74.5, upper: 83.9 }, resistance: { lower: 16.1, upper: 25.5 } },
};
export const suppressed: WindowMeasure = {
  status: 'insufficient_data',
  n_eligible: 34,
  n_tested: 29,
  n_s: 21,
  n_r: 8,
  n_not_tested: 5,
  susceptibility_pct: null,
  resistance_pct: null,
  ci95: { susceptibility: { lower: null, upper: null }, resistance: { lower: null, upper: null } },
};
export const noTests: WindowMeasure = {
  ...suppressed,
  status: 'no_tests',
  n_eligible: 34,
  n_tested: 0,
  n_s: 0,
  n_r: 0,
  n_not_tested: 34,
};
export const empty: WindowMeasure = {
  ...noTests,
  status: 'empty_cohort',
  n_eligible: 0,
  n_not_tested: 0,
};
const notApplicable: WindowMeasure = {
  ...empty,
  status: 'not_applicable',
  reason: 'The antibiotic dictionary restricts this test to urine specimens.',
};
const tmp: WindowMeasure = {
  ...available,
  n_s: 33,
  n_r: 7,
  susceptibility_pct: 82.5,
  resistance_pct: 17.5,
  ci95: { susceptibility: { lower: 68.1, upper: 91.3 }, resistance: { lower: 8.7, upper: 31.9 } },
};
const nit: WindowMeasure = {
  ...available,
  n_s: 36,
  n_r: 4,
  susceptibility_pct: 90,
  resistance_pct: 10,
  ci95: { susceptibility: { lower: 76.9, upper: 96 }, resistance: { lower: 4, upper: 23.1 } },
};
const tmpAnnual: WindowMeasure = {
  ...annual,
  n_s: 220,
  n_r: 30,
  susceptibility_pct: 88,
  resistance_pct: 12,
  ci95: { susceptibility: { lower: 83.4, upper: 91.5 }, resistance: { lower: 8.5, upper: 16.6 } },
};
const tmpRolling: WindowMeasure = {
  ...rolling,
  n_s: 238,
  n_r: 42,
  susceptibility_pct: 85,
  resistance_pct: 15,
  ci95: { susceptibility: { lower: 80.3, upper: 88.7 }, resistance: { lower: 11.3, upper: 19.7 } },
};
const nitAnnual: WindowMeasure = {
  ...annual,
  n_s: 225,
  n_r: 25,
  susceptibility_pct: 90,
  resistance_pct: 10,
  ci95: { susceptibility: { lower: 85.7, upper: 93.1 }, resistance: { lower: 6.9, upper: 14.3 } },
};
const nitRolling: WindowMeasure = {
  ...rolling,
  n_s: 252,
  n_r: 28,
  susceptibility_pct: 90,
  resistance_pct: 10,
  ci95: { susceptibility: { lower: 85.9, upper: 93 }, resistance: { lower: 7, upper: 14.1 } },
};

// Date arithmetic is confined to the mock server. Live UI reads bounds from responses.
export function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function previousYear(value: string) {
  const d = new Date(`${value}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
export function makeContext(params: URLSearchParams, state: ReplayState): AnalysisContext {
  const as_of = params.get('as_of') ?? state.demo_date;
  const year = Number(params.get('calendar_year') ?? as_of.slice(0, 4));
  const end = addDays(as_of, 1);
  const filters: Filters = {
    ward_code: params.get('ward_code') || null,
    specimen: (params.get('specimen') ?? 'urine') as Filters['specimen'],
    organism: params.get('organism') ?? 'Escherichia coli',
    sex: (params.get('sex') || null) as Filters['sex'],
    age_min: params.has('age_min') ? Number(params.get('age_min')) : null,
    age_max: params.has('age_max') ? Number(params.get('age_max')) : null,
    calendar_year: year,
  };
  const date_bounds = {
    annual: {
      start_inclusive: `${year}-01-01`,
      end_exclusive: year === Number(as_of.slice(0, 4)) ? end : `${year + 1}-01-01`,
    },
    rolling_12m: { start_inclusive: addDays(previousYear(as_of), 1), end_exclusive: end },
    last_28d: { start_inclusive: addDays(as_of, -27), end_exclusive: end },
  };
  const coverageFor = (b: typeof date_bounds.annual) => ({
    source_covers_requested_window:
      b.start_inclusive >= meta.source.start && b.end_exclusive <= addDays(meta.source.end, 1),
    replay_complete_through_as_of: true,
  });
  return {
    run_id: state.run_id,
    state_revision: state.state_revision,
    method_version: state.method_version,
    as_of,
    source_manifest_id: 'authored-contract-fixtures-v1',
    filters,
    scope_labels: {
      ward_scope: filters.ward_code ? 'selected_ward' : 'all_wards',
      source_kind: 'scenario_fixture',
    },
    date_bounds,
    coverage: {
      annual: {
        ...coverageFor(date_bounds.annual),
        is_year_to_date: year === Number(as_of.slice(0, 4)),
      },
      rolling_12m: coverageFor(date_bounds.rolling_12m),
      last_28d: coverageFor(date_bounds.last_28d),
    },
  };
}
export function makeEvidence(params: URLSearchParams, state: ReplayState, id: string): Evidence {
  const context = makeContext(params, state);
  const code = params.get('antibiotic_code') ?? 'CIP';
  const drug = meta.antibiotics.find((a) => a.code === code)!;
  const f = context.filters;
  let windows = { annual, rolling_12m: rolling, last_28d: available };
  if (code === 'TMP') windows = { annual: tmpAnnual, rolling_12m: tmpRolling, last_28d: tmp };
  if (code === 'NIT') windows = { annual: nitAnnual, rolling_12m: nitRolling, last_28d: nit };
  if (f.ward_code === 'ICU' || f.sex || f.age_min !== null || context.as_of >= '2026-09-30')
    windows = { ...windows, last_28d: suppressed };
  if (f.ward_code === 'GER' || !drug.organisms.includes(f.organism))
    windows = { annual: noTests, rolling_12m: noTests, last_28d: noTests };
  if (f.ward_code === 'PHC-N') windows = { annual: empty, rolling_12m: empty, last_28d: empty };
  if (!drug.specimens.includes(f.specimen))
    windows = { annual: notApplicable, rolling_12m: notApplicable, last_28d: notApplicable };
  return { analysis_id: id, context, antibiotic_code: code, windows };
}
export function makeComparison(
  params: URLSearchParams,
  state: ReplayState,
  id: string,
): Comparison {
  const context = makeContext(params, state);
  const a = params.get('antibiotic_a') ?? 'CIP';
  const b = params.get('antibiotic_b') ?? 'TMP';
  const window = (params.get('window') ?? 'last_28d') as Comparison['comparison']['window'];
  const base = {
    antibiotic_a: a,
    antibiotic_b: b,
    window,
    n_eligible: 54,
    n_paired: 40,
    n_missing_a: 14,
    n_missing_b: 14,
    n_missing_either: 14,
  };
  let comparison: Comparison['comparison'] = {
    ...base,
    status: 'available',
    cells: { both_s: 25, a_only_s: 5, b_only_s: 8, both_r: 2 },
    a_susceptibility_pct: 75,
    b_susceptibility_pct: 82.5,
    net_difference_pp: 7.5,
    b_only_added_pct: 20,
    at_least_one_s_pct: 95,
  };
  if (a === 'TMP' && b === 'CIP')
    comparison = {
      ...comparison,
      cells: { both_s: 25, a_only_s: 8, b_only_s: 5, both_r: 2 },
      a_susceptibility_pct: 82.5,
      b_susceptibility_pct: 75,
      net_difference_pp: -7.5,
      b_only_added_pct: 12.5,
    };
  // Static paired examples preserve each window's marginal totals. Reversal swaps
  // authored columns, rather than inferring scientific values from another view.
  const profile = (code: string) => (code === 'TMP' ? 'TMP' : code === 'NIT' ? 'NIT' : 'CIP');
  const pa = profile(a),
    pb = profile(b);
  const order = ['CIP', 'TMP', 'NIT'];
  const reversed = order.indexOf(pa) > order.indexOf(pb);
  const pair = [pa, pb].sort((x, y) => order.indexOf(x) - order.indexOf(y)).join('-');
  type PairExample = {
    cells: Comparison['comparison']['cells'];
    a: number;
    b: number;
    net: number;
    bOnly: number;
    aOnly: number;
    any: number;
  };
  const examples: Record<string, Record<string, PairExample>> = {
    last_28d: {
      'CIP-TMP': {
        cells: { both_s: 25, a_only_s: 5, b_only_s: 8, both_r: 2 },
        a: 75,
        b: 82.5,
        net: 7.5,
        bOnly: 20,
        aOnly: 12.5,
        any: 95,
      },
      'CIP-NIT': {
        cells: { both_s: 28, a_only_s: 2, b_only_s: 8, both_r: 2 },
        a: 75,
        b: 90,
        net: 15,
        bOnly: 20,
        aOnly: 5,
        any: 95,
      },
      'TMP-NIT': {
        cells: { both_s: 31, a_only_s: 2, b_only_s: 5, both_r: 2 },
        a: 82.5,
        b: 90,
        net: 7.5,
        bOnly: 12.5,
        aOnly: 5,
        any: 95,
      },
      'CIP-CIP': {
        cells: { both_s: 26, a_only_s: 4, b_only_s: 4, both_r: 6 },
        a: 75,
        b: 75,
        net: 0,
        bOnly: 10,
        aOnly: 10,
        any: 85,
      },
    },
    annual: {
      'CIP-TMP': {
        cells: { both_s: 195, a_only_s: 11, b_only_s: 25, both_r: 19 },
        a: 82.4,
        b: 88,
        net: 5.6,
        bOnly: 10,
        aOnly: 4.4,
        any: 92.4,
      },
      'CIP-NIT': {
        cells: { both_s: 200, a_only_s: 6, b_only_s: 25, both_r: 19 },
        a: 82.4,
        b: 90,
        net: 7.6,
        bOnly: 10,
        aOnly: 2.4,
        any: 92.4,
      },
      'TMP-NIT': {
        cells: { both_s: 210, a_only_s: 10, b_only_s: 15, both_r: 15 },
        a: 88,
        b: 90,
        net: 2,
        bOnly: 6,
        aOnly: 4,
        any: 94,
      },
      'CIP-CIP': {
        cells: { both_s: 195, a_only_s: 11, b_only_s: 11, both_r: 33 },
        a: 82.4,
        b: 82.4,
        net: 0,
        bOnly: 4.4,
        aOnly: 4.4,
        any: 86.8,
      },
    },
    rolling_12m: {
      'CIP-TMP': {
        cells: { both_s: 210, a_only_s: 13, b_only_s: 28, both_r: 29 },
        a: 79.642857,
        b: 85,
        net: 5.357143,
        bOnly: 10,
        aOnly: 4.642857,
        any: 89.642857,
      },
      'CIP-NIT': {
        cells: { both_s: 218, a_only_s: 5, b_only_s: 34, both_r: 23 },
        a: 79.642857,
        b: 90,
        net: 10.357143,
        bOnly: 12.142857,
        aOnly: 1.785714,
        any: 91.785714,
      },
      'TMP-NIT': {
        cells: { both_s: 228, a_only_s: 10, b_only_s: 24, both_r: 18 },
        a: 85,
        b: 90,
        net: 5,
        bOnly: 8.571429,
        aOnly: 3.571429,
        any: 93.571429,
      },
      'CIP-CIP': {
        cells: { both_s: 210, a_only_s: 13, b_only_s: 13, both_r: 44 },
        a: 79.642857,
        b: 79.642857,
        net: 0,
        bOnly: 4.642857,
        aOnly: 4.642857,
        any: 84.285714,
      },
    },
  };
  const example = examples[window][pair] ?? examples[window]['CIP-CIP'];
  const totals =
    window === 'annual'
      ? { eligible: 258, paired: 250, missing: 8 }
      : window === 'rolling_12m'
        ? { eligible: 290, paired: 280, missing: 10 }
        : { eligible: 54, paired: 40, missing: 14 };
  comparison = {
    ...comparison,
    n_eligible: totals.eligible,
    n_paired: totals.paired,
    n_missing_a: totals.missing,
    n_missing_b: totals.missing,
    n_missing_either: totals.missing,
    cells: reversed
      ? { ...example.cells, a_only_s: example.cells.b_only_s, b_only_s: example.cells.a_only_s }
      : example.cells,
    a_susceptibility_pct: reversed ? example.b : example.a,
    b_susceptibility_pct: reversed ? example.a : example.b,
    net_difference_pp: reversed ? -example.net : example.net,
    b_only_added_pct: reversed ? example.aOnly : example.bOnly,
    at_least_one_s_pct: example.any,
  };
  const sparseRecent =
    (context.filters.ward_code === 'ICU' ||
      context.filters.sex ||
      context.filters.age_min !== null ||
      context.as_of >= '2026-09-30') &&
    window === 'last_28d';
  if (sparseRecent || ((a === 'MEC' || b === 'MEC') && window === 'last_28d'))
    comparison = {
      ...comparison,
      status: 'insufficient_data',
      n_eligible: sparseRecent ? 34 : totals.eligible,
      n_paired: 26,
      n_missing_a: sparseRecent ? 5 : totals.missing,
      n_missing_b: sparseRecent ? 5 : totals.missing,
      n_missing_either: sparseRecent ? 8 : totals.eligible - 26,
      cells: { both_s: 17, a_only_s: 3, b_only_s: 4, both_r: 2 },
      a_susceptibility_pct: null,
      b_susceptibility_pct: null,
      net_difference_pp: null,
      b_only_added_pct: null,
      at_least_one_s_pct: null,
    };
  const drugs = [a, b].map((c) => meta.antibiotics.find((d) => d.code === c)!);
  const noTestsStatus =
    drugs.some((d) => !d.organisms.includes(context.filters.organism)) ||
    context.filters.ward_code === 'GER';
  const incompatible = drugs.some((d) => !d.specimens.includes(context.filters.specimen));
  if (noTestsStatus || incompatible || context.filters.ward_code === 'PHC-N') {
    const eligible =
      noTestsStatus && !incompatible && context.filters.ward_code !== 'PHC-N' ? 34 : 0;
    comparison = {
      ...comparison,
      status: incompatible
        ? 'not_applicable'
        : context.filters.ward_code === 'PHC-N'
          ? 'empty_cohort'
          : 'no_tests',
      n_eligible: eligible,
      n_paired: 0,
      n_missing_a: eligible,
      n_missing_b: eligible,
      n_missing_either: eligible,
      cells: { both_s: 0, a_only_s: 0, b_only_s: 0, both_r: 0 },
      a_susceptibility_pct: null,
      b_susceptibility_pct: null,
      net_difference_pp: null,
      b_only_added_pct: null,
      at_least_one_s_pct: null,
    };
  }
  return { analysis_id: id, context, comparison };
}
export const flag: ReviewFlag = {
  id: 'review-ecoli-cip',
  organism: 'Escherichia coli',
  specimen: 'urine',
  antibiotic_code: 'CIP',
  cohort_label: 'Urology · urine · all sexes · all ages',
  status: 'new',
  change_pp: 12.5,
  n_recent: 40,
  n_baseline: 120,
  detected_on: '2026-09-27',
};
// Call once at detection. Later requests serve this stored analysis unchanged.
export function makeInvestigation(detectionState: ReplayState, id: string): Investigation {
  const context = makeContext(
    new URLSearchParams({
      ward_code: 'URO',
      as_of: flag.detected_on,
      organism: 'Escherichia coli',
      specimen: 'urine',
      calendar_year: '2026',
    }),
    detectionState,
  );
  return {
    analysis_id: id,
    context,
    alert: flag,
    baseline_bounds: { start_inclusive: '2025-08-31', end_exclusive: '2026-08-31' },
    recent: available,
    baseline: {
      status: 'available',
      n_eligible: 128,
      n_tested: 120,
      n_s: 105,
      n_r: 15,
      n_not_tested: 8,
      susceptibility_pct: 87.5,
      resistance_pct: 12.5,
      ci95: {
        susceptibility: { lower: 80.4, upper: 92.3 },
        resistance: { lower: 7.7, upper: 19.6 },
      },
    },
    rule: { version: 'resistance-rise-v1', threshold_pp: 10, minimum_tested: 30 },
    composition: [
      { label: 'Under 40', recent_count: 5, baseline_count: 24 },
      { label: '40–59', recent_count: 8, baseline_count: 29 },
      { label: '60–79', recent_count: 15, baseline_count: 49 },
      { label: '80 and older', recent_count: 26, baseline_count: 26 },
    ],
    chronology: [
      {
        date: '2026-08-30',
        title: 'Baseline period closes',
        detail: '120 tested isolates in the preceding 12 calendar months.',
      },
      {
        date: '2026-08-31',
        title: 'Recent observation window opens',
        detail: 'A separate, non-overlapping 28-day window.',
      },
      {
        date: '2026-09-27',
        title: 'Change flagged for review',
        detail: 'Resistance increased by 12.5 percentage points in this authored scenario.',
      },
    ],
    notes: [
      'The share of eligible isolates from patients aged 80 and older is greater in the recent period. This is a descriptive association, not an explanation of the change.',
      'This scenario is authored for interface testing. It is not a finding calculated from the supplied microbiology dataset.',
      'No diagnoses, medication, clinical outcomes or result-release timestamps are available.',
    ],
  };
}
export function makeHistory(
  patient: string,
  cutoff: string,
  state: ReplayState,
  id: string,
): History {
  const context = makeContext(new URLSearchParams({ as_of: cutoff }), state);
  const cultures: History['cultures'] =
    patient === 'P-00142'
      ? [
          {
            culture_id: 'C-09271',
            sample_date: '2026-09-27',
            specimen: 'urine',
            ward: 'Urology',
            result: 'Positive culture',
            isolates: [],
          },
          {
            culture_id: 'C-08412',
            sample_date: '2026-08-14',
            specimen: 'urine',
            ward: 'Urology',
            result: 'Positive culture',
            isolates: [
              {
                isolate_id: 'I-08412',
                organism: 'Escherichia coli',
                phenotypes: ['ESBL phenotype'],
                tests: [
                  { antibiotic_code: 'CIP', label: 'Ciprofloxacin', result: 'R', screening: false },
                  { antibiotic_code: 'TMP', label: 'Trimethoprim', result: 'S', screening: false },
                  {
                    antibiotic_code: 'NIT',
                    label: 'Nitrofurantoin',
                    result: 'S',
                    screening: false,
                  },
                ],
              },
            ],
          },
          {
            culture_id: 'C-06103',
            sample_date: '2026-06-03',
            specimen: 'blood',
            ward: 'Emergency department',
            result: 'No growth',
            isolates: [],
          },
          {
            culture_id: 'C-02118',
            sample_date: '2026-02-18',
            specimen: 'wound',
            ward: 'Surgery',
            result: 'Positive culture',
            isolates: [
              {
                isolate_id: 'I-02118',
                organism: 'Staphylococcus aureus',
                phenotypes: [],
                tests: [
                  { antibiotic_code: 'FOX', label: 'Cefoxitin', result: 'S', screening: true },
                  { antibiotic_code: 'CLI', label: 'Clindamycin', result: 'S', screening: false },
                ],
              },
            ],
          },
        ]
      : [];
  return {
    analysis_id: id,
    context,
    patient_id: patient,
    lookback_start: previousYear(cutoff),
    cutoff,
    cultures: cultures.filter(
      (c) => c.sample_date < cutoff && c.sample_date >= previousYear(cutoff),
    ),
  };
}
