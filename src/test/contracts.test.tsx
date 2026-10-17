import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { evidenceSchema, comparisonSchema } from '../api/contracts';
import { assertContext } from '../api/client';
import { readCohort, writeCohort } from '../domain/cohort';
import { formatDate, inclusiveEnd } from '../domain/formatters';
import { initialState, meta, makeComparison, makeEvidence, makeHistory } from '../mocks/fixtures';
import { EvidenceCards } from '../features/EvidenceCards';

describe('Evidence boundary', () => {
  it('accepts the authored available contract and rejects legacy flat rows', () => {
    expect(
      evidenceSchema.safeParse(makeEvidence(new URLSearchParams(), initialState, 'test')).success,
    ).toBe(true);
    expect(evidenceSchema.safeParse({ rules_version: 'prototype-v1', rows: [] }).success).toBe(
      false,
    );
  });
  it('rejects leaked percentages in a suppressed result', () => {
    const response = makeEvidence(new URLSearchParams({ ward_code: 'ICU' }), initialState, 'test');
    response.windows.last_28d = { ...response.windows.last_28d, susceptibility_pct: 72.4 };
    expect(evidenceSchema.safeParse(response).success).toBe(false);
  });
  it('requires complete confidence intervals', () => {
    const response = makeEvidence(new URLSearchParams(), initialState, 'test');
    response.windows.last_28d = {
      ...response.windows.last_28d,
      ci95: {
        susceptibility: { lower: null, upper: 85.8 },
        resistance: { lower: 14.2, upper: 40.2 },
      },
    };
    expect(evidenceSchema.safeParse(response).success).toBe(false);
  });
  it('suppresses the paired result independently of standalone counts', () => {
    const response = makeComparison(
      new URLSearchParams({ antibiotic_a: 'CIP', antibiotic_b: 'MEC' }),
      initialState,
      'pair',
    );
    expect(comparisonSchema.parse(response).comparison.n_paired).toBe(26);
    expect(response.comparison.a_susceptibility_pct).toBeNull();
    expect(response.comparison.net_difference_pp).toBeNull();
  });
  it('rejects a late response from an old run with the same revision', () => {
    const response = makeEvidence(new URLSearchParams(), initialState, 'test');
    expect(() =>
      assertContext(response.context, { ...initialState, run_id: 'another-run' }),
    ).toThrow('snapshot changed');
  });
  it('renders a sparse card without a percentage or interval', () => {
    const response = makeEvidence(new URLSearchParams({ ward_code: 'ICU' }), initialState, 'test');
    render(<EvidenceCards evidence={response} onProvenance={() => {}} onLongerWindow={() => {}} />);
    const card = screen.getByRole('region', { name: 'Last 28 days evidence' });
    expect(card).toHaveTextContent('29 tested');
    expect(card).toHaveTextContent('Insufficient data');
    expect(card.textContent).not.toContain('%');
    expect(card.querySelector('.interval-plot')).toBeNull();
  });
  it('displays a supplied percentage exactly at 30 tested isolates', () => {
    const response = makeEvidence(new URLSearchParams(), initialState, 'threshold');
    response.windows.last_28d = {
      status: 'available',
      n_eligible: 35,
      n_tested: 30,
      n_s: 21,
      n_r: 9,
      n_not_tested: 5,
      susceptibility_pct: 70,
      resistance_pct: 30,
      ci95: {
        susceptibility: { lower: 52.1, upper: 83.3 },
        resistance: { lower: 16.7, upper: 47.9 },
      },
    };
    render(
      <EvidenceCards
        evidence={evidenceSchema.parse(response)}
        onProvenance={() => {}}
        onLongerWindow={() => {}}
      />,
    );
    expect(screen.getByRole('region', { name: 'Last 28 days evidence' })).toHaveTextContent('70.0');
  });
  it('keeps authored paired examples consistent with their marginal counts', () => {
    for (const window of ['annual', 'rolling_12m', 'last_28d'])
      for (const [a, b] of [
        ['CIP', 'TMP'],
        ['TMP', 'NIT'],
        ['NIT', 'CIP'],
      ]) {
        const pair = makeComparison(
          new URLSearchParams({ antibiotic_a: a, antibiotic_b: b, window }),
          initialState,
          'pair',
        ).comparison;
        const standalone = makeEvidence(
          new URLSearchParams({ antibiotic_code: a }),
          initialState,
          'single',
        ).windows[window as 'annual']!;
        expect(pair.n_eligible).toBe(standalone.n_eligible);
        expect(pair.cells.both_s + pair.cells.a_only_s).toBe(standalone.n_s);
      }
  });
});
describe('Context and display', () => {
  it('round-trips explicit all-wards selection and empty comparison', () => {
    const { query } = readCohort(
      new URLSearchParams('ward_code=&antibiotic_b='),
      meta,
      initialState,
    );
    expect(query.ward_code).toBeNull();
    expect(query.antibiotic_b).toBe('');
    const parsed = readCohort(writeCohort(query, true), meta, initialState);
    expect(parsed.query).toEqual(query);
    expect(parsed.pinned).toBe(true);
  });
  it('reports malformed filters and inverted ages visibly', () => {
    const result = readCohort(
      new URLSearchParams('ward_code=BOGUS&age_min=80&age_max=20&as_of=2026-02-31'),
      meta,
      initialState,
    );
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.query.age_min).toBeNull();
    expect(result.query.as_of).toBe(initialState.demo_date);
  });
  it('formats date-only values without a timezone shift', () => {
    expect(formatDate('2026-09-27')).toBe('27 Sept 2026');
    expect(inclusiveEnd('2026-09-28')).toBe('2026-09-27');
  });
  it('receives all prior specimen types and excludes the cutoff-date specimen', () => {
    const h = makeHistory('P-00142', '2026-09-27', initialState, 'history');
    expect(h.cultures.map((c) => c.specimen)).toEqual(['urine', 'blood', 'wound']);
    expect(h.cultures.some((c) => c.sample_date >= '2026-09-27')).toBe(false);
  });
  it('reports incomplete source periods separately from sample support', () => {
    const response = makeEvidence(
      new URLSearchParams({ calendar_year: '2023' }),
      initialState,
      'test',
    );
    expect(response.windows.annual!.status).toBe('available');
    expect(response.context.coverage.annual.source_covers_requested_window).toBe(false);
    expect(response.context.coverage.annual.is_year_to_date).toBe(false);
  });
});
