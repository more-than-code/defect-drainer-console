/**
 * Phase A analytics — defect mix, prompt_use top-N, job success (SQL via API).
 */
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { api } from '../api';
import { ListPage } from '../components/ListPage';
import { LoadingState } from '../components/LoadingState';
import { defectStatusLabel } from '../defectStatus';

type AggRow = { key: string; count: number };

type AnalyticsSummary = {
  app_id: string | null;
  defects: {
    total: number;
    by_severity: AggRow[];
    by_area: AggRow[];
    by_status: AggRow[];
    by_source: AggRow[];
    by_bucket: AggRow[];
    by_surface: AggRow[];
  };
  prompts: {
    total: number;
    top: Array<{
      prompt_key: string;
      uses: number;
      success: number;
      fail: number;
      aborted: number;
      unknown: number;
      last_used: string;
    }>;
  };
  jobs: {
    total: number;
    by_status: AggRow[];
    completed: number;
    failed: number;
    success_rate: number | null;
    pr_merged_total: number;
  };
};

type SearchHit = {
  id: string;
  artifact_type?: string;
  app_id?: string;
  defect_id?: string | null;
  job_id?: string | null;
  title?: string | null;
  body_text?: string | null;
  summary?: string;
  severity?: string | null;
  status?: string | null;
  area?: string | null;
  prompt_key?: string | null;
  blob_uri?: string | null;
  snippet?: string;
};

type FacetBucket = { key: string; count: number };

type SearchStatus = {
  enabled: boolean;
  url: string | null;
  index: string;
  reachable: boolean;
  outbox: number;
};

