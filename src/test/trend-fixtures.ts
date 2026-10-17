import type { WindowMeasure } from '../api/contracts';
import { available, empty, initialState, makeEvidence, noTests } from '../mocks/fixtures';
import { trendDates } from '../domain/trend';

const low: WindowMeasure = {
  ...noTests,
  status: 'insufficient_data',
  n_eligible: 29,
  n_tested: 29,
  n_s: 20,
  n_r: 9,
  n_not_tested: 0,
};
const measures: WindowMeasure[] = [
  low,
  noTests,
  empty,
  { ...empty, status: 'not_applicable' },
  low,
  low,
  low,
  available,
  available,
];
// Authored browser/unit examples only; never used by the API-backed application.
export const trendPoints = trendDates(2026, initialState.demo_date, '2026-01-01').map(
  (as_of, i) => {
    const evidence = makeEvidence(new URLSearchParams({ as_of }), initialState, `trend-${i}`);
    return { ...evidence, windows: { ...evidence.windows, last_28d: measures[i] } };
  },
);
