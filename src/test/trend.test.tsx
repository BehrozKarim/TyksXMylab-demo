import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SusceptibilityTimeChart } from '../features/SusceptibilityTimeChart';
import { trendPoints } from './trend-fixtures';

it('labels axes and coverage without plotting suppressed estimates at zero or connecting gaps', () => {
  const points = [trendPoints[7], trendPoints[0], trendPoints[8]];
  const { container } = render(
    <SusceptibilityTimeChart points={points} antibiotic="Ciprofloxacin" year={2026} />,
  );
  expect(screen.getByText('Susceptibility (%)')).toBeVisible();
  expect(screen.getByText('28-day period ending · 2026')).toBeVisible();
  expect(screen.getByText('Ciprofloxacin')).toBeVisible();
  expect(screen.getByText('Estimates available for 2 of 3 cutoffs')).toBeVisible();
  expect(container.querySelectorAll('.trend-point')).toHaveLength(2);
  expect(container.querySelectorAll('.trend-line')).toHaveLength(2);
  for (const path of container.querySelectorAll('.trend-line'))
    expect(path.getAttribute('d')).not.toContain('L');
  expect(container.querySelector('.trend-gap')).toBeNull();
  expect(screen.queryByText('<30 tests')).not.toBeInTheDocument();
});

it('exposes exact counts and distinct missing reasons on focus, click and point hover', () => {
  const { container, rerender } = render(
    <SusceptibilityTimeChart points={trendPoints} antibiotic="Ciprofloxacin" year={2026} />,
  );
  for (const [reason, count] of [
    ['Below reporting threshold', 29],
    ['No tests recorded', 0],
    ['No eligible isolates', 0],
    ['Not applicable', 0],
  ] as const) {
    const button = screen.getAllByRole('button', { name: new RegExp(reason) })[0];
    fireEvent.focus(button);
    expect(screen.getByRole('status')).toHaveTextContent(reason);
    expect(screen.getByRole('status')).toHaveTextContent(`${count} tested isolates`);
  }
  fireEvent.click(screen.getByRole('button', { name: /31 Aug 2026/ }));
  expect(screen.getByRole('status')).toHaveTextContent('75.0% susceptible');
  fireEvent.pointerEnter(container.querySelector('.trend-point')!);
  expect(screen.getByRole('status')).toHaveTextContent('40 tested isolates');
  rerender(
    <SusceptibilityTimeChart
      points={trendPoints.map((p) => ({ ...p, analysis_id: `new-${p.analysis_id}` }))}
      antibiotic="Ciprofloxacin"
      year={2026}
    />,
  );
  expect(screen.getByRole('status')).not.toHaveTextContent('75.0%');
});
