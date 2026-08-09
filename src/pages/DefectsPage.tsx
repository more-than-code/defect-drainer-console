import AddIcon from '@mui/icons-material/Add';
import BuildIcon from '@mui/icons-material/Build';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { useAppContext } from '../AppContext';
import {
  api,
  evidenceUrl,
  type AppRecord,
  type BatchJob,
  type BatchJobPr,
  type BatchRecord,
  type Defect,
} from '../api';
import {
  AdminDataGrid,
  cellTextClamp2,
} from '../components/AdminDataGrid';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { FilterSelect } from '../components/FilterSelect';
import { ListPage } from '../components/ListPage';
import { LoadingState } from '../components/LoadingState';
import { MarkdownBody } from '../components/MarkdownBody';
import { ReportDefectDialog } from '../components/ReportDefectDialog';
import { SearchField } from '../components/SearchField';
import {
  allTrackableMerged,
  ghStateColor,
  isTrackablePr,
  summarizePrs,
} from '../prStatus';

type LinkedJob = {
  jobId: string;
  batchId: string;
  status: string;
  prs: BatchJobPr[];
};

/** Short label for table: last segment of DEF-… id */
function shortDefectId(id: string): string {
  const parts = id.split('-');
  if (parts.length <= 3) return id;
  // DEF-YYYYMMDD-<slug…>-xxxx → keep DEF + date + tail
  const tail = parts[parts.length - 1] || '';
  const date = parts[1] || '';
  return `DEF-${date}…${tail}`;
}

function defectStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'resolved') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'wontfix' || status === 'duplicate') return 'default';
  if (status === 'open' || status === 'triaged') return 'warning';
  return 'default';
}

function appRepoUrlText(app: AppRecord | undefined): string {
  if (!app) return '';
  const urls = [
    ...(app.repo_urls || []),
    ...(app.repo_url ? [app.repo_url] : []),
  ]
    .map((u) => u.trim())
    .filter(Boolean);
  return [...new Set(urls)].join('\n');
}