function BarList({
  title,
  rows,
  empty = 'No data',
}: {
  title: string;
  rows: AggRow[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', flex: 1, minWidth: 220 }}>
      <Typography variant="subtitle2" fontWeight={700} gutterBottom>
        {title}
      </Typography>
      {!rows.length ? (
        <Typography variant="caption" color="text.secondary">
          {empty}
        </Typography>
      ) : (
        <Stack spacing={1}>
          {rows.map((r) => (
            <Box key={r.key}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                <Typography variant="caption" noWrap title={r.key} sx={{ maxWidth: '70%' }}>
                  {r.key}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.count}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={(r.count / max) * 100}
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

export function AnalyticsPage() {
  const { appId, app } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [q, setQ] = useState('');
  const [artifactType, setArtifactType] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchMode, setSearchMode] = useState('');
  const [searchTotal, setSearchTotal] = useState(0);
  const [facets, setFacets] = useState<{
    artifact_type?: FacetBucket[];
    severity?: FacetBucket[];
    area?: FacetBucket[];
    status?: FacetBucket[];
  }>({});
  const [osStatus, setOsStatus] = useState<SearchStatus | null>(null);
  const [osError, setOsError] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const [res, st] = await Promise.all([
        api<{ analytics: AnalyticsSummary }>(
          `/api/analytics?app_id=${encodeURIComponent(appId)}`,
        ),
        api<SearchStatus>('/api/search/status').catch(() => null),
      ]);
      setSummary(res.analytics);
      if (st) setOsStatus(st);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async () => {
    if (!appId) return;
    setSearchBusy(true);
    setOsError('');
    try {
      const params = new URLSearchParams({
        app_id: appId,
        limit: '40',
      });
      if (q.trim()) params.set('q', q.trim());
      if (artifactType) params.set('artifact_type', artifactType);
      const res = await api<{
        hits: SearchHit[];
        mode: string;
        total?: number;
        facets?: typeof facets;
        opensearch?: { ok?: boolean; error?: string };
      }>(`/api/search?${params.toString()}`);
      setSearchHits(res.hits || []);
      setSearchMode(res.mode || '');
      setSearchTotal(res.total ?? res.hits?.length ?? 0);
      setFacets(res.facets || {});
      if (res.opensearch && res.opensearch.ok === false && res.opensearch.error) {
        setOsError(res.opensearch.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  }, [appId, q, artifactType]);

  function hitLink(h: SearchHit): string {
    if (h.defect_id) return `/?id=${encodeURIComponent(h.defect_id)}`;
    if (h.job_id) return `/jobs?job=${encodeURIComponent(h.job_id)}`;
    if (h.artifact_type === 'defect_summary' && h.id)
      return `/?id=${encodeURIComponent(h.id.replace(/^defect_summary:/, ''))}`;
    return '/';
  }

  function typeColor(
    t?: string,
  ): 'default' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' {
    if (t === 'defect_summary') return 'primary';
    if (t === 'prompt') return 'secondary';
    if (t === 'screenshot' || t === 'fix_evidence') return 'info';
    if (t === 'job_summary' || t === 'job_log') return 'warning';
    return 'default';
  }

  const rate =
    summary?.jobs.success_rate != null
      ? `${Math.round(summary.jobs.success_rate * 100)}%`
      : '—';

  return (
    <ListPage
      title="Analytics"
      totalLabel={
        summary
          ? `${summary.defects.total} defects · ${summary.prompts.total} prompts · ${summary.jobs.total} jobs`
          : undefined
      }
      description={
        <>
          Analytics for <strong>{app?.name ?? 'app'}</strong>
          {' — '}
          SQL KPIs (Phase A) + multi-artifact search (Phase B OpenSearch when
          enabled, else FTS).
          {osStatus ? (
            <>
              {' '}
              Search:{' '}
              <Chip
                size="small"
                label={
                  osStatus.enabled
                    ? osStatus.reachable
                      ? 'OpenSearch up'
                      : 'OpenSearch down → FTS'
                    : 'FTS only'
                }
                color={
                  osStatus.enabled && osStatus.reachable ? 'success' : 'default'
                }
                sx={{ height: 22, verticalAlign: 'middle' }}
              />
              {osStatus.outbox > 0 ? (
                <Chip
                  size="small"
                  color="warning"
                  label={`outbox ${osStatus.outbox}`}
                  sx={{ height: 22, ml: 0.5, verticalAlign: 'middle' }}
                />
              ) : null}
            </>
          ) : null}
        </>
      }
      primaryAction={{
        label: 'Refresh',
        onClick: () => void load(),
        icon: <RefreshIcon />,
        disabled: loading,
      }}
      error={error}
    >
      {loading && !summary ? (
        <LoadingState />
      ) : summary ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`${summary.defects.total} defects`} color="primary" />
            <Chip size="small" label={`${summary.prompts.total} prompt uses`} />
            <Chip size="small" label={`${summary.jobs.total} jobs`} />
            <Chip size="small" color="success" label={`job success ${rate}`} />
            <Chip
              size="small"
              variant="outlined"
              label={`PRs merged (obs.) ${summary.jobs.pr_merged_total}`}
            />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <BarList title="By severity" rows={summary.defects.by_severity} />
            <BarList title="By area" rows={summary.defects.by_area} />
            <BarList
              title="By status"
              rows={summary.defects.by_status.map((r) => ({
                ...r,
                key: defectStatusLabel(r.key === '(empty)' ? '' : r.key),
              }))}
            />
            <BarList title="By source" rows={summary.defects.by_source} />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <BarList
              title="Open vs resolved"
              rows={summary.defects.by_bucket.map((r) => ({
                ...r,
                // API still uses internal bucket field; show operator labels
                key:
                  r.key === 'open'
                    ? 'Open'
                    : r.key === 'resolved'
                      ? 'Resolved'
                      : r.key,
              }))}
            />
            <BarList title="By surface" rows={summary.defects.by_surface} />
            <BarList title="Jobs by status" rows={summary.jobs.by_status} />
          </Stack>

          <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Prompt use (top)
            </Typography>
            {!summary.prompts.top.length ? (
              <Typography variant="caption" color="text.secondary">
                No prompt_use rows yet — start a batch agent fix to record{' '}
                <code>batch_fix.v1</code>.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>prompt_key</TableCell>
                    <TableCell align="right">uses</TableCell>
                    <TableCell align="right">ok</TableCell>
                    <TableCell align="right">fail</TableCell>
                    <TableCell align="right">abort</TableCell>
                    <TableCell>last used</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.prompts.top.map((p) => (
                    <TableRow key={p.prompt_key}>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
                        >
                          {p.prompt_key}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{p.uses}</TableCell>
                      <TableCell align="right">{p.success}</TableCell>
                      <TableCell align="right">{p.fail}</TableCell>
                      <TableCell align="right">{p.aborted}</TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {p.last_used?.slice(0, 19).replace('T', ' ') || '—'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Multi-artifact search
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search defects, prompts, evidence, jobs…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void runSearch();
                }}
              />
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                disabled={searchBusy}
                onClick={() => void runSearch()}
              >
                Search
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {(
                [
                  ['', 'All'],
                  ['defect_summary', 'Defect'],
                  ['prompt', 'Prompt'],
                  ['screenshot', 'Screenshot'],
                  ['fix_evidence', 'Fix evidence'],
                  ['job_summary', 'Job'],
                  ['job_log', 'Job log'],
                ] as const
              ).map(([val, label]) => (
                <Chip
                  key={label}
                  size="small"
                  label={label}
                  color={artifactType === val ? 'primary' : 'default'}
                  variant={artifactType === val ? 'filled' : 'outlined'}
                  onClick={() => setArtifactType(val)}
                  sx={{ cursor: 'pointer' }}
                />
              ))}
            </Stack>
            {facets.artifact_type?.length ? (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                Facets:{' '}
                {facets.artifact_type.map((f) => `${f.key}(${f.count})`).join(' · ')}
              </Typography>
            ) : null}
            {searchMode ? (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                mode: {searchMode} · {searchTotal} hit(s)
                {osError ? ` · OS error: ${osError.slice(0, 80)}` : ''}
              </Typography>
            ) : null}
            {!searchHits.length ? (
              <Typography variant="caption" color="text.secondary">
                Run a query. With OpenSearch up: multi-type results. Otherwise Phase A defect FTS.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {searchHits.map((h) => (
                  <Box
                    key={h.id}
                    component={RouterLink}
                    to={hitLink(h)}
                    sx={{
                      textDecoration: 'none',
                      color: 'inherit',
                      p: 1,
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        size="small"
                        color={typeColor(h.artifact_type)}
                        label={h.artifact_type || 'hit'}
                        sx={{ height: 20 }}
                      />
                      <Typography variant="body2" fontWeight={600}>
                        {h.title || h.prompt_key || h.id}
                      </Typography>
                      {h.severity ? (
                        <Chip size="small" label={h.severity} sx={{ height: 20 }} />
                      ) : null}
                      {h.status ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={
                            h.artifact_type === 'defect_summary' ||
                            h.artifact_type === 'screenshot' ||
                            h.artifact_type === 'fix_evidence'
                              ? defectStatusLabel(h.status)
                              : h.status
                          }
                          sx={{ height: 20 }}
                        />
                      ) : null}
                      {h.area ? (
                        <Chip size="small" variant="outlined" label={h.area} sx={{ height: 20 }} />
                      ) : null}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {h.snippet || h.body_text || h.summary || h.blob_uri || h.id}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>

          <Alert severity="info" sx={{ py: 0 }}>
            Phase A: SQL KPIs always. Phase B: set{' '}
            <code>DEFECT_DRAINER_OPENSEARCH_URL=http://127.0.0.1:9200</code> and{' '}
            <code>pnpm search:up</code> in backend; then reindex via{' '}
            <code>POST /api/search/reindex</code>.
          </Alert>
        </Stack>
      ) : null}
    </ListPage>
  );
}
