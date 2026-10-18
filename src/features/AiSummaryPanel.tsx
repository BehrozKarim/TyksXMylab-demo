import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api, DATA_MODE } from '../api/client';
import { LIVE_SUMMARIES } from '../api/live-summary';
import type { Evidence, ReplayState } from '../api/contracts';
import {
  Badge,
  Button,
  Drawer,
  ErrorPanel,
  Loading,
  Panel,
  SectionHeading,
} from '../components/ui';
import { rememberTrigger } from '../components/focus';

export function AiSummaryDrawer(props: Parameters<typeof AiSummaryPanel>[0]) {
  const [open, setOpen] = useState(false);
  const [requestedAnalysisId, setRequestedAnalysisId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingEvidence = useRef<Evidence | null>(null);
  return (
    <>
      <Button
        ref={trigger}
        disabled={!props.evidence}
        onClick={() => {
          rememberTrigger();
          setRequestedAnalysisId(props.evidence?.analysis_id ?? null);
          setOpen(true);
        }}
      >
        <Sparkles size={17} />{' '}
        {DATA_MODE === 'standalone' && !LIVE_SUMMARIES ? 'Report summary' : 'AI summary'}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        onClosed={() => {
          const report = pendingEvidence.current;
          pendingEvidence.current = null;
          if (report) {
            trigger.current?.focus();
            props.onEvidence(report);
          }
        }}
        title={
          DATA_MODE === 'standalone' && !LIVE_SUMMARIES ? 'Report summary' : 'AI report summary'
        }
        description="An optional explanation of the selected report, with its supporting evidence."
      >
        <AiSummaryPanel
          {...props}
          requestedAnalysisId={requestedAnalysisId}
          onEvidence={(report) => {
            pendingEvidence.current = report;
            setOpen(false);
          }}
        />
      </Drawer>
    </>
  );
}

export function AiSummaryPanel({
  evidence,
  state,
  onEvidence,
  requestedAnalysisId,
}: {
  evidence: Evidence | undefined;
  state: ReplayState;
  onEvidence: (report: Evidence) => void;
  requestedAnalysisId?: string | null;
}) {
  const [requestedBefore, setRequestedBefore] = useState(false);
  if (!evidence) return null;
  // A new analysis remounts job state. Late responses cannot attach to a new report.
  return (
    <ReportSummary
      key={evidence.analysis_id}
      evidence={evidence}
      state={state}
      onEvidence={onEvidence}
      requestedBefore={requestedBefore}
      onRequested={() => setRequestedBefore(true)}
      autoStart={requestedAnalysisId === evidence.analysis_id}
    />
  );
}

function ReportSummary({
  evidence,
  state,
  onEvidence,
  requestedBefore,
  onRequested,
  autoStart,
}: {
  evidence: Evidence;
  state: ReplayState;
  onEvidence: (report: Evidence) => void;
  requestedBefore: boolean;
  onRequested: () => void;
  autoStart: boolean;
}) {
  const client = useQueryClient();
  const jobKey = ['summary-job', evidence.analysis_id];
  const job = useQuery<string | null>({
    queryKey: jobKey,
    queryFn: () => null,
    enabled: false,
    initialData: null,
  });
  const jobId = job.data ?? undefined;
  const [polling, setPolling] = useState(true);
  const [check, setCheck] = useState(0);
  const started = useRef(false);
  const key = (id?: string) => ['summary', evidence.analysis_id, id];
  const create = useMutation({
    // Share an in-flight creation when the drawer is closed and reopened quickly.
    mutationFn: () =>
      client.fetchQuery({
        queryKey: ['summary-create', evidence.analysis_id],
        queryFn: () => api.summarize(evidence),
        staleTime: Infinity,
        retry: false,
      }),
    retry: false,
    onSuccess: (summary) => {
      client.setQueryData(key(summary.summary_id), summary);
      client.setQueryData(jobKey, summary.summary_id);
    },
  });
  const result = useQuery({
    queryKey: key(jobId),
    queryFn: ({ signal }) => api.summary(jobId!, evidence, signal),
    enabled: !!jobId,
    staleTime: Infinity,
    retry: false,
    refetchInterval: (query) =>
      polling && !query.state.error && query.state.data?.status !== 'ready' ? 1000 : false,
  });
  const ready = result.data?.status === 'ready';
  useEffect(() => {
    if (!jobId || ready) return;
    setPolling(true);
    const timer = setTimeout(() => setPolling(false), 120_000);
    return () => clearTimeout(timer);
  }, [jobId, ready, check]);
  const older =
    evidence.context.run_id !== state.run_id ||
    evidence.context.state_revision !== state.state_revision;
  const startSummary = create.mutate;
  useEffect(() => {
    if (!autoStart || older || jobId || started.current) return;
    started.current = true;
    onRequested();
    startSummary();
  }, [autoStart, older, jobId, onRequested, startSummary]);
  const waiting =
    create.isPending ||
    (autoStart && !older && !jobId && !create.error) ||
    (!!jobId && !ready && polling && !result.error);
  const summary = ready ? result.data : undefined;
  return (
    <Panel className="ai-summary" aria-label="Report summary">
      <SectionHeading
        title="Report summary"
        description="A concise explanation of the displayed saved report."
        action={<Sparkles size={20} aria-hidden="true" />}
      />
      {older && (
        <p className="inline-notice">
          This summary belongs to an older report. Updated evidence is loading.
        </p>
      )}
      {!jobId && !autoStart && (
        <Button
          variant="primary"
          disabled={create.isPending || older}
          onClick={() => {
            onRequested();
            create.mutate();
          }}
        >
          {create.isPending
            ? 'Preparing summary…'
            : requestedBefore
              ? 'Summarize updated report'
              : 'Summarize this report'}
        </Button>
      )}
      {waiting && <Loading label="Preparing the report summary…" />}
      {create.error && (
        <ErrorPanel
          error={create.error}
          onRetry={() => create.mutate()}
          title="Could not prepare summary"
        />
      )}
      {result.error && (
        <ErrorPanel
          error={result.error}
          onRetry={() => {
            setCheck((n) => n + 1);
            void result.refetch();
          }}
          title="Could not check summary status"
        />
      )}
      {!!jobId && !ready && !polling && !result.error && (
        <p className="inline-notice">
          The summary is still processing.{' '}
          <Button
            onClick={() => {
              setCheck((n) => n + 1);
              void result.refetch();
            }}
          >
            Check status
          </Button>
        </p>
      )}
      {summary && (
        <>
          <div className="summary-meta">
            <Badge tone={summary.output_mode === 'ai' ? 'violet' : 'neutral'}>
              {summary.output_mode === 'ai' ? 'AI-assisted summary' : 'Basic summary'}
            </Badge>
            <span>
              Report through {summary.as_of} · revision {summary.state_revision}
            </span>
          </div>
          <p className="summary-paragraph">{summary.paragraph}</p>
          {summary.limitations.length > 0 && (
            <div className="summary-limitations">
              <h3>Limits to interpretation</h3>
              <ul>
                {summary.limitations.map((item) => (
                  <li key={item.fact_id}>{item.text}</li>
                ))}
              </ul>
            </div>
          )}
          <details className="summary-support">
            <summary>Supporting facts and dates</summary>
            <ul>
              {[...summary.statements, ...summary.supporting_facts].map((item) => (
                <li key={item.fact_id}>{item.text}</li>
              ))}
            </ul>
            <p className="small-note">
              Generated {new Date(summary.generated_at!).toLocaleString()} for this saved report.
            </p>
          </details>
          <Button onClick={() => onEvidence(evidence)}>View evidence</Button>
        </>
      )}
    </Panel>
  );
}
