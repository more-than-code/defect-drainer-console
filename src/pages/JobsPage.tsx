/**
 * Batch coding-agent jobs listing — ListPage + AdminDataGrid.
 * All action interactions use modals (detail / confirm), not inline-only UI.
 */
import CallMergeIcon from '@mui/icons-material/CallMerge';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import {
  api,
  type BatchJob,
  type BatchJobPr,
  type BatchJobVerification,
  type DiffHunk,
  type DiffHunksResponse,
  type DiffHygieneReport,
  type VerifyResult,
  type BatchRecord,
} from '../api';
import {
  AdminDataGrid,
  cellTextClamp2,
} from '../components/AdminDataGrid';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilterSelect } from '../components/FilterSelect';
import { ListPage } from '../components/ListPage';
import { LoadingState } from '../components/LoadingState';
import { SearchField } from '../components/SearchField';
import {
  createStatusColor,
  ghStateColor,
  isTrackablePr,
  prsStale,
  summarizePrs,
} from '../prStatus';

type JobAction = 'stop' | 'resume' | 'rerun' | 'create-pr' | 'delete';

function shortBatchId(id: string): string {
  const i = id.lastIndexOf('-');
  if (i <= 0) return id;
  return id.slice(i + 1);
}

function jobStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'running' || status === 'queued') return 'info';
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'warning';
  if (status === 'manual') return 'default';
  return 'default';
}

function manifestStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'in_progress') return 'info';
  if (status === 'complete') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'cancelled') return 'warning';
  return 'default';
}

function canStop(j: BatchJob) {
  return j.status === 'running' || j.status === 'queued';
}
// Restart rules live on the server (resumable / rerunnable); a job object
// without them — e.g. an action response — offers neither until reloaded.
function canResume(j: BatchJob) {
  return j.resumable?.ok === true;
}
function canRerun(j: BatchJob) {
  return j.rerunnable?.ok === true;
}
function restartTooltip(label: string, check?: BatchJob['resumable']) {
  return check && !check.ok && check.reason
    ? `${label} — ${check.reason}`
    : label;
}
function canCreatePr(j: BatchJob) {
  return (
    (j.worktrees?.length ?? 0) > 0 &&
    j.status !== 'running' &&
    j.status !== 'queued'
  );
}

function canRefreshPrs(j: BatchJob) {
  return (j.prs || []).some(isTrackablePr);
}

function formatMergedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.slice(0, 10);
  return d || iso;
}

/**
 * Operator-defined checks DD re-ran after the agent exited. A failing row is
 * why a defect stayed open, so the failing output must be visible here — not
 * buried in the log or in verify.json on disk.
 */
/** Same verdict rule as the backend's judgeVerification. */
function verdictOf(
  r: VerifyResult,
  baseline: BatchJobVerification | undefined,
): 'pass' | 'regression' | 'pre-existing' | 'blocked' {
  if (r.ok) return 'pass';
  if (r.skipped_reason) return 'blocked';
  if (!baseline?.ran) return 'blocked';
  const before = baseline.results.find(
    (b) => b.repo === r.repo && b.command === r.command,
  );
  if (!before || before.skipped_reason) return 'blocked';
  return before.ok ? 'regression' : 'pre-existing';
}