export function DefectsPage() {
  const { appId, app } = useAppContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('all');
  /** Workflow status filter (default all — not open/resolved “bucket”) */
  const [status, setStatus] = useState('all');

  const [goal, setGoal] = useState('');
  const [forceLocalBatch, setForceLocalBatch] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');

  /** Jobs that reference each defect (for linking Defect → Jobs) */
  const [jobsByDefect, setJobsByDefect] = useState<
    Record<string, LinkedJob[]>
  >({});

  /** Defect detail modal */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Defect | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const [deleteDefectOpen, setDeleteDefectOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** Create defect (former Report page) as list-row creation modal */
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!appId) return;
    try {
      const [listRes, batchesRes] = await Promise.all([
        api<{ defects: Defect[] }>(
          `/api/defects?bucket=all&app_id=${encodeURIComponent(appId)}`,
        ),
        api<{ batches: BatchRecord[]; jobs: BatchJob[] }>('/api/batches'),
      ]);
      setDefects(listRes.defects);
      const map: Record<string, LinkedJob[]> = {};
      for (const j of batchesRes.jobs || []) {
        if (j.app_id && j.app_id !== appId) continue;
        for (const did of j.defect_ids || []) {
          if (!map[did]) map[did] = [];
          map[did]!.push({
            jobId: j.jobId,
            batchId: j.batchId,
            status: j.status,
            prs: j.prs || [],
          });
        }
      }
      setJobsByDefect(map);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = window.setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    setSelected(new Set());
    setDetailId(null);
    setDetail(null);
  }, [appId]);

  const openDetail = useCallback(
    async (id: string) => {
      setDetailId(id);
      setDetailLoading(true);
      setDetailError('');
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('id', id);
          return next;
        },
        { replace: true },
      );
      try {
        const { defect: d } = await api<{ defect: Defect }>(
          `/api/defects/${encodeURIComponent(id)}`,
        );
        setDetail(d);
      } catch (e) {
        setDetail(null);
        setDetailError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [setSearchParams],
  );

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setDetailError('');
    setDeleteDefectOpen(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('id');
        return next;
      },
      { replace: true },
    );
  }

  // Deep-link: /?id=DEF-… opens defect detail
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && appId && id !== detailId) {
      void openDetail(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, searchParams.get('id')]);

  async function reopenDetail() {
    if (!detailId) return;
    setDetailBusy(true);
    try {
      await api(`/api/defects/${encodeURIComponent(detailId)}/reopen`, {
        method: 'POST',
      });
      await openDetail(detailId);
      await refresh();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailBusy(false);
    }
  }

  async function deleteDetail() {
    if (!detailId) return;
    setDetailBusy(true);
    try {
      await api(
        `/api/defects/${encodeURIComponent(detailId)}?evidence=1`,
        { method: 'DELETE' },
      );
      setDeleteDefectOpen(false);
      closeDetail();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(detailId);
        return next;
      });
      await refresh();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
      setDeleteDefectOpen(false);
    } finally {
      setDetailBusy(false);
    }
  }

  const filtered = useMemo(() => {
    let rows = [...defects];
    const query = q.trim().toLowerCase();
    if (query) {
      rows = rows.filter((d) => {
        const hay = [d.id, d.title, d.summary, d.surface, d.source]
          .join(' ')
          .toLowerCase();
        return hay.includes(query);
      });
    }
    if (severity !== 'all') rows = rows.filter((d) => d.severity === severity);
    if (status !== 'all') rows = rows.filter((d) => d.status === status);
    return rows;
  }, [defects, q, severity, status]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const rowSelectionModel: GridRowSelectionModel = useMemo(
    () => Array.from(selected),
    [selected],
  );

  const defectColumns = useMemo<GridColDef<Defect>[]>(
    () => [
      {
        field: 'id',
        headerName: 'ID',
        flex: 0.55,
        minWidth: 72,
        renderCell: ({ row }) => (
          <Tooltip title={row.id}>
            <Typography
              variant="body2"
              sx={{
                ...cellTextClamp2,
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11,
              }}
            >
              {shortDefectId(row.id)}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'severity',
        headerName: 'Sev',
        flex: 0.35,
        minWidth: 52,
        maxWidth: 80,
        renderCell: ({ value }) => (
          <Chip
            size="small"
            label={String(value ?? '')}
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
        field: 'status',
        headerName: 'Status',
        flex: 0.55,
        minWidth: 72,
        maxWidth: 110,
        renderCell: ({ value }) => (
          <Chip
            size="small"
            label={String(value ?? '')}
            color={defectStatusColor(String(value ?? ''))}
            variant={value === 'in_progress' ? 'filled' : 'outlined'}
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
        field: 'title',
        headerName: 'Title',
        flex: 1.4,
        minWidth: 100,
        valueGetter: (_v, row) => row.title || row.summary || '',
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0, width: '100%', py: 0.25 }}>
            <Typography variant="body2" sx={{ ...cellTextClamp2, fontSize: 13 }}>
              {row.title || row.summary || '—'}
            </Typography>
            {row.surface ? (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={cellTextClamp2}
              >
                {row.surface}
              </Typography>
            ) : null}
          </Box>
        ),
      },
      {
        field: 'reported',
        headerName: 'Reported',
        flex: 0.5,
        minWidth: 72,
        maxWidth: 110,
        valueGetter: (_v, row) => row.reported || '',
        renderCell: ({ value }) => (
          <Typography variant="caption" sx={cellTextClamp2}>
            {String(value ?? '')}
          </Typography>
        ),
      },
      {
        field: 'jobs',
        headerName: 'Jobs',
        flex: 0.55,
        minWidth: 64,
        sortable: false,
        valueGetter: (_v, row) => (jobsByDefect[row.id] || []).length,
        renderCell: ({ row }) => {
          const jobs = jobsByDefect[row.id] || [];
          if (!jobs.length) {
            return (
              <Typography variant="caption" color="text.secondary">
                —
              </Typography>
            );
          }
          return (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {jobs.slice(0, 3).map((j) => (
                <Chip
                  key={j.jobId}
                  size="small"
                  variant="outlined"
                  color="primary"
                  label={j.status}
                  title={`${j.jobId} · ${j.batchId}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/jobs?job=${encodeURIComponent(j.jobId)}`);
                  }}
                  sx={{ cursor: 'pointer', height: 22, fontSize: 11 }}
                />
              ))}
              {jobs.length > 3 ? (
                <Typography variant="caption" color="text.secondary">
                  +{jobs.length - 3}
                </Typography>
              ) : null}
            </Stack>
          );
        },
      },
      {
        field: 'evidence',
        headerName: 'Ev',
        flex: 0.4,
        minWidth: 48,
        maxWidth: 80,
        sortable: false,
        valueGetter: (_v, row) =>
          `${(row.evidence || []).length}/${(row.fix_evidence || []).length}`,
        renderCell: ({ row }) => (
          <Tooltip
            title={`report ${(row.evidence || []).length} · fix ${(row.fix_evidence || []).length}`}
          >
            <Typography variant="caption" sx={cellTextClamp2}>
              {(row.evidence || []).length}
              {(row.fix_evidence || []).length
                ? ` · f${(row.fix_evidence || []).length}`
                : ''}
            </Typography>
          </Tooltip>
        ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 88,
        minWidth: 88,
        maxWidth: 88,
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
          >
            <Tooltip title="View details">
              <IconButton
                size="small"
                aria-label={`View ${row.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void openDetail(row.id);
                }}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                aria-label={`Delete ${row.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void openDetail(row.id).then(() => setDeleteDefectOpen(true));
                }}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [openDetail, jobsByDefect, navigate],
  );

  async function startBatchFix() {
    const defect_ids = [...selected];
    if (!defect_ids.length) {
      setBatchMsg('Select at least one defect');
      return;
    }
    // Repo URLs come from App Settings only (not shown on Defects)
    const urls = appRepoUrlText(app ?? undefined)
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!urls.length) {
      setBatchMsg(
        'No repo URL on this app — add named repo URLs under App Settings',
      );
      return;
    }
    setBatchBusy(true);
    setBatchMsg('Cloning repo URL(s) and creating worktrees…');
    try {
      const res = await api<{ batch: BatchRecord; job: BatchJob }>('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: appId!,
          defect_ids,
          goal:
            goal.trim() ||
            `Fix ${defect_ids.length} selected defect(s) for ${appId}`,
          mode: forceLocalBatch ? 'manual' : 'grok',
          start_fix: true,
          ...(urls.length === 1
            ? { repo_url: urls[0] }
            : urls.length > 1
              ? { repo_urls: urls }
              : {}),
        }),
      });
      const wt = (res.job as BatchJob & { worktrees?: { worktreeAbs: string; repo: string }[] })
        .worktrees;
      const wtHint =
        wt?.length
          ? ` · worktrees: ${wt.map((w) => w.repo).join(', ')}`
          : '';
      setBatchMsg(
        `Batch ${res.batch.id} · job ${res.job.jobId} (${res.job.status})${wtHint} — opening Jobs…`,
      );
      setSelected(new Set());
      await refresh();
      navigate(`/jobs?job=${encodeURIComponent(res.job.jobId)}`);
    } catch (e) {
      setBatchMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <ListPage
      title="Defects"
      totalLabel={`${filtered.length} total · ${selected.size} selected`}
      primaryAction={{
        label: 'New defect',
        onClick: () => setCreateOpen(true),
        icon: <AddIcon />,
      }}
      description={
        <>
          Defects for <strong>{app?.name ?? 'app'}</strong>
          {app?.repos?.length ? ` · ${app.repos.join(', ')}` : ''}.{' '}
          <strong>New defect</strong> reports an issue; <strong>View</strong> for
          details; checkbox selects for batch agent fix (
          <Typography component={RouterLink} to="/jobs" variant="body2">
            Jobs
          </Typography>
          ).
        </>
      }
      filters={
        <>
          <FilterSelect
            label="Status"
            value={status}
            allLabel="all"
            options={[
              'open',
              'triaged',
              'in_progress',
              'resolved',
              'wontfix',
              'duplicate',
            ].map((s) => ({ value: s, label: s }))}
            onChange={setStatus}
            minWidth={140}
          />
          <SearchField
            label="Search"
            value={q}
            live
            onSearch={setQ}
            placeholder="id, title, surface…"
            sx={{ flex: 1, minWidth: 220 }}
          />
          <FilterSelect
            label="Severity"
            value={severity}
            allLabel="all"
            options={['P0', 'P1', 'P2', 'P3'].map((s) => ({
              value: s,
              label: s,
            }))}
            onChange={setSeverity}
            minWidth={110}
          />
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              aria-label="Refresh defects"
              onClick={() => void refresh()}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </>
      }
      error={error || null}
    >
      {/* Secondary toolbar — batch start (not the primary table) */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider' }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" fontWeight={700}>
            Batch agent fix
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Selected rows → worktrees + coding agent. Repo URLs from{' '}
            <Typography component={RouterLink} to="/settings" variant="body2">
              App Settings
            </Typography>
            .
          </Typography>
          <TextField
            size="small"
            label="Goal (optional)"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            fullWidth
            placeholder="e.g. Fix chat canvas P1/P2 layout bugs"
          />
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<BuildIcon />}
              disabled={batchBusy || selected.size === 0}
              onClick={() => void startBatchFix()}
            >
              Start batch fix ({selected.size})
            </Button>
            <FormControlLabel
              control={
                <Checkbox
                  checked={forceLocalBatch}
                  onChange={(e) => setForceLocalBatch(e.target.checked)}
                />
              }
              label="manual only (no agent spawn)"
            />
          </Stack>
          {batchMsg ? (
            <Alert
              severity={
                batchMsg.includes('not found') || batchMsg.includes('Select')
                  ? 'warning'
                  : 'info'
              }
            >
              {batchMsg}
            </Alert>
          ) : null}
        </Stack>
      </Paper>

      {/* Primary table — mo-webadmin ServerDataGrid role */}
      <Box sx={{ mb: 2 }}>
        <AdminDataGrid
          aria-label="Defects"
          rows={filtered}
          columns={defectColumns}
          loading={loading}
          getRowId={(row) => row.id}
          density="compact"
          checkboxSelection
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={(model) => {
            setSelected(new Set(model.map(String)));
          }}
          localeText={{
            noRowsLabel: 'No defects — click New defect to report one',
          }}
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 48}
        />
      </Box>

      <ReportDefectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(defectId) => {
          void refresh().then(() => void openDetail(defectId));
        }}
      />

      {/* Defect detail — modal only (no navigation to Report) */}
      <Dialog
        open={!!detailId}
        onClose={closeDetail}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 6 }}>
          {detailLoading
            ? 'Loading…'
            : detail?.title || detail?.id || detailId || 'Defect'}
          <IconButton
            aria-label="Close"
            onClick={closeDetail}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailLoading ? (
            <LoadingState />
          ) : detailError && !detail ? (
            <ErrorState message={detailError} />
          ) : detail ? (
            <Stack spacing={2}>
              {detailError ? (
                <Alert severity="error">{detailError}</Alert>
              ) : null}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={detail.severity} />
                <Chip
                  size="small"
                  label={detail.status}
                  color={defectStatusColor(detail.status)}
                />
                {detail.surface ? (
                  <Chip size="small" variant="outlined" label={detail.surface} />
                ) : null}
                {(detail.repos || []).map((r) => (
                  <Chip key={r} size="small" variant="outlined" label={r} />
                ))}
              </Stack>
              <Typography
                variant="caption"
                display="block"
                sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
              >
                {detail.id}
                {detail.reported ? ` · reported ${detail.reported}` : ''}
                {detail.source ? ` · ${detail.source}` : ''}
              </Typography>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Linked jobs
                </Typography>
                {(jobsByDefect[detail.id] || []).length ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {(jobsByDefect[detail.id] || []).map((j) => (
                      <Chip
                        key={j.jobId}
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={`${j.batchId.slice(-6)} · ${j.status}`}
                        title={j.jobId}
                        onClick={() =>
                          navigate(`/jobs?job=${encodeURIComponent(j.jobId)}`)
                        }
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    No batch jobs yet — select this defect and start a batch fix
                  </Typography>
                )}
              </Box>
              {(() => {
                const linked = jobsByDefect[detail.id] || [];
                const allPrs = linked.flatMap((j) =>
                  (j.prs || []).map((p) => ({ ...p, jobId: j.jobId })),
                );
                const trackable = allPrs.filter(isTrackablePr);
                if (!trackable.length) return null;
                const summary = summarizePrs(allPrs);
                const allMerged = allTrackableMerged(allPrs);
                const openBucket =
                  detail.status !== 'resolved' &&
                  detail.status !== 'wontfix' &&
                  detail.status !== 'duplicate';
                return (
                  <Box>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mb: 0.75 }}
                    >
                      <Typography variant="subtitle2">Linked PRs</Typography>
                      {summary ? (
                        <Chip
                          size="small"
                          label={summary}
                          color={
                            allMerged
                              ? 'success'
                              : trackable.some((p) => p.ghState === 'open')
                                ? 'info'
                                : 'default'
                          }
                        />
                      ) : null}
                    </Stack>
                    {allMerged && openBucket ? (
                      <Alert severity="success" sx={{ mb: 1, py: 0 }}>
                        All linked PRs are merged
                        {(detail.fix_evidence || []).length
                          ? ' — you can resolve this defect when ready.'
                          : ' — add fix evidence before resolving.'}
                      </Alert>
                    ) : null}
                    <Stack spacing={0.5}>
                      {allPrs.map((p) => (
                        <Stack
                          key={`${p.jobId}-${p.repo}-${p.branch}`}
                          direction="row"
                          spacing={0.75}
                          flexWrap="wrap"
                          useFlexGap
                          alignItems="center"
                        >
                          <Typography variant="caption" fontWeight={700}>
                            {p.repo}
                          </Typography>
                          {p.ghState ? (
                            <Chip
                              size="small"
                              label={p.ghState}
                              color={ghStateColor(p.ghState)}
                              sx={{
                                height: 22,
                                textTransform: 'capitalize',
                              }}
                            />
                          ) : (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={p.status}
                              sx={{ height: 22 }}
                            />
                          )}
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
                          <Chip
                            size="small"
                            variant="outlined"
                            label={p.jobId.slice(-10)}
                            title={p.jobId}
                            onClick={() =>
                              navigate(
                                `/jobs?job=${encodeURIComponent(p.jobId)}`,
                              )
                            }
                            sx={{ cursor: 'pointer', height: 22 }}
                          />
                        </Stack>
                      ))}
                    </Stack>
                  </Box>
                );
              })()}
              {detail.summary ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Summary
                  </Typography>
                  <Typography variant="body2">{detail.summary}</Typography>
                </Box>
              ) : null}
              {detail.resolution ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Resolution
                  </Typography>
                  <MarkdownBody>{detail.resolution}</MarkdownBody>
                </Box>
              ) : null}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Report evidence
                </Typography>
                {(detail.evidence || []).length ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {detail.evidence.map((rel) => {
                      const url = evidenceUrl(rel);
                      if (!url) return null;
                      return (
                        <Box
                          key={rel}
                          component="img"
                          src={url}
                          alt={rel}
                          onClick={() => setLightbox(url)}
                          sx={{
                            width: 96,
                            height: 96,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'divider',
                            cursor: 'zoom-in',
                          }}
                        />
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    None
                  </Typography>
                )}
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Fix evidence
                </Typography>
                {(detail.fix_evidence || []).length ? (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {detail.fix_evidence!.map((rel) => {
                      const url = evidenceUrl(rel);
                      if (!url) return null;
                      return (
                        <Box
                          key={rel}
                          component="img"
                          src={url}
                          alt={rel}
                          onClick={() => setLightbox(url)}
                          sx={{
                            width: 96,
                            height: 96,
                            objectFit: 'cover',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'success.main',
                            cursor: 'zoom-in',
                          }}
                        />
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    None yet
                  </Typography>
                )}
              </Box>
              {detail.body ? (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Body
                  </Typography>
                  <Box
                    sx={{
                      p: 1.5,
                      maxHeight: 280,
                      overflow: 'auto',
                      bgcolor: 'background.default',
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                    }}
                  >
                    <MarkdownBody dense>{detail.body}</MarkdownBody>
                  </Box>
                </Box>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button
            size="small"
            onClick={() => {
              if (detailId) toggleOne(detailId);
            }}
          >
            {detailId && selected.has(detailId)
              ? 'Remove from batch selection'
              : 'Add to batch selection'}
          </Button>
          <Box sx={{ flex: 1 }} />
          {detail?.status === 'resolved' || detail?.status === 'wontfix' ? (
            <Button
              size="small"
              disabled={detailBusy}
              onClick={() => void reopenDetail()}
            >
              Reopen
            </Button>
          ) : null}
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={detailBusy || !detailId}
            onClick={() => setDeleteDefectOpen(true)}
          >
            Delete
          </Button>
          <Button variant="contained" onClick={closeDetail}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteDefectOpen}
        title="Delete defect?"
        message={`Delete ${detailId ?? 'this defect'} and its evidence files?`}
        confirmLabel={detailBusy ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        onConfirm={() => void deleteDetail()}
        onCancel={() => setDeleteDefectOpen(false)}
      />

      <Dialog
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        maxWidth="lg"
        onClick={() => setLightbox(null)}
      >
        {lightbox ? (
          <Box
            component="img"
            src={lightbox}
            alt="Preview"
            sx={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'block',
              cursor: 'zoom-out',
            }}
          />
        ) : null}
      </Dialog>
    </ListPage>
  );
}
