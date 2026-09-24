/**
 * Batch coding-agent jobs listing — ListPage + AdminDataGrid.
 * All action interactions use modals (detail / confirm), not inline-only UI.
 */
import CallMergeIcon from '@mui/icons-material/CallMerge';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import StopIcon from '@mui/icons-material/Stop';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import {
  api,
  evidenceUrl,
  type AgentRun,
  type BatchJob,
  type BatchJobPr,
  type BatchJobVerification,
  type Defect,
  type DiffHunk,
  type DiffHunksResponse,
  type DiffHygieneReport,
  type HarvestDefect,
  type VerifyResult,
  type BatchRecord,
  type WorktreeDiscard,
} from '../api';
import {
  AdminDataGrid,
  cellTextClamp2,
} from '../components/AdminDataGrid';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  EvidenceGallery,
  type EvidenceGroup,
} from '../components/EvidenceGallery';
import { FilterSelect } from '../components/FilterSelect';
import { ListPage } from '../components/ListPage';
import { LoadingState } from '../components/LoadingState';
import { SearchField } from '../components/SearchField';
import { defectStatusColor, defectStatusLabel } from '../defectStatus';
import {
  createStatusColor,
  ghStateColor,
  isTrackablePr,
  prsStale,
  summarizePrs,
} from '../prStatus';
import { absoluteLocal, relativeTime } from '../relativeTime';

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

function repoMerged(j: BatchJob, repo: string): boolean {
  return (j.prs || []).some(
    (p) => p.repo === repo && (p.status === 'merged' || p.ghState === 'merged'),
  );
}

/** A local merge that already landed should not be offered again. */
function shipAlreadyDone(j: BatchJob): boolean {
  const mode = integrateMode(j);
  if (mode === 'pr') return false;
  const trees = j.worktrees || [];
  if (!trees.length) return false;
  return trees.every((w) => {
    if ((w.baseSource || 'origin') === 'local') return repoMerged(j, w.repo);
    const row = (j.prs || []).find((p) => p.repo === w.repo);
    return (
      row?.status === 'created' ||
      row?.status === 'existing' ||
      row?.ghState === 'merged'
    );
  });
}

/** How this job ships: local bases merge, GitHub bases open a pull request. */
function integrateMode(job: BatchJob | null | undefined): 'merge' | 'pr' | 'mixed' {
  const sources = (job?.worktrees || []).map((w) => w.baseSource || 'origin');
  if (!sources.length || sources.every((s) => s !== 'local')) return 'pr';
  if (sources.every((s) => s === 'local')) return 'merge';
  return 'mixed';
}

function integrateLabel(job: BatchJob | null | undefined): string {
  const mode = integrateMode(job);
  if (mode === 'merge') return 'Merge';
  if (mode === 'mixed') return 'PR / Merge';
  return 'Create PR';
}

function integrateDialog(job: BatchJob | null | undefined): {
  title: string;
  message: (id: string) => string;
  confirm: string;
} {
  const mode = integrateMode(job);
  const bases = [
    ...new Set(
      (job?.worktrees || [])
        .map((w) => w.baseBranch)
        .filter((b): b is string => Boolean(b)),
    ),
  ];
  const into = bases.length ? ` (${bases.join(', ')})` : '';
  if (mode === 'merge') {
    return {
      title: 'Merge into the base branch?',
      message: (id) =>
        `Merge committed work on ${id} into the local base branch${into}? The primary checkout is updated only when it is already on that branch and has no uncommitted changes. A dirty checkout is left as it is.`,
      confirm: 'Merge',
    };
  }
  if (mode === 'mixed') {
    return {
      title: 'Open pull requests and merge local repos?',
      message: (id) =>
        `For ${id}, GitHub repos get a pull request and local checkouts are merged into their base branch${into}. A local merge updates the primary checkout only when it is already on that branch and clean.`,
      confirm: 'Continue',
    };
  }
  return {
    title: 'Create pull requests?',
    message: (id) =>
      `Push worktree branches and open GitHub pull requests for ${id} against the saved base branch${into}? Requires gh auth and network on the host.`,
    confirm: 'Create PR',
  };
}

type ShipPreview = {
  message: string;
  repos: {
    repo: string;
    branch: string;
    baseBranch?: string;
    files: string[];
    commitsAhead: number;
  }[];
};

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

/** `job.json` is agent-writable, so only http(s) URLs are turned into links. */
function httpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return null;
  }
  return null;
}

function PrRow({ p }: { p: BatchJobPr }) {
  const href = p.url ? httpUrl(p.url) : null;
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
      {p.base ? (
        <Typography variant="caption" color="text.secondary">
          {p.kind === 'merge' ? 'into' : 'base'} {p.base}
        </Typography>
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
        href ? (
          <Typography
            component="a"
            href={href}
            target="_blank"
            rel="noreferrer"
            variant="caption"
            color="primary"
            sx={{ wordBreak: 'break-all' }}
          >
            {p.url}
          </Typography>
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ wordBreak: 'break-all' }}
          >
            {p.url}
          </Typography>
        )
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

/** One repo's outcome, for the post-delete message. */
function discardSummary(d: WorktreeDiscard): string {
  if (d.error) return `${d.repo}: ${d.error}`;
  if (d.branchAction === 'delete') return `${d.repo}: worktree and branch removed`;
  if (d.branchAction === 'keep')
    return `${d.repo}: worktree removed, branch ${d.branch} kept (${d.reason ?? 'unmerged'})`;
  return `${d.repo}: worktree removed`;
}

/** What Delete will discard, per repo, shown in the confirm dialog. */
function DeletePreviewList({
  repos,
  error,
}: {
  repos: WorktreeDiscard[] | null;
  error: string;
}) {
  if (error)
    return (
      <Alert severity="warning" sx={{ mt: 1.5 }}>
        Could not check the worktrees: {error}
      </Alert>
    );
  if (!repos)
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        Checking worktrees…
      </Typography>
    );
  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      {repos.map((d) => (
        <Box key={d.repo}>
          <Typography variant="subtitle2">{d.repo}</Typography>
          {d.uncommittedCount > 0 ? (
            <Typography variant="body2" color="warning.main">
              {d.uncommittedCount} uncommitted file(s) will be discarded:{' '}
              {(d.uncommitted ?? []).slice(0, 5).join(', ')}
              {d.uncommittedCount > 5 ? ', …' : ''}
            </Typography>
          ) : null}
          <Typography variant="body2" color="text.secondary">
            {d.branchAction === 'delete'
              ? `Branch ${d.branch} will be deleted (merged).`
              : d.branchAction === 'keep'
                ? `Branch ${d.branch} will be kept: ${d.reason ?? 'unmerged commits'}.`
                : `Branch: ${d.reason ?? 'nothing to delete'}.`}
          </Typography>
          {d.error ? (
            <Typography variant="body2" color="error.main">
              {d.error}
            </Typography>
          ) : null}
        </Box>
      ))}
    </Stack>
  );
}