/** Monospace hunk view: removals then additions, coloured like a diff. */
function HunkView({ h }: { h: DiffHunk }) {
  return (
    <Box
      sx={{
        mt: 0.75,
        p: 1,
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontSize: 11,
        fontFamily: 'ui-monospace, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      <Box sx={{ color: 'text.secondary' }}>
        {h.file} {h.header}
      </Box>
      {h.removed.map((l, i) => (
        <Box key={`r${i}`} sx={{ color: 'error.main' }}>{`- ${l}`}</Box>
      ))}
      {h.added.map((l, i) => (
        <Box key={`a${i}`} sx={{ color: 'success.main' }}>{`+ ${l}`}</Box>
      ))}
    </Box>
  );
}

/**
 * Advisory: reformatting is messy, not wrong, so it never blocks a resolve —
 * but a diff that is mostly reflow hides the real change from review. The
 * hunks are fetched on demand; diffs are not stored on the job.
 */
function DiffHygienePanel({
  d,
  jobId,
}: {
  d: DiffHygieneReport;
  jobId: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<Record<string, DiffHunksResponse>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  const rows = d.repos.filter((r) => r.changedLines > 0 || r.error);
  if (!rows.length) return null;

  async function toggle(repo: string) {
    const next = !open[repo];
    setOpen((p) => ({ ...p, [repo]: next }));
    if (!next || data[repo] || busy[repo]) return;
    setBusy((p) => ({ ...p, [repo]: true }));
    try {
      const res = await api<DiffHunksResponse>(
        `/api/batch-jobs/${encodeURIComponent(jobId)}/diff/${encodeURIComponent(repo)}?kind=reflow`,
      );
      setData((p) => ({ ...p, [repo]: res }));
      setErr((p) => ({ ...p, [repo]: '' }));
    } catch (e) {
      setErr((p) => ({ ...p, [repo]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy((p) => ({ ...p, [repo]: false }));
    }
  }

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">Diff hygiene</Typography>
        {d.noisy ? (
          <Chip size="small" color="warning" label="mostly reformatting" />
        ) : null}
      </Stack>
      {rows.map((r) => (
        <Box key={r.repo}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography
              variant="body2"
              color={r.error ? 'text.secondary' : r.formattingOnlyLines ? 'warning.main' : 'text.secondary'}
            >
              {r.error
                ? `${r.repo}: ${r.error}`
                : `${r.repo}: ${r.changedLines} lines across ${r.filesChanged} file(s)` +
                  (r.formattingOnlyLines
                    ? ` — ${r.formattingOnlyLines} reformatting only (${r.formattingOnlyHunks}/${r.hunks} hunks, ${Math.round(
                        r.formattingRatio * 100,
                      )}%)`
                    : ' — no reformatting noise')}
            </Typography>
            {!r.error && r.formattingOnlyHunks > 0 ? (
              <Button size="small" onClick={() => void toggle(r.repo)}>
                {open[r.repo] ? 'Hide' : `Show ${r.formattingOnlyHunks} reformatting hunk(s)`}
              </Button>
            ) : null}
          </Stack>
          {open[r.repo] ? (
            <Box sx={{ pl: 1, maxHeight: 380, overflow: 'auto' }}>
              {busy[r.repo] ? (
                <Typography variant="caption">loading…</Typography>
              ) : err[r.repo] ? (
                <Typography variant="caption" color="error.main">
                  {err[r.repo]}
                </Typography>
              ) : (
                <>
                  {(data[r.repo]?.hunks ?? []).map((h, i) => (
                    <HunkView key={`${h.file}-${i}`} h={h} />
                  ))}
                  {data[r.repo]?.truncated ? (
                    <Typography variant="caption" color="text.secondary">
                      showing {data[r.repo]!.hunks.length} of {data[r.repo]!.total}
                    </Typography>
                  ) : null}
                </>
              )}
            </Box>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

function VerificationPanel({
  v,
  baseline,
}: {
  v: BatchJobVerification;
  baseline?: BatchJobVerification;
}) {
  const passed = v.results.filter((r) => r.ok).length;
  const verdicts = v.results.map((r) => verdictOf(r, baseline));
  const regressions = verdicts.filter((x) => x === 'regression').length;
  const blocked = verdicts.filter((x) => x === 'blocked').length;
  const preExisting = verdicts.filter((x) => x === 'pre-existing').length;
  const gateOk = regressions === 0 && blocked === 0;
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="subtitle2">Verification</Typography>
        <Chip
          size="small"
          color={gateOk ? 'success' : 'error'}
          label={
            gateOk
              ? `${passed}/${v.results.length} passed${
                  preExisting ? ` · ${preExisting} already failing` : ''
                }`
              : `${
                  regressions ? `${regressions} broken by this job` : ''
                }${regressions && blocked ? ' · ' : ''}${
                  blocked ? `${blocked} could not run` : ''
                } — defect kept open`
          }
        />
        {preExisting && !gateOk ? (
          <Chip
            size="small"
            variant="outlined"
            label={`${preExisting} already failing before this job`}
          />
        ) : null}
      </Stack>
      {v.results.map((r, i) => {
        const verdict = verdicts[i]!;
        const blocking = verdict === 'regression' || verdict === 'blocked';
        return (
        <Box
          key={`${r.repo}-${i}`}
          sx={{
            p: 1,
            borderRadius: 1,
            border: 1,
            borderColor: blocking ? 'error.main' : 'divider',
            bgcolor: 'background.default',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              size="small"
              color={
                verdict === 'pass'
                  ? 'success'
                  : verdict === 'pre-existing'
                    ? 'default'
                    : 'error'
              }
              label={
                r.skipped_reason
                  ? 'could not run'
                  : verdict === 'pass'
                    ? 'pass'
                    : verdict === 'pre-existing'
                      ? `already failing (exit ${r.exit_code ?? '?'})`
                      : `broke it (exit ${r.exit_code ?? r.signal ?? 'killed'})`
              }
            />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {r.repo}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
            >
              {r.command}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(r.duration_ms / 1000).toFixed(1)}s
            </Typography>
          </Stack>
          {r.skipped_reason ? (
            <Typography variant="caption" color="error.main">
              {r.skipped_reason}
            </Typography>
          ) : null}
          {!r.ok && r.output_tail ? (
            <Box
              sx={{
                mt: 0.75,
                p: 1,
                maxHeight: 180,
                overflow: 'auto',
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontSize: 11,
                fontFamily: 'ui-monospace, Menlo, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {r.output_tail}
            </Box>
          ) : null}
        </Box>
        );
      })}
    </Stack>
  );
}

function PrRow({ p }: { p: BatchJobPr }) {
  // Prefer GitHub lifecycle chip; fall back to create-time status only when unknown
  const lifecycle = p.ghState || null;
  const showCreateStatus =
    !lifecycle ||
    p.status === 'failed' ||
    p.status === 'skipped' ||
    (p.status === 'existing' && lifecycle === 'open');

  return (
    <Stack
      direction="row"
      spacing={0.75}
      flexWrap="wrap"
      useFlexGap
      alignItems="center"
      sx={{ py: 0.25 }}
    >
      <Typography variant="caption" fontWeight={700} component="span">
        {p.repo}
      </Typography>
      {lifecycle ? (
        <Chip
          size="small"
          label={lifecycle}
          color={ghStateColor(lifecycle)}
          sx={{ height: 22, textTransform: 'capitalize', fontWeight: 700 }}
        />
      ) : isTrackablePr(p) ? (
        <Chip
          size="small"
          variant="outlined"
          label="unknown"
          color="warning"
          sx={{ height: 22 }}
          title="Click Refresh PRs to load GitHub state"
        />
      ) : null}
      {showCreateStatus && !lifecycle ? (
        <Chip
          size="small"
          variant="outlined"
          label={p.status}
          color={createStatusColor(p.status)}
          sx={{ height: 22 }}
        />
      ) : p.status === 'skipped' || p.status === 'failed' ? (
        <Chip
          size="small"
          variant="outlined"
          label={p.status}
          color={createStatusColor(p.status)}
          sx={{ height: 22 }}
        />
      ) : null}
      {p.commits != null && p.status !== 'skipped' ? (
        <Typography variant="caption" color="text.secondary">
          {p.commits} commit(s)
        </Typography>
      ) : null}
      {lifecycle === 'merged' && p.mergedAt ? (
        <Typography variant="caption" color="text.secondary">
          {formatMergedAt(p.mergedAt)}
        </Typography>
      ) : null}
      {p.url ? (
        <Typography
          component="a"
          href={p.url}
          target="_blank"
          rel="noreferrer"
          variant="caption"
          color="primary"
          sx={{ wordBreak: 'break-all' }}
        >
          {p.url}
        </Typography>
      ) : null}
      {p.error ? (
        <Typography variant="caption" color="error">
          {p.error}
        </Typography>
      ) : null}
      {p.ghError ? (
        <Typography variant="caption" color="warning.main">
          refresh: {p.ghError}
        </Typography>
      ) : null}
    </Stack>
  );
}

const ACTION_COPY: Record<
  JobAction,
  { title: string; message: (id: string) => string; confirm: string }
> = {
  stop: {
    title: 'Stop this job?',
    message: (id) =>
      `Stop the coding agent for ${id}? The process will be terminated (SIGTERM → SIGKILL).`,
    confirm: 'Stop',
  },
  resume: {
    title: 'Resume agent?',
    message: (id) =>
      `Continue the last coding-agent session for ${id}? The agent keeps its context and worktree edits, with a fresh iteration and time budget. Turns and cost add to the job's totals.`,
    confirm: 'Resume',
  },
  rerun: {
    title: 'Re-run agent?',
    message: (id) =>
      `Start a new coding-agent session for ${id}? Worktree edits, notes and the original baseline are kept, but the agent starts without its previous context.`,
    confirm: 'Re-run',
  },
  'create-pr': {
    title: 'Create pull requests?',
    message: (id) =>
      `Push worktree branches and open GitHub PRs for ${id}? Requires gh auth and network on the host.`,
    confirm: 'Create PR',
  },
  delete: {
    title: 'Delete this batch job?',
    message: (id) =>
      `Remove ${id} and clean up handoff artifacts (worktrees, BRIEF, logs). Product defects and inventory evidence are kept.`,
    confirm: 'Delete',
  },
};

export function JobsPage() {
  const { appId, app } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [recentBatches, setRecentBatches] = useState<BatchRecord[]>([]);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');

  const [detailJobId, setDetailJobId] = useState<string | null>(
    searchParams.get('job') || null,
  );
  const [detailJob, setDetailJob] = useState<BatchJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(!!searchParams.get('job'));
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<JobAction | null>(null);
  const [jobActionBusy, setJobActionBusy] = useState(false);
  const [jobActionMsg, setJobActionMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const logEndRef = useRef<HTMLDivElement | null>(null);
  const logBoxRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!appId) return;
    try {
      const batchesRes = await api<{
        batches: BatchRecord[];
        jobs: BatchJob[];
      }>('/api/batches');
      setRecentBatches(
        (batchesRes.batches || [])
          .filter((b) => b.app_id === appId)
          .slice(0, 20),
      );
      const jobsForApp = (batchesRes.jobs || [])
        .filter((j) => j.app_id === appId)
        .slice(0, 40);
      setBatchJobs(jobsForApp);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const applyJob = useCallback((job: BatchJob) => {
    setDetailJob(job);
    setBatchJobs((prev) => {
      const others = prev.filter((j) => j.jobId !== job.jobId);
      return [job, ...others].slice(0, 40);
    });
  }, []);

  const refreshPrs = useCallback(
    async (jobId: string, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setJobActionBusy(true);
      try {
        const { job, prs } = await api<{
          job: BatchJob;
          prs: BatchJobPr[];
        }>(`/api/batch-jobs/${encodeURIComponent(jobId)}/refresh-prs`, {
          method: 'POST',
        });
        applyJob(job);
        const s = summarizePrs(prs);
        if (!opts?.silent) {
          setJobActionMsg(s ? `PR status: ${s}` : 'PR status refreshed');
        } else if (s) {
          // Surface successful silent refresh (e.g. after open when stale)
          setJobActionMsg((prev) =>
            prev && /fail|error|not found/i.test(prev) ? prev : `PR status: ${s}`,
          );
        }
        return job;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Always surface failures — silent 404 previously hid "stale backend"
        setJobActionMsg(`Refresh PRs failed: ${msg}`);
        return null;
      } finally {
        if (!opts?.silent) setJobActionBusy(false);
      }
    },
    [applyJob],
  );

  const loadDetail = useCallback(
    async (jobId: string) => {
      setDetailLoading(true);
      try {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(jobId)}`,
        );
        applyJob(job);
        // Missing ghState or stale (>2 min): poll GitHub
        const needsGh =
          canRefreshPrs(job) &&
          ((job.prs || []).some((p) => isTrackablePr(p) && !p.ghState) ||
            prsStale(job.prs));
        if (needsGh) {
          void refreshPrs(jobId, { silent: true });
        }
      } catch (e) {
        setJobActionMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [applyJob, refreshPrs],
  );

  const openDetail = useCallback(
    (jobId: string) => {
      setDetailJobId(jobId);
      setDetailOpen(true);
      setJobActionMsg('');
      void loadDetail(jobId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('job', jobId);
          return next;
        },
        { replace: true },
      );
    },
    [loadDetail, setSearchParams],
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailJobId(null);
    setDetailJob(null);
    setJobActionMsg('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('job');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const requestAction = useCallback((action: JobAction, jobId: string) => {
    setActionTargetId(jobId);
    setPendingAction(action);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const anyJobActive = useMemo(
    () =>
      batchJobs.some((j) => j.status === 'running' || j.status === 'queued') ||
      detailJob?.status === 'running' ||
      detailJob?.status === 'queued',
    [batchJobs, detailJob],
  );

  useEffect(() => {
    const ms = anyJobActive || (detailOpen && detailJobId) ? 1500 : 5000;
    const t = window.setInterval(() => {
      void refresh();
      if (detailOpen && detailJobId) void loadDetail(detailJobId);
    }, ms);
    return () => clearInterval(t);
  }, [refresh, loadDetail, anyJobActive, detailOpen, detailJobId]);

  useEffect(() => {
    const fromUrl = searchParams.get('job');
    if (fromUrl && appId) {
      setDetailJobId(fromUrl);
      setDetailOpen(true);
      void loadDetail(fromUrl);
    }
    // only on app change / mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  useEffect(() => {
    const el = logBoxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [detailJob?.log?.length]);

  const filteredJobs = useMemo(() => {
    let rows = [...batchJobs];
    if (statusFilter !== 'all') {
      rows = rows.filter((j) => j.status === statusFilter);
    }
    const query = q.trim().toLowerCase();
    if (query) {
      rows = rows.filter((j) => {
        const hay = [
          j.jobId,
          j.batchId,
          j.mode,
          j.status,
          ...(j.defect_ids || []),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      });
    }
    return rows;
  }, [batchJobs, statusFilter, q]);

  async function executePendingAction() {
    const id = actionTargetId;
    const action = pendingAction;
    if (!id || !action) return;
    setJobActionBusy(true);
    setJobActionMsg('');
    try {
      if (action === 'delete') {
        await api(`/api/batch-jobs/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        setPendingAction(null);
        setActionTargetId(null);
        if (detailJobId === id) closeDetail();
        setJobActionMsg(`Deleted ${id}`);
        await refresh();
        return;
      }
      if (action === 'stop') {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(id)}/stop`,
          { method: 'POST' },
        );
        setDetailJob(job);
        setJobActionMsg(`Stopped ${job.jobId}`);
      } else if (action === 'resume') {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(id)}/resume`,
          { method: 'POST' },
        );
        setDetailJob(job);
        openDetail(id);
        setJobActionMsg(`Resuming ${job.jobId}`);
      } else if (action === 'rerun') {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(id)}/rerun`,
          { method: 'POST' },
        );
        setDetailJob(job);
        openDetail(id);
        setJobActionMsg(`Re-running ${job.jobId}`);
      } else if (action === 'create-pr') {
        const { job, prs } = await api<{
          job: BatchJob;
          prs: NonNullable<BatchJob['prs']>;
        }>(`/api/batch-jobs/${encodeURIComponent(id)}/create-prs`, {
          method: 'POST',
        });
        setDetailJob(job);
        openDetail(id);
        const urls = (prs || [])
          .filter((p) => p.url)
          .map((p) => `${p.repo}: ${p.url}`)
          .join(' · ');
        const failed = (prs || []).filter((p) => p.status === 'failed').length;
        setJobActionMsg(
          urls
            ? `PRs: ${urls}${failed ? ` (${failed} failed — see log)` : ''}`
            : failed
              ? `Create PR finished with ${failed} failure(s) — see log`
              : 'Create PR: no PRs (no commits or skipped)',
        );
      }
      setPendingAction(null);
      setActionTargetId(null);
      await refresh();
      if (detailOpen && detailJobId === id) void loadDetail(id);
    } catch (e) {
      setJobActionMsg(e instanceof Error ? e.message : String(e));
      setPendingAction(null);
      setActionTargetId(null);
    } finally {
      setJobActionBusy(false);
    }
  }

  const jobColumns = useMemo<GridColDef<BatchJob>[]>(
    () => [
      {
        field: 'status',
        headerName: 'Status',
        flex: 0.55,
        minWidth: 72,
        maxWidth: 110,
        renderCell: ({ value }) => (
          <Chip
            size="small"
            label={String(value ?? '')}
            color={jobStatusColor(String(value ?? ''))}
            sx={{
              maxWidth: '100%',
              height: 22,
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                px: 0.75,
                fontSize: 11,
              },
            }}
          />
        ),
      },
      {
        field: 'batchId',
        headerName: 'Batch',
        flex: 0.5,
        minWidth: 64,
        renderCell: ({ row }) => (
          <Tooltip title={row.batchId}>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ ...cellTextClamp2, fontSize: 12 }}
            >
              …{shortBatchId(row.batchId)}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'jobId',
        headerName: 'Job',
        flex: 1,
        minWidth: 88,
        renderCell: ({ row }) => (
          <Tooltip title={row.jobId}>
            <Typography
              variant="body2"
              sx={{
                ...cellTextClamp2,
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11,
              }}
            >
              {row.jobId}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'mode',
        headerName: 'Mode',
        flex: 0.4,
        minWidth: 48,
        maxWidth: 72,
        renderCell: ({ value }) => (
          <Typography variant="caption" sx={cellTextClamp2}>
            {String(value ?? '')}
          </Typography>
        ),
      },
      {
        field: 'defect_ids',
        headerName: 'Defects',
        flex: 0.85,
        minWidth: 80,
        sortable: false,
        valueGetter: (_v, row) => (row.defect_ids || []).join(','),
        renderCell: ({ row }) => {
          const ids = row.defect_ids || [];
          if (!ids.length) {
            return (
              <Typography variant="caption" color="text.secondary">
                —
              </Typography>
            );
          }
          const first = ids[0]!;
          const short =
            first.length > 14 ? `${first.slice(0, 12)}…` : first;
          return (
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{ minWidth: 0, width: '100%', overflow: 'hidden' }}
            >
              <Chip
                size="small"
                variant="outlined"
                color="primary"
                label={short}
                title={ids.join(', ')}
                component={RouterLink}
                to={`/?id=${encodeURIComponent(first)}`}
                clickable
                onClick={(e) => e.stopPropagation()}
                sx={{
                  height: 22,
                  fontSize: 11,
                  maxWidth: '100%',
                  minWidth: 0,
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    px: 0.75,
                  },
                }}
              />
              {ids.length > 1 ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexShrink: 0 }}
                >
                  +{ids.length - 1}
                </Typography>
              ) : null}
            </Stack>
          );
        },
      },
      {
        field: 'prs',
        headerName: 'PRs',
        flex: 0.55,
        minWidth: 56,
        maxWidth: 120,
        sortable: false,
        valueGetter: (_v, row) => summarizePrs(row.prs),
        renderCell: ({ row }) => {
          const label = summarizePrs(row.prs);
          if (!label) {
            return (
              <Typography variant="caption" color="text.secondary">
                —
              </Typography>
            );
          }
          const anyMerged = (row.prs || []).some((p) => p.ghState === 'merged');
          const anyOpen = (row.prs || []).some((p) => p.ghState === 'open');
          return (
            <Tooltip title={label}>
              <Chip
                size="small"
                label={label}
                color={
                  anyMerged && !anyOpen
                    ? 'success'
                    : anyOpen
                      ? 'info'
                      : 'default'
                }
                variant={anyMerged || anyOpen ? 'filled' : 'outlined'}
                sx={{
                  maxWidth: '100%',
                  height: 22,
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    px: 0.75,
                    fontSize: 11,
                  },
                }}
              />
            </Tooltip>
          );
        },
      },
      {
        field: 'log',
        headerName: 'Log',
        flex: 0.35,
        minWidth: 44,
        maxWidth: 64,
        sortable: false,
        valueGetter: (_v, row) => (row.log || []).length,
        renderCell: ({ value }) => (
          <Typography variant="caption" sx={cellTextClamp2}>
            {String(value ?? 0)}
          </Typography>
        ),
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        flex: 0.7,
        minWidth: 72,
        maxWidth: 120,
        valueGetter: (_v, row) => {
          if (!row.createdAt) return '';
          // YYYY-MM-DD HH:MM compact
          return row.createdAt.slice(0, 16).replace('T', ' ');
        },
        renderCell: ({ value }) => (
          <Tooltip title={String(value ?? '')}>
            <Typography variant="caption" sx={cellTextClamp2}>
              {String(value ?? '')}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 200,
        minWidth: 200,
        maxWidth: 200,
        sortable: false,
        filterable: false,
        resizable: false,
        disableColumnMenu: true,
        align: 'right',
        headerAlign: 'right',
        renderCell: ({ row }) => (
          <Stack
            direction="row"
            spacing={0}
            justifyContent="flex-end"
            sx={{ width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip title="View">
              <IconButton
                size="small"
                aria-label={`View ${row.jobId}`}
                onClick={() => openDetail(row.jobId)}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Stop">
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Stop ${row.jobId}`}
                  disabled={!canStop(row) || jobActionBusy}
                  onClick={() => requestAction('stop', row.jobId)}
                >
                  <StopIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={restartTooltip('Resume', row.resumable)}>
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  aria-label={`Resume ${row.jobId}`}
                  disabled={!canResume(row) || jobActionBusy}
                  onClick={() => requestAction('resume', row.jobId)}
                >
                  <PlayArrowIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={restartTooltip('Re-run', row.rerunnable)}>
              <span>
                <IconButton
                  size="small"
                  aria-label={`Re-run ${row.jobId}`}
                  disabled={!canRerun(row) || jobActionBusy}
                  onClick={() => requestAction('rerun', row.jobId)}
                >
                  <ReplayIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Create PR">
              <span>
                <IconButton
                  size="small"
                  color="secondary"
                  aria-label={`Create PR ${row.jobId}`}
                  disabled={!canCreatePr(row) || jobActionBusy}
                  onClick={() => requestAction('create-pr', row.jobId)}
                >
                  <CallMergeIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                aria-label={`Delete ${row.jobId}`}
                disabled={jobActionBusy}
                onClick={() => requestAction('delete', row.jobId)}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [jobActionBusy, openDetail, requestAction],
  );

  const pendingCopy = pendingAction ? ACTION_COPY[pendingAction] : null;

  return (
    <ListPage
      title="Jobs"
      totalLabel={`${filteredJobs.length} job${filteredJobs.length === 1 ? '' : 's'}`}
      primaryAction={{
        label: 'Refresh',
        onClick: () => void refresh(),
        icon: <RefreshIcon />,
      }}
      description={
        <>
          Batch agent jobs for <strong>{app?.name ?? 'app'}</strong>. Start from{' '}
          <Typography component={RouterLink} to="/defects" variant="body2">
            Defects
          </Typography>
          . Use <strong>View</strong> or action buttons — all interactions open
          a modal.
        </>
      }
      filters={
        <>
          <FilterSelect
            label="Status"
            value={statusFilter}
            allLabel="all"
            options={[
              'queued',
              'running',
              'completed',
              'failed',
              'cancelled',
              'manual',
            ].map((s) => ({ value: s, label: s }))}
            onChange={setStatusFilter}
            minWidth={140}
          />
          <SearchField
            label="Search"
            value={q}
            live
            onSearch={setQ}
            placeholder="job id, batch, defect…"
            sx={{ flex: 1, minWidth: 220 }}
          />
        </>
      }
      error={error || null}
    >
      <Box sx={{ mb: 2 }}>
        <AdminDataGrid
          aria-label="Batch jobs"
          rows={filteredJobs}
          columns={jobColumns}
          loading={loading}
          getRowId={(row) => row.jobId}
          density="compact"
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 48}
          localeText={{
            noRowsLabel: 'No batch jobs — start one from Defects',
          }}
        />
      </Box>

      {recentBatches.length ? (
        <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" gutterBottom>
            Batch manifests
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {recentBatches.map((b) => (
              <Chip
                key={b.id}
                size="small"
                variant="outlined"
                color={manifestStatusColor(b.status)}
                label={`${shortBatchId(b.id)} · ${b.status} · ${b.defect_ids.length}d`}
                title={b.id}
              />
            ))}
          </Stack>
        </Paper>
      ) : null}

      {/* Job detail modal — View */}
      <Dialog
        open={detailOpen}
        onClose={closeDetail}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 6 }}>
          {detailLoading && !detailJob
            ? 'Loading…'
            : detailJob?.batchId || detailJobId || 'Job'}
          <IconButton
            aria-label="Close"
            onClick={closeDetail}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading && !detailJob ? (
            <LoadingState />
          ) : detailJob ? (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label={detailJob.status}
                  color={jobStatusColor(detailJob.status)}
                />
                {(() => {
                  const m = recentBatches.find(
                    (b) => b.id === detailJob.batchId,
                  );
                  return m && m.status !== detailJob.status ? (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`batch: ${m.status}`}
                      color={manifestStatusColor(m.status)}
                    />
                  ) : null;
                })()}
                <Typography
                  variant="caption"
                  sx={{
                    fontFamily: 'ui-monospace, Menlo, monospace',
                    alignSelf: 'center',
                  }}
                >
                  {detailJob.jobId}
                </Typography>
              </Stack>
              {detailJob.error ? (
                <Alert severity="warning" sx={{ py: 0 }}>
                  {detailJob.error}
                </Alert>
              ) : null}
              {jobActionMsg ? (
                <Alert
                  severity={
                    /fail|error|cannot|invalid/i.test(jobActionMsg) &&
                    !/0 failed|no failure/i.test(jobActionMsg)
                      ? 'error'
                      : 'info'
                  }
                  sx={{ py: 0 }}
                >
                  {jobActionMsg}
                </Alert>
              ) : null}
              {(detailJob.defect_ids || []).length ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Linked defects
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {(detailJob.defect_ids || []).map((id) => (
                      <Chip
                        key={id}
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={id}
                        component={RouterLink}
                        to={`/?id=${encodeURIComponent(id)}`}
                        clickable
                        onClick={closeDetail}
                        sx={{
                          fontFamily: 'ui-monospace, Menlo, monospace',
                          fontSize: 11,
                          maxWidth: '100%',
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              ) : null}
              {(detailJob.worktrees || []).length ? (
                <Typography variant="caption" color="text.secondary">
                  worktrees:{' '}
                  {(detailJob.worktrees || []).map((w) => w.repo).join(', ')}
                </Typography>
              ) : null}
              {(detailJob.prs || []).length ? (
                <Stack spacing={0.5}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <Typography variant="subtitle2">Pull requests</Typography>
                    {summarizePrs(detailJob.prs) ? (
                      <Chip
                        size="small"
                        label={summarizePrs(detailJob.prs)}
                        color={
                          (detailJob.prs || []).every(
                            (p) =>
                              !isTrackablePr(p) || p.ghState === 'merged',
                          ) &&
                          (detailJob.prs || []).some((p) => p.ghState === 'merged')
                            ? 'success'
                            : 'default'
                        }
                      />
                    ) : null}
                    <Button
                      size="small"
                      startIcon={<RefreshIcon />}
                      disabled={
                        !canRefreshPrs(detailJob) || jobActionBusy
                      }
                      onClick={() =>
                        detailJobId && void refreshPrs(detailJobId)
                      }
                    >
                      Refresh PRs
                    </Button>
                  </Stack>
                  {(detailJob.prs || []).map((p) => (
                    <PrRow key={`${p.repo}-${p.branch}`} p={p} />
                  ))}
                </Stack>
              ) : null}
              {detailJob.verification?.ran ? (
                <VerificationPanel
                  v={detailJob.verification}
                  baseline={detailJob.baseline}
                />
              ) : null}
              {detailJob.diffHygiene ? (
                <DiffHygienePanel
                  d={detailJob.diffHygiene}
                  jobId={detailJob.jobId}
                />
              ) : null}
              <Box
                ref={logBoxRef}
                sx={{
                  m: 0,
                  p: 1.5,
                  maxHeight: 360,
                  overflow: 'auto',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                  fontSize: 12,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {(detailJob.log || []).length ? (
                  (detailJob.log || []).map((line, i) => {
                    // [level] [Source] message  or legacy [level] message
                    const m = line.match(
                      /^\[(\w+)\]\s*(?:\[([^\]]+)\]\s*)?([\s\S]*)$/,
                    );
                    const level = m?.[1] ?? 'info';
                    const source = m?.[2] ?? '';
                    const body = m?.[3] ?? line;
                    // Wire may still tag source=Grok; show generic "Agent" in UI
                    const sourceLabel =
                      source === 'Grok' ? 'Agent' : source;
                    const sourceColor =
                      source === 'Grok' || sourceLabel === 'Agent'
                        ? 'secondary.main'
                        : source === 'DefectDrainer'
                          ? 'primary.main'
                          : 'text.secondary';
                    return (
                      <Box key={`${i}-${line.slice(0, 32)}`} sx={{ mb: 0.5 }}>
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'inherit' }}
                        >
                          [{level}]
                        </Typography>
                        {sourceLabel ? (
                          <Typography
                            component="span"
                            variant="caption"
                            fontWeight={700}
                            sx={{
                              fontFamily: 'inherit',
                              color: sourceColor,
                              ml: 0.5,
                            }}
                          >
                            [{sourceLabel}]
                          </Typography>
                        ) : null}
                        <Typography
                          component="span"
                          variant="caption"
                          sx={{
                            fontFamily: 'inherit',
                            whiteSpace: 'pre-wrap',
                            ml: 0.5,
                            color:
                              level === 'error'
                                ? 'error.main'
                                : level === 'warn'
                                  ? 'warning.main'
                                  : 'text.primary',
                          }}
                        >
                          {body}
                        </Typography>
                      </Box>
                    );
                  })
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    (no log lines yet — waiting for agent…)
                  </Typography>
                )}
                <div ref={logEndRef} />
              </Box>
            </Stack>
          ) : (
            <Typography color="text.secondary">Job not found.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            disabled={!detailJobId || jobActionBusy}
            onClick={() => detailJobId && void loadDetail(detailJobId)}
          >
            Refresh log
          </Button>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            disabled={
              !detailJob || !canRefreshPrs(detailJob) || jobActionBusy
            }
            onClick={() => detailJobId && void refreshPrs(detailJobId)}
          >
            Refresh PRs
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<StopIcon />}
            disabled={!detailJob || !canStop(detailJob) || jobActionBusy}
            onClick={() =>
              detailJobId && requestAction('stop', detailJobId)
            }
          >
            Stop
          </Button>
          <Tooltip title={restartTooltip('Resume', detailJob?.resumable)}>
            <span>
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrowIcon />}
                disabled={!detailJob || !canResume(detailJob) || jobActionBusy}
                onClick={() =>
                  detailJobId && requestAction('resume', detailJobId)
                }
              >
                Resume
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={restartTooltip('Re-run', detailJob?.rerunnable)}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<ReplayIcon />}
                disabled={!detailJob || !canRerun(detailJob) || jobActionBusy}
                onClick={() =>
                  detailJobId && requestAction('rerun', detailJobId)
                }
              >
                Re-run
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            variant="contained"
            color="secondary"
            startIcon={<CallMergeIcon />}
            disabled={!detailJob || !canCreatePr(detailJob) || jobActionBusy}
            onClick={() =>
              detailJobId && requestAction('create-pr', detailJobId)
            }
          >
            Create PR
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={!detailJobId || jobActionBusy}
            onClick={() =>
              detailJobId && requestAction('delete', detailJobId)
            }
          >
            Delete
          </Button>
          <Button variant="contained" onClick={closeDetail}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm modal for Stop / Resume / Re-run / Create PR / Delete */}
      <ConfirmDialog
        open={!!pendingAction && !!actionTargetId}
        title={pendingCopy?.title ?? 'Confirm'}
        message={
          pendingCopy && actionTargetId
            ? pendingCopy.message(actionTargetId)
            : ''
        }
        confirmLabel={
          jobActionBusy ? 'Working…' : (pendingCopy?.confirm ?? 'Confirm')
        }
        cancelLabel="Cancel"
        onConfirm={() => void executePendingAction()}
        onCancel={() => {
          if (!jobActionBusy) {
            setPendingAction(null);
            setActionTargetId(null);
          }
        }}
      />
    </ListPage>
  );
}
