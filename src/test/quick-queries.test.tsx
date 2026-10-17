import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QuickQueries } from '../features/QuickQueries';
import { defaults } from '../domain/cohort';
import { initialState, meta } from '../mocks/fixtures';

const query = {
  ...defaults,
  as_of: initialState.demo_date,
  ward_code: null,
  sex: 'F' as const,
  age_min: 65,
};
const storageKey = 'ward-evidence:saved-queries:v1';
beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function openAndSave() {
  fireEvent.click(screen.getByRole('button', { name: /Saved queries/ }));
  fireEvent.change(screen.getByLabelText('Query name'), {
    target: { value: 'My usual population' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
}

it('restores all-ward and population filters and follows the new publication date', () => {
  const onApply = vi.fn();
  const view = render(
    <QuickQueries
      query={query}
      pinned={false}
      meta={meta}
      state={initialState}
      onApply={onApply}
    />,
  );
  openAndSave();
  const latest = { ...initialState, demo_date: '2026-09-28', state_revision: 9 };
  view.rerender(
    <QuickQueries
      query={{ ...query, ward_code: 'ICU', sex: null }}
      pinned={false}
      meta={meta}
      state={latest}
      onApply={onApply}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Saved queries/ }));
  fireEvent.click(
    screen.getByRole('button', { name: /My usual population Latest published samples/ }),
  );
  expect(onApply).toHaveBeenCalledExactlyOnceWith({ ...query, as_of: '2026-09-28' }, false);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const persisted = localStorage.getItem(storageKey)!;
  expect(persisted).not.toContain('patient_id');
  expect(persisted).not.toContain('analysis_id');
});

it('preserves a pinned date and can remove a saved query after reopening', () => {
  const onApply = vi.fn();
  const pinned = { ...query, as_of: '2026-09-20', antibiotic_b: '' };
  render(<QuickQueries query={pinned} pinned meta={meta} state={initialState} onApply={onApply} />);
  openAndSave();
  fireEvent.click(screen.getByRole('button', { name: /Saved queries/ }));
  fireEvent.click(screen.getByRole('button', { name: /My usual population Pinned to/ }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith(pinned, true);
  fireEvent.click(screen.getByRole('button', { name: /Saved queries/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove My usual population' }));
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([]);
});

it('does not silently substitute unavailable selections in a saved query', () => {
  const onApply = vi.fn();
  const selected = { ...query, ward_code: 'ICU' };
  const view = render(
    <QuickQueries
      query={selected}
      pinned={false}
      meta={meta}
      state={initialState}
      onApply={onApply}
    />,
  );
  openAndSave();
  view.rerender(
    <QuickQueries
      query={query}
      pinned={false}
      meta={{ ...meta, wards: meta.wards.filter((ward) => ward.code !== 'ICU') }}
      state={initialState}
      onApply={onApply}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Saved queries/ }));
  fireEvent.click(
    screen.getByRole('button', { name: /My usual population Latest published samples/ }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent('no longer matches');
  expect(onApply).not.toHaveBeenCalled();
});

it('handles unavailable browser storage without claiming the query was saved', () => {
  localStorage.setItem(storageKey, '{invalid');
  render(
    <QuickQueries
      query={query}
      pinned={false}
      meta={meta}
      state={initialState}
      onApply={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Saved queries/ }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save query' }));
  expect(screen.getByRole('alert')).toHaveTextContent('could not save');
  expect(screen.queryByText(/Query saved/)).not.toBeInTheDocument();
});