type DrawerTab = 'overview' | 'evidence' | 'log';

function formatUsd(n: number | undefined): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

const HARVEST_OUTCOME_LABEL: Record<string, string> = {
  resolved: 'Resolved',
  regression: 'Regression',
  not_resolved: 'Not resolved',
  notes_only: 'Notes only',
  no_evidence: 'No evidence',
  error: 'Error',
};

function harvestOutcomeLabel(outcome: string): string {
  return HARVEST_OUTCOME_LABEL[outcome] ?? outcome;
}

function harvestOutcomeColor(
  outcome: string,
): 'default' | 'success' | 'warning' | 'error' {
  if (outcome === 'resolved') return 'success';
  if (
    outcome === 'regression' ||
    outcome === 'not_resolved' ||
    outcome === 'notes_only'
  ) {
    return 'warning';
  }
  if (outcome === 'error') return 'error';
  return 'default';
}

function imageCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'image' : 'images'}`;
}

/** Outcome for a defect on the newest harvest run, if that run recorded one. */
function latestHarvestFor(
  job: BatchJob,
  defectId: string,
): HarvestDefect | undefined {
  const runs = job.harvests;
  if (!runs?.length) return undefined;
  return runs[runs.length - 1]?.defects.find((d) => d.defectId === defectId);
}

function evidenceItems(
  rels: string[] | undefined,
): { url: string; alt: string }[] {
  const items: { url: string; alt: string }[] = [];
  for (const rel of rels ?? []) {
    const url = evidenceUrl(rel);
    if (url) items.push({ url, alt: rel });
  }
  return items;
}

function stoppedByLabel(stoppedBy: string | undefined): string {
  if (!stoppedBy) return '—';
  if (stoppedBy === 'artifacts') return 'artifacts delivered';
  return stoppedBy;
}

function tabForStatus(status: string | undefined): DrawerTab {
  return status === 'running' || status === 'queued' ? 'log' : 'overview';
}

function restartReason(
  label: string,
  check: BatchJob['resumable'],
): string | null {
  if (!check || check.ok || !check.reason) return null;
  return `${label}: ${check.reason}`;
}

function LinkedDefectChip({
  id,
  onNavigate,
}: {
  id: string;
  onNavigate: () => void;
}) {
  return (
    <Chip
      size="small"
      color="primary"
      variant="outlined"
      label={id}
      component={RouterLink}
      to={`/?id=${encodeURIComponent(id)}`}
      clickable
      onClick={onNavigate}
      sx={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 11,
        maxWidth: '100%',
      }}
    />
  );
}

function RunSummary({ run }: { run: AgentRun }) {
  const missing = (run.missing ?? []).map((m) => m.trim()).filter(Boolean);
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Run summary
      </Typography>
      <Typography variant="body2">Attempts: {run.iterations}</Typography>
      <Typography variant="body2">
        Stopped by: {stoppedByLabel(run.stoppedBy)}
      </Typography>
      {missing.length ? (
        <Typography variant="body2">Missing: {missing.join(', ')}</Typography>
      ) : null}
      <Typography variant="body2">
        Turns: {run.turns == null ? '—' : run.turns}
      </Typography>
      <Typography variant="body2">Cost: {formatUsd(run.totalCostUsd)}</Typography>
      {run.resumes != null && run.resumes > 0 ? (
        <Typography variant="body2">Resumes: {run.resumes}</Typography>
      ) : null}
      <Typography variant="caption" color="text.secondary" component="div">
        Session{' '}
        <Box
          component="span"
          sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
        >
          {run.sessionId || '—'}
        </Box>
      </Typography>
    </Box>
  );
}

function DefectOutcomeList({
  job,
  onNavigate,
}: {
  job: BatchJob;
  onNavigate: () => void;
}) {
  const ids = job.defect_ids || [];
  if (!ids.length) return null;
  const hasHarvests = (job.harvests?.length ?? 0) > 0;
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Defects
      </Typography>
      <Stack spacing={1}>
        {ids.map((id) => {
          const entry = hasHarvests ? latestHarvestFor(job, id) : undefined;
          return (
            <Box key={id}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
              >
                <LinkedDefectChip id={id} onNavigate={onNavigate} />
                {entry ? (
                  <Chip
                    size="small"
                    label={harvestOutcomeLabel(entry.outcome)}
                    color={harvestOutcomeColor(entry.outcome)}
                  />
                ) : null}
                {entry ? (
                  <Typography variant="caption" color="text.secondary">
                    {imageCountLabel(entry.images?.length ?? 0)}
                  </Typography>
                ) : null}
              </Stack>
              {entry?.reason ? (
                <Typography variant="caption" color="text.secondary">
                  {entry.reason}
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function WorktreeSection({ job }: { job: BatchJob }) {
  const trees = job.worktrees || [];
  if (!trees.length) return null;
  return (
    <Accordion
      key={job.jobId}
      disableGutters
      elevation={0}
      defaultExpanded={false}
      sx={{
        border: 1,
        borderColor: 'divider',
        bgcolor: 'transparent',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Worktrees</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          {trees.map((w) => (
            <Box key={`${w.repo}-${w.branch}`}>
              <Typography variant="body2">{w.repo}</Typography>
              {(
                [
                  ['Base branch', w.baseBranch || 'not recorded'],
                  ['Job branch', w.branch],
                  ['Worktree', w.worktreeAbs],
                ] as const
              ).map(([label, value]) => (
                <Typography
                  key={label}
                  variant="caption"
                  component="div"
                  color="text.secondary"
                  sx={{
                    fontFamily: 'ui-monospace, Menlo, monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {label}: {value}
                </Typography>
              ))}
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function JobPrSection({ job }: { job: BatchJob }) {
  const prs = job.prs || [];
  if (!prs.length) return null;
  const summary = summarizePrs(prs);
  const allMerged =
    prs.every((p) => !isTrackablePr(p) || p.ghState === 'merged') &&
    prs.some((p) => p.ghState === 'merged');
  const mode = integrateMode(job);
  const title =
    mode === 'merge'
      ? 'Merges'
      : mode === 'mixed'
        ? 'Pull requests and merges'
        : 'Pull requests';
  return (
    <Stack spacing={0.5}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
      >
        <Typography variant="subtitle2">{title}</Typography>
        {summary ? (
          <Chip
            size="small"
            label={summary}
            color={allMerged ? 'success' : 'default'}
          />
        ) : null}
      </Stack>
      {prs.map((p) => (
        <PrRow key={`${p.repo}-${p.branch}`} p={p} />
      ))}
    </Stack>
  );
}

function JobOverview({
  job,
  jobActionMsg,
  onNavigateDefect,
}: {
  job: BatchJob;
  jobActionMsg: string;
  onNavigateDefect: () => void;
}) {
  return (
    <Stack spacing={1.5}>
      {job.error ? (
        <Alert severity="warning" sx={{ py: 0 }}>
          {job.error}
        </Alert>
      ) : null}
      {job.simQueue ? (
        <Alert severity="info" sx={{ py: 0 }}>
          {`Waiting for the simulator: #${job.simQueue.position} in line, behind `}
          <Box
            component="span"
            sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
          >
            {job.simQueue.holder}
          </Box>
          {'. It starts on its own; Stop removes it from the line.'}
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
      {job.agentRun ? <RunSummary run={job.agentRun} /> : null}
      <DefectOutcomeList job={job} onNavigate={onNavigateDefect} />
      {job.verification?.ran ? (
        <VerificationPanel v={job.verification} baseline={job.baseline} />
      ) : null}
      {job.diffHygiene ? (
        <DiffHygienePanel
          key={job.jobId}
          d={job.diffHygiene}
          jobId={job.jobId}
        />
      ) : null}
      <JobPrSection job={job} />
      <WorktreeSection job={job} />
    </Stack>
  );
}

