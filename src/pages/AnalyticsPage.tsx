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
  title: string;
  summary: string;
  severity: string;
  status: string;
  area: string;
  snippet?: string;
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
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchMode, setSearchMode] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);

  const load = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const res = await api<{ analytics: AnalyticsSummary }>(
        `/api/analytics?app_id=${encodeURIComponent(appId)}`,
      );
      setSummary(res.analytics);
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
    try {
      const res = await api<{ hits: SearchHit[]; mode: string }>(
        `/api/search?app_id=${encodeURIComponent(appId)}&q=${encodeURIComponent(q)}&limit=30`,
      );
      setSearchHits(res.hits || []);
      setSearchMode(res.mode || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchBusy(false);
    }
  }, [appId, q]);

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
          Phase A SQL analytics for <strong>{app?.name ?? 'app'}</strong>
          {' — '}
          defect mix, batch prompt use, harness job outcomes. Search uses FTS on
          title/summary/body.
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
            <BarList title="By status" rows={summary.defects.by_status} />
            <BarList title="By source" rows={summary.defects.by_source} />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <BarList title="By bucket" rows={summary.defects.by_bucket} />
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
              Find defects
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search title, summary, body…"
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
            {searchMode ? (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                mode: {searchMode} · {searchHits.length} hit(s)
              </Typography>
            ) : null}
            {!searchHits.length ? (
              <Typography variant="caption" color="text.secondary">
                Run a query to list matching defects (FTS Phase A).
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {searchHits.map((h) => (
                  <Box
                    key={h.id}
                    component={RouterLink}
                    to={`/?id=${encodeURIComponent(h.id)}`}
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
                      <Typography variant="body2" fontWeight={600}>
                        {h.title || h.id}
                      </Typography>
                      <Chip size="small" label={h.severity} sx={{ height: 20 }} />
                      <Chip size="small" variant="outlined" label={h.status} sx={{ height: 20 }} />
                      {h.area ? (
                        <Chip size="small" variant="outlined" label={h.area} sx={{ height: 20 }} />
                      ) : null}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {h.snippet || h.summary || h.id}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>

          <Alert severity="info" sx={{ py: 0 }}>
            Phase A only — no OpenSearch cluster. Structured events:{' '}
            <code>prompt_use</code>, <code>job_summary</code>, defect FTS.
          </Alert>
        </Stack>
      ) : null}
    </ListPage>
  );
}
