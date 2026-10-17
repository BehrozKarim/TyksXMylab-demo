import { useState } from 'react';
import { ArrowRight, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { CohortQuery, Meta } from '../api/contracts';
import { Button, Select } from '../components/ui';
import { defaults } from '../domain/cohort';

export function CohortControls({
  query,
  meta,
  onApply,
  onCancel,
}: {
  query: CohortQuery;
  meta: Meta;
  onApply: (q: CohortQuery) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(query);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CohortQuery>(key: K, value: CohortQuery[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const active = [draft.sex, draft.age_min, draft.age_max].filter((v) => v !== null).length;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      (draft.age_min !== null && (draft.age_min < 0 || draft.age_min > 120)) ||
      (draft.age_max !== null && (draft.age_max < 0 || draft.age_max > 120)) ||
      (draft.age_min !== null && draft.age_max !== null && draft.age_min > draft.age_max)
    ) {
      setError('Enter valid ages from 0 to 120, with minimum no greater than maximum.');
      setAdvanced(true);
      return;
    }
    setError('');
    onApply({
      ...draft,
      antibiotic_b: draft.antibiotic_b === draft.antibiotic_code ? '' : draft.antibiotic_b,
    });
  };
  return (
    <form className="cohort-panel" onSubmit={submit} aria-label="Select evidence cohort">
      <div className="filter-grid">
        <Select
          id="ward"
          label="Ward"
          value={draft.ward_code ?? ''}
          onChange={(e) => set('ward_code', e.target.value || null)}
        >
          <option value="">All wards</option>
          {meta.wards.map((w) => (
            <option key={w.code} value={w.code}>
              {w.label}
            </option>
          ))}
        </Select>
        <Select
          id="specimen"
          label="Specimen"
          value={draft.specimen}
          onChange={(e) => set('specimen', e.target.value as CohortQuery['specimen'])}
        >
          {meta.specimens.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </Select>
        <Select
          id="organism"
          label="Organism"
          value={draft.organism}
          onChange={(e) => set('organism', e.target.value)}
        >
          {meta.organisms.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
        <Select
          id="antibiotic"
          label="Primary antibiotic"
          value={draft.antibiotic_code}
          onChange={(e) => set('antibiotic_code', e.target.value)}
        >
          {meta.antibiotics.map((a) => (
            <option key={a.code} value={a.code} disabled={!a.specimens.includes(draft.specimen)}>
              {a.label}
              {!a.specimens.includes(draft.specimen)
                ? ' · specimen not applicable'
                : !a.organisms.includes(draft.organism)
                  ? ' · not in imported test panels'
                  : ''}
            </option>
          ))}
        </Select>
      </div>
      {advanced && (
        <div id="advanced-filters" className="advanced-filters">
          <Select
            id="dedup-scope"
            label="First isolate selection"
            value={draft.dedup_scope ?? 'selected_cohort'}
            onChange={(e) => set('dedup_scope', e.target.value as CohortQuery['dedup_scope'])}
          >
            <option value="selected_cohort">Within selected ward</option>
            <option value="all_wards">Across all wards first</option>
          </Select>
          <Select
            id="sex"
            label="Sex"
            value={draft.sex ?? ''}
            onChange={(e) => set('sex', (e.target.value || null) as CohortQuery['sex'])}
          >
            <option value="">All sexes</option>
            {meta.sexes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </Select>
          {(['age_min', 'age_max'] as const).map((key) => (
            <label className="field" key={key}>
              <span>{key === 'age_min' ? 'Minimum age' : 'Maximum age'}</span>
              <input
                type="number"
                min="0"
                max="120"
                step="1"
                value={draft[key] ?? ''}
                placeholder="Any"
                aria-invalid={!!error}
                aria-describedby={error ? 'age-error' : undefined}
                onChange={(e) => set(key, e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
          ))}
          {error && (
            <p id="age-error" role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="filter-bottom">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={advanced}
          aria-controls="advanced-filters"
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={15} />
          Population filters{active > 0 && <span className="count-badge">{active}</span>}
        </Button>
        <span className="filter-current" title="Applied only after clicking Apply cohort">
          {draft.sex === 'F' ? 'Women' : draft.sex === 'M' ? 'Men' : 'All sexes'}
          <span className="separator-dot">·</span>
          {draft.age_min !== null || draft.age_max !== null
            ? `Ages ${draft.age_min ?? 0}–${draft.age_max ?? '120+'}`
            : 'All ages'}
        </span>
        <Button
          variant="ghost"
          type="button"
          className="reset-filter"
          onClick={() => {
            const next = { ...query, ...defaults, calendar_year: query.calendar_year };
            setDraft(next);
            onApply(next);
            setError('');
          }}
        >
          <RotateCcw size={14} />
          Reset filters
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" className="apply-button">
          Apply cohort <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