const NO_HARVEST_RECORD =
  "No harvest record for this job (jobs run before 2026-09-24 don't have one). The defect's fix screenshots are on Defects.";

type LoadedDefect =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; defect: Defect };

/** Accept the `{ defect }` envelope Defects uses, or a bare Defect body. */
function defectFromPayload(body: Defect & { defect?: Defect }): Defect | null {
  if (body.defect?.id) return body.defect;
  if (body.id) return body;
  return null;
}

function harvestGalleryGroups(
  job: BatchJob,
  defectId: string,
  defect: Defect,
): EvidenceGroup[] {
  const groups: EvidenceGroup[] = [
    {
      title: 'Report',
      emptyLabel: 'None',
      items: evidenceItems(defect.evidence),
    },
  ];
  (job.harvests ?? []).forEach((run, i) => {
    const entry = run.defects.find((d) => d.defectId === defectId);
    if (!entry?.images?.length) return;
    groups.push({
      title: `Run ${i + 1} · ${absoluteLocal(run.at)} · ${harvestOutcomeLabel(entry.outcome)}`,
      emptyLabel: 'None',
      items: evidenceItems(entry.images),
      accent: entry.outcome === 'resolved' ? 'success' : undefined,
    });
  });
  return groups;
}

/** Stable per defect, so one gallery's mount-time `false` cannot clear another's. */
function BoundEvidenceGallery({
  defectId,
  groups,
  onViewerChange,
}: {
  defectId: string;
  groups: EvidenceGroup[];
  onViewerChange: (defectId: string, open: boolean) => void;
}) {
  const onViewerChangeRef = useRef(onViewerChange);
  onViewerChangeRef.current = onViewerChange;
  const report = useCallback(
    (open: boolean) => {
      onViewerChangeRef.current(defectId, open);
    },
    [defectId],
  );
  return <EvidenceGallery groups={groups} onViewerChange={report} />;
}

