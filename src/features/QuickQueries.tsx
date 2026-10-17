import { useState } from 'react';
import { ArrowRight, Bookmark, Plus, X } from 'lucide-react';
import { z } from 'zod';
import type { CohortQuery, Meta, ReplayState } from '../api/contracts';
import { Button, Drawer, EmptyState } from '../components/ui';
import { rememberTrigger } from '../components/focus';
import { readCohort, writeCohort } from '../domain/cohort';
import { cohortLabel, drugLabel, formatDate } from '../domain/formatters';

const storageKey = 'ward-evidence:saved-queries:v1';
const savedSchema = z
  .array(
    z.object({ id: z.string(), name: z.string().min(1).max(80), search: z.string().max(2000) }),
  )
  .max(12);
type SavedQuery = z.infer<typeof savedSchema>[number];
function readSaved(): SavedQuery[] {
  try {
    return savedSchema.parse(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
  } catch {
    return [];
  }
}

export function QuickQueries({
  query,
  pinned,
  meta,
  state,
  onApply,
}: {
  query: CohortQuery;
  pinned: boolean;
  meta: Meta;
  state: ReplayState;
  onApply: (query: CohortQuery, pinned?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(readSaved);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const persist = (next: SavedQuery[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setError('');
      return true;
    } catch {
      setError('This browser could not save the query. Check its storage settings.');
      return false;
    }
  };
  const save = () => {
    const search = writeCohort(query, pinned).toString();
    const existing = saved.find((entry) => entry.search === search);
    if (!name.trim()) {
      setError('Enter a name for this query.');
      return;
    }
    if (saved.length >= 12 && !existing) {
      setError('You can save up to 12 queries. Remove one to make space.');
      return;
    }
    const entry = { id: existing?.id ?? crypto.randomUUID(), name: name.trim(), search };
    if (persist([entry, ...saved.filter((item) => item.id !== entry.id)]))
      setNotice('Query saved. Open it below to restore this selection.');
  };
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="saved-query-trigger"
        onClick={() => {
          rememberTrigger();
          setSaved(readSaved());
          setError('');
          setNotice('');
          setName(
            `${meta.wards.find((ward) => ward.code === query.ward_code)?.label ?? 'All wards'} · ${query.antibiotic_code}`,
          );
          setOpen(true);
        }}
      >
        <Bookmark size={15} /> Saved queries
        {saved.length > 0 && <span className="count-badge">{saved.length}</span>}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Saved queries"
        description="Reopen a frequently used selection. Saved queries are available in this browser."
      >
        <div className="query-save-card">
          <h3>Save this selection</h3>
          <p>
            {cohortLabel(query, meta)} · {drugLabel(query.antibiotic_code, meta)}
          </p>
          <p className="small-note">
            {pinned
              ? `Pinned to ${formatDate(query.as_of)}`
              : 'Follows the latest published samples'}
          </p>
          <label className="field">
            <span>Query name</span>
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <Button type="button" variant="primary" onClick={save}>
            <Plus size={16} />
            Save query
          </Button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="inline-notice">
            {notice}
          </p>
        )}
        <div className="saved-query-list">
          {saved.length === 0 ? (
            <EmptyState title="Your common queries, one place">
              Save a selection to avoid setting the same filters again.
            </EmptyState>
          ) : (
            saved.map((entry) => {
              const selected = readCohort(new URLSearchParams(entry.search), meta, state);
              return (
                <div className="saved-query-row" key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selected.issues.length) {
                        setError(
                          'This saved query no longer matches the available data. Update the selection and save it again.',
                        );
                        return;
                      }
                      onApply(selected.query, selected.pinned);
                      setOpen(false);
                    }}
                  >
                    <strong>{entry.name}</strong>{' '}
                    <span>
                      {selected.pinned
                        ? `Pinned to ${formatDate(selected.query.as_of)}`
                        : 'Latest published samples'}{' '}
                      · {selected.query.antibiotic_code}
                    </span>
                    <ArrowRight size={17} />
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="icon-button"
                    aria-label={`Remove ${entry.name}`}
                    onClick={() => {
                      persist(saved.filter((item) => item.id !== entry.id));
                      setNotice('');
                    }}
                  >
                    <X size={16} />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Drawer>
    </>
  );
}
