import { notifyExport } from '../components/export-notifications';
import { useState } from 'react';
import { Download, FileJson, Fingerprint } from 'lucide-react';
import type { Analysis, Meta, WindowKey } from '../api/contracts';
import { api } from '../api/client';
import { Badge, Button, Drawer } from '../components/ui';
import { cohortLabel, formatDate, formatRange, windowLabels } from '../domain/formatters';
export function ProvenanceDrawer({
  analysis,
  window,
  meta,
  onClose,
}: {
  analysis: Analysis | null;
  window?: WindowKey;
  meta: Meta;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const download = async (format: 'csv' | 'json') => {
    if (!analysis) return;
    setPending(true);
    setError('');
    try {
      await api.export(analysis.analysis_id, format);
      notifyExport(format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const c = analysis?.context;
  return (
    <Drawer
      open={!!analysis}
      onClose={onClose}
      title="Behind the evidence"
      description="Calculation context and an export of the exact snapshot you opened."
    >
      {analysis && c && (
        <>
          <div className="provenance-intro">
            <Fingerprint size={26} />
            <div>
              <Badge tone="violet">Frozen analysis</Badge>
              <h3>{window ? windowLabels[window] : 'Evidence snapshot'}</h3>
              <p>Samples through {formatDate(c.as_of, 'long')}</p>
            </div>
          </div>
          <div className="drawer-section">
            <h3>Applied population</h3>
            <p>{cohortLabel(c.filters, meta)}</p>
            {'antibiotic_code' in analysis && (
              <p>
                Antibiotic: <strong>{analysis.antibiotic_code}</strong>
              </p>
            )}
            {'comparison' in analysis && (
              <p>
                Paired antibiotics:{' '}
                <strong>
                  {analysis.comparison.antibiotic_a} / {analysis.comparison.antibiotic_b}
                </strong>
              </p>
            )}
          </div>
          <div className="drawer-section">
            <h3>Reporting periods</h3>
            {(window
              ? [window]
              : 'comparison' in analysis
                ? [analysis.comparison.window]
                : (meta.supported_windows ?? (['rolling_12m', 'last_28d'] as WindowKey[]))
            ).map((key) => (
              <div className="provenance-period" key={key}>
                <strong>{windowLabels[key]}</strong>
                <span>{formatRange(c.date_bounds[key])}</span>
                <code>
                  [{c.date_bounds[key].start_inclusive}, {c.date_bounds[key].end_exclusive})
                </code>
                <Badge
                  tone={c.coverage[key].source_covers_requested_window ? 'success' : 'warning'}
                >
                  {c.coverage[key].source_covers_requested_window
                    ? 'Imported date span covers this period'
                    : 'Partial imported-dataset coverage'}
                </Badge>
                <Badge tone={c.coverage[key].replay_complete_through_as_of ? 'neutral' : 'warning'}>
                  {c.coverage[key].replay_complete_through_as_of
                    ? 'Dataset import complete'
                    : 'Dataset import incomplete'}
                </Badge>
                {c.coverage[key].includes_feed_data && <Badge>Includes feed data</Badge>}
              </div>
            ))}
          </div>
          {c.mode === 'feed' && (
            <div className="drawer-section">
              <h3>Feed provenance</h3>
              <p>{c.feed_source_label ?? c.feed_source_id ?? 'External feed'}</p>
              <p>
                {c.clock_mode === 'wall_utc' ? 'UTC reporting clock' : 'Simulated reporting clock'}
              </p>
              <p className="small-note">
                File hashes and coverage describe the imported seed dataset only. They do not
                certify completeness of the external feed.
              </p>
              {c.feed_data_digest && (
                <p className="small-note">Feed digest: {c.feed_data_digest}</p>
              )}
            </div>
          )}
          <div className="drawer-section">
            <h3>How counts are formed</h3>
            <ol className="method-list">
              <li>Resolve the latest visible isolate revisions.</li>
              <li>
                Keep the first isolate per patient, organism and specimen in each period,
                {c.filters.dedup_scope === 'selected_cohort'
                  ? ' within the selected ward.'
                  : ' across wards before applying the ward filter.'}
              </li>
              <li>Apply the selected ward and population filters.</li>
              <li>
                Use only isolates tested for the selected antibiotic. Paired comparisons require
                both tests.
              </li>
              <li>Hide percentages and intervals below {meta.minimum_tested} tested isolates.</li>
            </ol>
            <p className="small-note">
              Intervals: {meta.interval_method}. Missing tests do not imply resistance. Full source
              and demographic completeness metadata are included in the saved API export.
            </p>
          </div>
          <dl className="provenance-meta">
            <div>
              <dt>Imported dataset dates</dt>
              <dd>
                {formatDate(meta.source.start)} – {formatDate(meta.source.end)}
              </dd>
            </div>
            <div>
              <dt>Source manifest</dt>
              <dd>{c.source_manifest_id}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{c.method_version}</dd>
            </div>
            <div>
              <dt>Run / revision</dt>
              <dd>
                {c.run_id} / {c.state_revision}
              </dd>
            </div>
            <div>
              <dt>Analysis ID</dt>
              <dd>{analysis.analysis_id}</dd>
            </div>
          </dl>
          <div className="export-box">
            <h3>Export this snapshot</h3>
            <p>
              Downloads retain the values, nulls, filters and revision displayed here, even after
              replay advances.
            </p>
            <div className="export-actions">
              <Button disabled={pending} variant="primary" onClick={() => void download('csv')}>
                <Download size={16} />
                Download CSV
              </Button>
              <Button disabled={pending} onClick={() => void download('json')}>
                <FileJson size={16} />
                Download JSON
              </Button>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error} Use the same download button to retry.
              </p>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