function HarvestEvidence({
  job,
  onViewerChange,
}: {
  job: BatchJob;
  onViewerChange: (defectId: string, open: boolean) => void;
}) {
  const ids = job.defect_ids || [];
  const defectKey = ids.join('\0');
  const harvestCount = job.harvests?.length ?? 0;
  const [loaded, setLoaded] = useState<Record<string, LoadedDefect>>({});

  useEffect(() => {
    const idList = defectKey ? defectKey.split('\0') : [];
    if (!idList.length) {
      setLoaded({});
      return;
    }
    let cancelled = false;
    setLoaded((prev) => {
      const next: Record<string, LoadedDefect> = {};
      for (const id of idList) {
        const cur = prev[id];
        next[id] = cur?.kind === 'ready' ? cur : { kind: 'loading' };
      }
      return next;
    });
    void Promise.all(
      idList.map(async (id) => {
        try {
          const body = await api<Defect & { defect?: Defect }>(
            `/api/defects/${encodeURIComponent(id)}`,
          );
          const defect = defectFromPayload(body);
          if (!defect) {
            return [
              id,
              { kind: 'error' as const, message: 'Defect not found' },
            ] as const;
          }
          return [id, { kind: 'ready' as const, defect }] as const;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return [id, { kind: 'error' as const, message }] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, LoadedDefect> = {};
      for (const [id, row] of rows) next[id] = row;
      setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [defectKey, harvestCount]);

  if (!ids.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No linked defects.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      {ids.map((id) => {
        const row = loaded[id];
        if (!row || row.kind === 'loading') {
          return (
            <Typography key={id} variant="caption" color="text.secondary">
              Loading {id}…
            </Typography>
          );
        }
        if (row.kind === 'error') {
          return (
            <Typography key={id} variant="caption" color="error">
              {id}: {row.message}
            </Typography>
          );
        }
        const defect = row.defect;
        return (
          <Box key={id}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2">{defect.title || id}</Typography>
              <Chip
                size="small"
                label={defectStatusLabel(defect.status)}
                color={defectStatusColor(defect.status)}
              />
            </Stack>
            <BoundEvidenceGallery
              defectId={id}
              groups={harvestGalleryGroups(job, id, defect)}
              onViewerChange={onViewerChange}
            />
          </Box>
        );
      })}
    </Stack>
  );
}

function JobEvidence({
  job,
  onViewerChange,
  onNavigateDefect,
}: {
  job: BatchJob;
  onViewerChange: (defectId: string, open: boolean) => void;
  onNavigateDefect: () => void;
}) {
  if (job.harvests == null) {
    const ids = job.defect_ids || [];
    return (
      <Stack spacing={1}>
        <Alert severity="info">{NO_HARVEST_RECORD}</Alert>
        {ids.length ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {ids.map((id) => (
              <LinkedDefectChip key={id} id={id} onNavigate={onNavigateDefect} />
            ))}
          </Stack>
        ) : null}
      </Stack>
    );
  }
  return (
    <HarvestEvidence
      key={job.jobId}
      job={job}
      onViewerChange={onViewerChange}
    />
  );
}

function parsedLog(line: string): {
  level: string;
  source: string;
  sourceLabel: string;
  kind: 'agent' | 'dd' | 'other';
  body: string;
} {
  const m = line.match(/^\[(\w+)\]\s*(?:\[([^\]]+)\]\s*)?([\s\S]*)$/);
  const level = m?.[1] ?? 'info';
  const source = m?.[2] ?? '';
  const body = m?.[3] ?? line;
  const sourceLabel = source === 'Grok' ? 'Agent' : source;
  const kind =
    source === 'Grok' || source === 'Agent'
      ? 'agent'
      : source === 'DefectDrainer' || source === 'DD'
        ? 'dd'
        : 'other';
  return { level, source, sourceLabel, kind, body };
}

function isProblemLevel(level: string): boolean {
  return level === 'warn' || level === 'warning' || level === 'error';
}

function LogLine({ line, index }: { line: string; index: number }) {
  const { level, source, sourceLabel, body } = parsedLog(line);
  const sourceColor =
    source === 'Grok' || sourceLabel === 'Agent'
      ? 'secondary.main'
      : source === 'DefectDrainer'
        ? 'primary.main'
        : 'text.secondary';
  return (
    <Box key={`${index}-${line.slice(0, 32)}`} sx={{ mb: 0.5 }}>
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
          sx={{ fontFamily: 'inherit', color: sourceColor, ml: 0.5 }}
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
              : level === 'warn' || level === 'warning'
                ? 'warning.main'
                : 'text.primary',
        }}
      >
        {body}
      </Typography>
    </Box>
  );
}

const filterGroupSx = {
  '& .MuiToggleButton-root': {
    textTransform: 'none',
    py: 0.25,
    px: 1,
    lineHeight: 1.4,
  },
} as const;

function JobLogPanel({
  jobId,
  lines,
  shown,
  logBoxRef,
  logEndRef,
}: {
  jobId: string;
  lines: string[];
  shown: boolean;
  logBoxRef: RefObject<HTMLDivElement | null>;
  logEndRef: RefObject<HTMLDivElement | null>;
}) {
  const [level, setLevel] = useState<'all' | 'problems'>('all');
  const [source, setSource] = useState<'all' | 'agent' | 'dd'>('all');
  const [filterJob, setFilterJob] = useState(jobId);
  const followRef = useRef(true);
  const pinningRef = useRef(false);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  if (filterJob !== jobId) {
    setFilterJob(jobId);
    setLevel('all');
    setSource('all');
    followRef.current = true;
  }

  const onLogScroll = useCallback(() => {
    // Ignore the pin itself, and ignore scrolls while the tab is hidden —
    // a zero-height box would look like the operator had scrolled up.
    if (pinningRef.current || !shownRef.current) return;
    const el = logBoxRef.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, [logBoxRef]);

  const logTail = lines.length ? lines[lines.length - 1] : '';
  useEffect(() => {
    const el = logBoxRef.current;
    if (!el || !followRef.current) return;
    // Assign scrollTop (not scrollIntoView) so a hidden Log tab cannot scroll
    // Overview. `shown` is a dependency so revealing the tab re-pins.
    // Hold `pinningRef` through the next frame so the scroll event this
    // assignment fires is not treated as the operator scrolling away.
    pinningRef.current = true;
    el.scrollTop = el.scrollHeight;
    const frame = window.requestAnimationFrame(() => {
      pinningRef.current = false;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      pinningRef.current = false;
    };
  }, [shown, lines.length, logTail, level, source, jobId, logBoxRef]);

  const visible = lines
    .map((line, index) => ({ line, index, parsed: parsedLog(line) }))
    .filter(({ parsed }) => {
      if (level === 'problems' && !isProblemLevel(parsed.level)) return false;
      if (source === 'agent' && parsed.kind !== 'agent') return false;
      if (source === 'dd' && parsed.kind !== 'dd') return false;
      return true;
    });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        flexWrap="wrap"
        alignItems="center"
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <Typography variant="caption" color="text.secondary">
          Level
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={level}
          aria-label="Log level"
          sx={filterGroupSx}
          onChange={(_event, value) => {
            if (value === 'all' || value === 'problems') setLevel(value);
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="problems">Warnings + errors</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Source
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={source}
          aria-label="Log source"
          sx={filterGroupSx}
          onChange={(_event, value) => {
            if (value === 'all' || value === 'agent' || value === 'dd') {
              setSource(value);
            }
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="agent">Agent</ToggleButton>
          <ToggleButton value="dd">DD</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box
        ref={logBoxRef}
        onScroll={onLogScroll}
        sx={{
          m: 0,
          p: 1.5,
          flex: 1,
          minHeight: 0,
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
        {lines.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            (no log lines yet — waiting for agent…)
          </Typography>
        ) : visible.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No lines match these filters.
          </Typography>
        ) : (
          visible.map(({ line, index }) => (
            <LogLine key={`${index}-${line.slice(0, 32)}`} line={line} index={index} />
          ))
        )}
        <div ref={logEndRef} />
      </Box>
    </Box>
  );
}

function DrawerActionBar({
  job,
  jobId,
  busy,
  onStop,
  onResume,
  onRerun,
  onIntegrate,
  onRefreshLog,
  onRefreshPrs,
  onDelete,
}: {
  job: BatchJob | null;
  jobId: string | null;
  busy: boolean;
  onStop: () => void;
  onResume: () => void;
  onRerun: () => void;
  onIntegrate: () => void;
  onRefreshLog: () => void;
  onRefreshPrs: () => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [menuJob, setMenuJob] = useState(jobId);
  if (menuJob !== jobId) {
    setMenuJob(jobId);
    setAnchor(null);
  }
  const closeMenu = () => setAnchor(null);
  const showRefreshPrs = !!job && integrateMode(job) !== 'merge';
  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Button
        size="small"
        color="error"
        variant="outlined"
        startIcon={<StopIcon />}
        disabled={!job || !canStop(job) || busy}
        onClick={onStop}
      >
        Stop
      </Button>
      <Tooltip title={restartTooltip('Resume', job?.resumable)}>
        <span>
          <Button
            size="small"
            variant="contained"
            startIcon={<PlayArrowIcon />}
            disabled={!job || !canResume(job) || busy}
            onClick={onResume}
          >
            Resume
          </Button>
        </span>
      </Tooltip>
      <Tooltip title={restartTooltip('Re-run', job?.rerunnable)}>
        <span>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ReplayIcon />}
            disabled={!job || !canRerun(job) || busy}
            onClick={onRerun}
          >
            Re-run
          </Button>
        </span>
      </Tooltip>
      <Tooltip
        title={job && shipAlreadyDone(job) ? 'Already merged' : integrateLabel(job)}
      >
        <span>
          <Button
            size="small"
            variant="contained"
            color="secondary"
            startIcon={<CallMergeIcon />}
            disabled={!job || !canCreatePr(job) || shipAlreadyDone(job) || busy}
            onClick={onIntegrate}
          >
            {integrateLabel(job)}
          </Button>
        </span>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Tooltip title="More actions">
        <IconButton
          size="small"
          aria-label="More actions"
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          disabled={!jobId || busy}
          onClick={() => {
            closeMenu();
            onRefreshLog();
          }}
        >
          <ListItemIcon>
            <RefreshIcon fontSize="small" />
          </ListItemIcon>
          Refresh log
        </MenuItem>
        {showRefreshPrs ? (
          <MenuItem
            disabled={!job || !canRefreshPrs(job) || busy}
            onClick={() => {
              closeMenu();
              onRefreshPrs();
            }}
          >
            <ListItemIcon>
              <RefreshIcon fontSize="small" />
            </ListItemIcon>
            Refresh PRs
          </MenuItem>
        ) : null}
        <MenuItem
          disabled={!jobId || busy}
          onClick={() => {
            closeMenu();
            onDelete();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
}

function ActionReasons({ job }: { job: BatchJob | null }) {
  if (!job || job.status === 'running' || job.status === 'queued') return null;
  const lines = [
    restartReason('Resume', job.resumable),
    restartReason('Re-run', job.rerunnable),
  ].filter((line): line is string => Boolean(line));
  if (!lines.length) return null;
  return (
    <Stack spacing={0.25} sx={{ px: 2, pt: 0.75, pb: 0.5, flexShrink: 0 }}>
      {lines.map((line) => (
        <Typography key={line} variant="caption" color="text.secondary">
          {line}
        </Typography>
      ))}
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
      `Push worktree branches and open GitHub pull requests for ${id} against the saved base branch? Requires gh auth and network on the host.`,
    confirm: 'Create PR',
  },
  delete: {
    title: 'Delete this batch job?',
    message: (id) =>
      `Remove ${id}: its handoff folder (BRIEF, logs, notes) and its worktrees, which are also unregistered from each product repo. A job branch is deleted only if it is merged. Product defects and inventory evidence are kept.`,
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
  const [shipPreview, setShipPreview] = useState<ShipPreview | null>(null);
  const [shipMessage, setShipMessage] = useState('');
  const [shipLoading, setShipLoading] = useState(false);
  const [shipError, setShipError] = useState('');
  const [deletePreview, setDeletePreview] = useState<WorktreeDiscard[] | null>(
    null,
  );
  const [deletePreviewError, setDeletePreviewError] = useState('');
  // The job a delete preview was requested for; a slower response for an
  // earlier job must not land in this job's confirm dialog.
  const deletePreviewFor = useRef<string | null>(null);
  // Same guard for the ship-preview request: A's preview must not fill B's dialog.
  const shipPreviewFor = useRef<string | null>(null);
  const [jobActionBusy, setJobActionBusy] = useState(false);
  const [jobActionMsg, setJobActionMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const logEndRef = useRef<HTMLDivElement | null>(null);
  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const tabForJob = useRef<string | null>(null);
  // Set when the operator picks a tab for this open id, so a late auto-choice
  // (deep link, job not in the list yet) does not overwrite that pick.
  const tabPickedFor = useRef<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('overview');
  // One entry per gallery whose viewer is open. A sibling's `false` must not
  // clear another gallery's `true`.
  const [openViewers, setOpenViewers] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  // Id currently shown in the drawer, plus a generation bumped on open/close
  // so a slow response for the previous open cannot clear the next load.
  const openJobRef = useRef<string | null>(searchParams.get('job'));
  const detailEpoch = useRef(0);
  const busyEpoch = useRef(0);

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

  const writeJobRow = useCallback((job: BatchJob) => {
    setBatchJobs((prev) => {
      const others = prev.filter((j) => j.jobId !== job.jobId);
      return [job, ...others].slice(0, 40);
    });
  }, []);

  const detailStillOpen = useCallback((jobId: string, epoch: number) => {
    return openJobRef.current === jobId && detailEpoch.current === epoch;
  }, []);

  const beginBusy = useCallback(() => {
    const token = ++busyEpoch.current;
    setJobActionBusy(true);
    return token;
  }, []);

  const endBusy = useCallback((token: number) => {
    if (busyEpoch.current === token) setJobActionBusy(false);
  }, []);

  const refreshPrs = useCallback(
    async (jobId: string, opts?: { silent?: boolean }) => {
      const epoch = detailEpoch.current;
      const busyToken = opts?.silent ? 0 : beginBusy();
      try {
        const { job, prs } = await api<{
          job: BatchJob;
          prs: BatchJobPr[];
        }>(`/api/batch-jobs/${encodeURIComponent(jobId)}/refresh-prs`, {
          method: 'POST',
        });
        if (job.jobId !== jobId) return null;
        // The grid always takes the refreshed row. The drawer and its message
        // do not, once the operator has moved on.
        writeJobRow(job);
        if (!detailStillOpen(jobId, epoch)) return null;
        setDetailJob(job);
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
        if (!detailStillOpen(jobId, epoch)) return null;
        const msg = e instanceof Error ? e.message : String(e);
        // Always surface failures — silent 404 previously hid "stale backend"
        setJobActionMsg(`Refresh PRs failed: ${msg}`);
        return null;
      } finally {
        if (!opts?.silent) endBusy(busyToken);
      }
    },
    [beginBusy, detailStillOpen, endBusy, writeJobRow],
  );

  const loadDetail = useCallback(
    async (jobId: string) => {
      const epoch = detailEpoch.current;
      if (detailStillOpen(jobId, epoch)) setDetailLoading(true);
      try {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(jobId)}`,
        );
        if (!detailStillOpen(jobId, epoch) || job.jobId !== jobId) return;
        writeJobRow(job);
        setDetailJob(job);
        // Missing ghState or stale (>2 min): poll GitHub
        const needsGh =
          canRefreshPrs(job) &&
          ((job.prs || []).some((p) => isTrackablePr(p) && !p.ghState) ||
            prsStale(job.prs));
        if (needsGh && detailStillOpen(jobId, epoch)) {
          void refreshPrs(jobId, { silent: true });
        }
      } catch (e) {
        if (!detailStillOpen(jobId, epoch)) return;
        setJobActionMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (detailStillOpen(jobId, epoch)) setDetailLoading(false);
      }
    },
    [detailStillOpen, refreshPrs, writeJobRow],
  );

  const clearViewers = useCallback(() => {
    setOpenViewers((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const setDefectViewer = useCallback((defectId: string, open: boolean) => {
    setOpenViewers((prev) => {
      const has = prev.has(defectId);
      if (open === has) return prev;
      const next = new Set(prev);
      if (open) next.add(defectId);
      else next.delete(defectId);
      return next;
    });
  }, []);

  const openDetail = useCallback(
    (jobId: string) => {
      openJobRef.current = jobId;
      detailEpoch.current += 1;
      setDetailJobId(jobId);
      setDetailOpen(true);
      setDetailLoading(true);
      clearViewers();
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
    [clearViewers, loadDetail, setSearchParams],
  );

  const closeDetail = useCallback(() => {
    openJobRef.current = null;
    detailEpoch.current += 1;
    setDetailOpen(false);
    setDetailJobId(null);
    setDetailJob(null);
    setDetailLoading(false);
    clearViewers();
    setJobActionMsg('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('job');
        return next;
      },
      { replace: true },
    );
  }, [clearViewers, setSearchParams]);

  const clearShip = useCallback(() => {
    setShipPreview(null);
    setShipMessage('');
    setShipLoading(false);
    setShipError('');
    setDeletePreview(null);
    setDeletePreviewError('');
    deletePreviewFor.current = null;
    shipPreviewFor.current = null;
  }, []);

  const requestAction = useCallback(
    (action: JobAction, jobId: string) => {
      setActionTargetId(jobId);
      setPendingAction(action);
      clearShip();
      if (action === 'delete') {
        deletePreviewFor.current = jobId;
        void api<{ repos: WorktreeDiscard[] }>(
          `/api/batch-jobs/${encodeURIComponent(jobId)}/delete-preview`,
        )
          .then((res) => {
            if (deletePreviewFor.current === jobId) setDeletePreview(res.repos);
          })
          .catch((e) => {
            if (deletePreviewFor.current === jobId)
              setDeletePreviewError(e instanceof Error ? e.message : String(e));
          });
        return;
      }
      if (action !== 'create-pr') return;
      const job =
        batchJobs.find((j) => j.jobId === jobId) ||
        (detailJob?.jobId === jobId ? detailJob : null);
      if (integrateMode(job) === 'pr') return;
      shipPreviewFor.current = jobId;
      setShipLoading(true);
      void api<ShipPreview>(
        `/api/batch-jobs/${encodeURIComponent(jobId)}/ship-preview`,
      )
        .then((preview) => {
          if (shipPreviewFor.current !== jobId) return;
          setShipPreview(preview);
          setShipMessage(preview.message);
        })
        .catch((e) => {
          if (shipPreviewFor.current !== jobId) return;
          setShipError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (shipPreviewFor.current === jobId) setShipLoading(false);
        });
    },
    [batchJobs, clearShip, detailJob],
  );

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
      openJobRef.current = fromUrl;
      detailEpoch.current += 1;
      setDetailJobId(fromUrl);
      setDetailOpen(true);
      setDetailLoading(true);
      void loadDetail(fromUrl);
    }
    // only on app change / mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  // Once per opened job: Log while it is running or queued, otherwise Overview.
  // An operator pick for this id wins, including a pick made before the job
  // was known. Status changes after the choice must not move the tab.
  useEffect(() => {
    if (!detailOpen || !detailJobId) {
      tabForJob.current = null;
      tabPickedFor.current = null;
      return;
    }
    if (tabPickedFor.current === detailJobId) {
      tabForJob.current = detailJobId;
      return;
    }
    if (tabForJob.current === detailJobId) return;
    const known =
      detailJob?.jobId === detailJobId
        ? detailJob
        : batchJobs.find((j) => j.jobId === detailJobId);
    if (!known) return;
    tabForJob.current = detailJobId;
    setDrawerTab(tabForStatus(known.status));
  }, [detailOpen, detailJobId, detailJob, batchJobs]);

  useEffect(() => {
    if (!detailOpen) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [detailOpen]);

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

  const shipFiles = (shipPreview?.repos || []).flatMap((r) =>
    (r.files || []).map((path) => ({
      repo: r.repo,
      branch: r.branch,
      base: r.baseBranch,
      path,
    })),
  );

  async function executePendingAction() {
    const id = actionTargetId;
    const action = pendingAction;
    if (!id || !action) return;
    const busyToken = beginBusy();
    setJobActionMsg('');
    // List alert when no drawer is open; drawer alert only for the job it shows.
    const note = (message: string) => {
      const openId = openJobRef.current;
      if (openId == null || openId === id) setJobActionMsg(message);
    };
    const publish = (job: BatchJob) => {
      writeJobRow(job);
      if (openJobRef.current === job.jobId) setDetailJob(job);
    };
    try {
      if (action === 'delete') {
        const { cleanup } = await api<{ cleanup?: WorktreeDiscard[] }>(
          `/api/batch-jobs/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        );
        setPendingAction(null);
        setActionTargetId(null);
        clearShip();
        const wasOpen = openJobRef.current === id;
        if (wasOpen) closeDetail();
        const done = (cleanup ?? []).map(discardSummary).join(' · ');
        if (wasOpen || openJobRef.current == null) {
          setJobActionMsg(`Deleted ${id}${done ? ` — ${done}` : ''}`);
        }
        await refresh();
        return;
      }
      if (action === 'stop') {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(id)}/stop`,
          { method: 'POST' },
        );
        publish(job);
        note(`Stopped ${job.jobId}`);
      } else if (action === 'resume') {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(id)}/resume`,
          { method: 'POST' },
        );
        publish(job);
        if (openJobRef.current == null || openJobRef.current === id) {
          if (openJobRef.current == null) setDetailJob(job);
          openDetail(id);
        }
        note(`Resuming ${job.jobId}`);
      } else if (action === 'rerun') {
        const { job } = await api<{ job: BatchJob }>(
          `/api/batch-jobs/${encodeURIComponent(id)}/rerun`,
          { method: 'POST' },
        );
        publish(job);
        if (openJobRef.current == null || openJobRef.current === id) {
          if (openJobRef.current == null) setDetailJob(job);
          openDetail(id);
        }
        note(`Re-running ${job.jobId}`);
      } else if (action === 'create-pr') {
        const { job, prs } = await api<{
          job: BatchJob;
          prs: NonNullable<BatchJob['prs']>;
        }>(`/api/batch-jobs/${encodeURIComponent(id)}/create-prs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            shipFiles.length
              ? { commit: true, message: shipMessage }
              : {},
          ),
        });
        publish(job);
        if (openJobRef.current == null || openJobRef.current === id) {
          if (openJobRef.current == null) setDetailJob(job);
          openDetail(id);
        }
        const urls = (prs || [])
          .filter((p) => p.url)
          .map((p) => `${p.repo}: ${p.url}`)
          .join(' · ');
        const merged = (prs || [])
          .filter((p) => p.kind === 'merge' && p.status === 'merged')
          .map((p) => `${p.repo} into ${p.base}`)
          .join(' · ');
        const failed = (prs || []).filter((p) => p.status === 'failed').length;
        const failBit = failed ? ` (${failed} failed — see log)` : '';
        note(
          urls
            ? `PRs: ${urls}${merged ? ` · merged ${merged}` : ''}${failBit}`
            : merged
              ? `Merged ${merged}${failBit}`
              : failed
                ? `Create PR / merge finished with ${failed} failure(s) — see log`
                : 'Create PR / merge: no commits or skipped',
        );
      }
      setPendingAction(null);
      setActionTargetId(null);
      clearShip();
      await refresh();
      if (openJobRef.current === id) void loadDetail(id);
    } catch (e) {
      note(e instanceof Error ? e.message : String(e));
      setPendingAction(null);
      setActionTargetId(null);
      clearShip();
    } finally {
      endBusy(busyToken);
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
        renderCell: ({ row, value }) => {
          const label = String(value ?? '');
          const chip = (
            <Chip
              size="small"
              label={label}
              color={jobStatusColor(label)}
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
          );
          const queue = row.status === 'queued' ? row.simQueue : undefined;
          if (!queue) return chip;
          return (
            <Tooltip
              title={`Waiting for the simulator: #${queue.position}, behind ${queue.holder}`}
            >
              {chip}
            </Tooltip>
          );
        },
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
            <Tooltip
              title={
                shipAlreadyDone(row) ? 'Already merged' : integrateLabel(row)
              }
            >
              <span>
                <IconButton
                  size="small"
                  color="secondary"
                  aria-label={`${integrateLabel(row)} ${row.jobId}`}
                  disabled={
                    !canCreatePr(row) || shipAlreadyDone(row) || jobActionBusy
                  }
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

  const actionJob =
    (actionTargetId &&
      (batchJobs.find((j) => j.jobId === actionTargetId) ||
        (detailJob?.jobId === actionTargetId ? detailJob : null))) ||
    null;
  const pendingCopy =
    pendingAction === 'create-pr'
      ? integrateDialog(actionJob)
      : pendingAction
        ? ACTION_COPY[pendingAction]
        : null;

  const listedJob =
    (detailJobId && batchJobs.find((j) => j.jobId === detailJobId)) || null;
  const readyJob = detailJob?.jobId === detailJobId ? detailJob : null;
  // List rows omit harvests. Header and actions can use them; tab bodies wait
  // for the detail payload so a missing harvest record is not a flicker.
  const drawerJob = readyJob ?? listedJob;

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
      {jobActionMsg && !detailOpen ? (
        // With the drawer closed (e.g. after Delete) the drawer's copy of this
        // message is not on screen, so the list shows it.
        <Alert
          severity={/fail|error|cannot|invalid/i.test(jobActionMsg) ? 'warning' : 'info'}
          onClose={() => setJobActionMsg('')}
          sx={{ mb: 2 }}
        >
          {jobActionMsg}
        </Alert>
      ) : null}
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

      {/* Job detail drawer — View */}
      <Drawer
        anchor="right"
        open={detailOpen}
        onClose={closeDetail}
        disableEscapeKeyDown={openViewers.size > 0}
        slotProps={{
          paper: {
            sx: {
              width: 'min(760px, 100%)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h6"
              noWrap
              title={drawerJob?.batchId || undefined}
              sx={{ flex: 1, minWidth: 0 }}
            >
              {drawerJob?.batchId ||
                (detailLoading ? 'Loading…' : detailJobId || 'Job')}
            </Typography>
            <IconButton aria-label="Close" onClick={closeDetail}>
              <CloseIcon />
            </IconButton>
          </Box>
          {drawerJob ? (
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              alignItems="center"
              sx={{ mt: 0.75 }}
            >
              <Chip
                size="small"
                label={drawerJob.status}
                color={jobStatusColor(drawerJob.status)}
              />
              {(() => {
                const m = recentBatches.find((b) => b.id === drawerJob.batchId);
                return m && m.status !== drawerJob.status ? (
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
                {drawerJob.jobId}
              </Typography>
              {drawerJob.createdAt ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  title={absoluteLocal(drawerJob.createdAt)}
                  sx={{ alignSelf: 'center' }}
                >
                  created {relativeTime(drawerJob.createdAt, now)}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </Box>
        <DrawerActionBar
          job={drawerJob}
          jobId={detailJobId}
          busy={jobActionBusy}
          onStop={() => detailJobId && requestAction('stop', detailJobId)}
          onResume={() => detailJobId && requestAction('resume', detailJobId)}
          onRerun={() => detailJobId && requestAction('rerun', detailJobId)}
          onIntegrate={() =>
            detailJobId && requestAction('create-pr', detailJobId)
          }
          onRefreshLog={() => detailJobId && void loadDetail(detailJobId)}
          onRefreshPrs={() => detailJobId && void refreshPrs(detailJobId)}
          onDelete={() => detailJobId && requestAction('delete', detailJobId)}
        />
        <ActionReasons job={drawerJob} />
        <Tabs
          value={drawerTab}
          onChange={(_event, value) => {
            if (value === 'overview' || value === 'evidence' || value === 'log') {
              if (detailJobId) tabPickedFor.current = detailJobId;
              setDrawerTab(value);
            }
          }}
          aria-label="Job detail"
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: 'divider',
            minHeight: 40,
            flexShrink: 0,
          }}
        >
          <Tab
            label="Overview"
            value="overview"
            id="job-tab-overview"
            aria-controls="job-panel-overview"
            sx={{ minHeight: 40 }}
          />
          <Tab
            label="Evidence"
            value="evidence"
            id="job-tab-evidence"
            aria-controls="job-panel-evidence"
            sx={{ minHeight: 40 }}
          />
          <Tab
            label="Log"
            value="log"
            id="job-tab-log"
            aria-controls="job-panel-log"
            sx={{ minHeight: 40 }}
          />
        </Tabs>
        {!readyJob ? (
          <Box
            role="tabpanel"
            id={`job-panel-${drawerTab}`}
            aria-labelledby={`job-tab-${drawerTab}`}
            sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}
          >
            {detailLoading ? (
              <LoadingState />
            ) : (
              <Stack spacing={1}>
                {jobActionMsg ? (
                  <Alert
                    severity={
                      /fail|error|cannot|invalid/i.test(jobActionMsg) &&
                      !/0 failed|no failure/i.test(jobActionMsg)
                        ? 'error'
                        : 'info'
                    }
                  >
                    {jobActionMsg}
                  </Alert>
                ) : null}
                <Typography color="text.secondary">Job not found.</Typography>
              </Stack>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Box
              role="tabpanel"
              id="job-panel-overview"
              aria-labelledby="job-tab-overview"
              hidden={drawerTab !== 'overview'}
              sx={{ height: '100%', overflow: 'auto', px: 2, py: 2 }}
            >
              {drawerTab === 'overview' ? (
                <JobOverview
                  job={readyJob}
                  jobActionMsg={jobActionMsg}
                  onNavigateDefect={closeDetail}
                />
              ) : null}
            </Box>
            <Box
              role="tabpanel"
              id="job-panel-evidence"
              aria-labelledby="job-tab-evidence"
              hidden={drawerTab !== 'evidence'}
              sx={{ height: '100%', overflow: 'auto', px: 2, py: 2 }}
            >
              {drawerTab === 'evidence' ? (
                <JobEvidence
                  job={readyJob}
                  onViewerChange={setDefectViewer}
                  onNavigateDefect={closeDetail}
                />
              ) : null}
            </Box>
            <Box
              role="tabpanel"
              id="job-panel-log"
              aria-labelledby="job-tab-log"
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                px: 2,
                py: 2,
                visibility: drawerTab === 'log' ? 'visible' : 'hidden',
                pointerEvents: drawerTab === 'log' ? 'auto' : 'none',
              }}
              aria-hidden={drawerTab === 'log' ? undefined : true}
              inert={drawerTab === 'log' ? undefined : true}
            >
              <JobLogPanel
                jobId={readyJob.jobId}
                lines={readyJob.log || []}
                shown={drawerTab === 'log'}
                logBoxRef={logBoxRef}
                logEndRef={logEndRef}
              />
            </Box>
          </Box>
        )}
      </Drawer>

      <Dialog
        open={
          pendingAction === 'create-pr' &&
          (shipLoading || shipFiles.length > 0 || !!shipError)
        }
        onClose={() => {
          if (!jobActionBusy) {
            setPendingAction(null);
            setActionTargetId(null);
            clearShip();
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Commit and merge?</DialogTitle>
        <DialogContent>
          {shipLoading ? (
            <Typography variant="body2">Checking the worktree…</Typography>
          ) : shipError ? (
            <Alert severity="warning">{shipError}</Alert>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="body2">
                Commit these files on{' '}
                {[...new Set(shipFiles.map((f) => f.branch))].join(', ')}, then
                merge into{' '}
                {[...new Set(shipFiles.map((f) => f.base).filter(Boolean))].join(
                  ', ',
                )}
                . Cancel leaves the worktree unchanged.
              </Typography>
              {shipFiles.map((f) => (
                <Typography
                  key={`${f.repo}:${f.path}`}
                  variant="caption"
                  component="div"
                  sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                >
                  {f.repo}: {f.path}
                </Typography>
              ))}
              <TextField
                label="Commit message"
                value={shipMessage}
                onChange={(e) => setShipMessage(e.target.value)}
                multiline
                minRows={3}
                fullWidth
                size="small"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (!jobActionBusy) {
                setPendingAction(null);
                setActionTargetId(null);
                clearShip();
              }
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            disabled={
              jobActionBusy ||
              shipLoading ||
              !!shipError ||
              shipFiles.length === 0 ||
              !shipMessage.trim()
            }
            onClick={() => void executePendingAction()}
          >
            {jobActionBusy ? 'Working…' : 'Commit and merge'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm modal for Stop / Resume / Re-run / Create PR / Delete */}
      <ConfirmDialog
        open={
          !!pendingAction &&
          !!actionTargetId &&
          !(
            pendingAction === 'create-pr' &&
            (shipLoading || shipFiles.length > 0 || !!shipError)
          )
        }
        title={pendingCopy?.title ?? 'Confirm'}
        message={
          pendingCopy && actionTargetId
            ? pendingCopy.message(actionTargetId)
            : ''
        }
        details={
          pendingAction === 'delete' ? (
            <DeletePreviewList
              repos={deletePreview}
              error={deletePreviewError}
            />
          ) : undefined
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
            clearShip();
          }
        }}
      />
    </ListPage>
  );
}
