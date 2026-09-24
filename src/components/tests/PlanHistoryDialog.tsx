import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import type { SxProps, Theme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  api,
  type PlanGrid,
  type PlanGridCell,
  type PlanGridRun,
  type TestRunRef,
} from '../../api';
import { absoluteLocal, relativeTime } from '../../relativeTime';
import {
  compactChipSx,
  reviewLabel,
  stepStatusColor,
  stepStatusLabel,
  stepStatusVariant,
} from '../../testStatus';
import { LoadingState } from '../LoadingState';
import { DefectLinkChip } from './DefectLinkChip';
import { errorMessage } from './format';

const RUN_LIMITS = ['5', '10', '20'] as const;
type RunLimit = (typeof RUN_LIMITS)[number];

function parseLimit(value: string): RunLimit {
  if (value === '5' || value === '20') return value;
  return '10';
}

function shortRunId(id: string): string {
  const dash = id.lastIndexOf('-');
  const tail = dash >= 0 ? id.slice(dash + 1) : '';
  if (!tail || tail === id) return id;
  return `…${tail}`;
}

function formatRefs(refs: TestRunRef[] | undefined): string {
  if (!refs?.length) return 'none';
  return refs
    .map((ref) => {
      const repo = ref.repo || 'repo';
      const at = ref.ref ? `@${ref.ref}` : '';
      const sha = ref.sha ? ` ${ref.sha.slice(0, 7)}` : '';
      return `${repo}${at}${sha}`;
    })
    .join(', ');
}

function runTooltip(run: PlanGridRun) {
  return (
    <Stack spacing={0.25}>
      <span>{run.title || '—'}</span>
      <span>Reviewer: {run.reviewed_by || '—'}</span>
      <span>Plan version: {run.plan_version}</span>
      <span>Refs: {formatRefs(run.refs)}</span>
      {run.reviewed_at ? <span>{absoluteLocal(run.reviewed_at)}</span> : null}
      <span>{run.id}</span>
    </Stack>
  );
}

function ReviewMarker({ review }: { review: string }) {
  if (review === 'accepted') {
    return (
      <Typography component="span" variant="caption" color="success.main">
        <span aria-hidden="true">✓ </span>
        Accepted
      </Typography>
    );
  }
  if (review === 'disputed') {
    return (
      <Typography component="span" variant="caption" color="error.main">
        <span aria-hidden="true">✕ </span>
        Disputed
      </Typography>
    );
  }
  if (!review) return null;
  return (
    <Typography component="span" variant="caption" color="text.secondary">
      {reviewLabel(review)}
    </Typography>
  );
}

function HistoryCell({ cell }: { cell: PlanGridCell | null }) {
  if (!cell) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Stack spacing={0.25} alignItems="flex-start">
      <Chip
        size="small"
        label={stepStatusLabel(cell.status)}
        color={stepStatusColor(cell.status)}
        variant={stepStatusVariant(cell.status)}
        sx={compactChipSx}
      />
      <ReviewMarker review={cell.review} />
    </Stack>
  );
}

function HistoryMatrix({
  grid,
  now,
  onOpenRun,
}: {
  grid: PlanGrid;
  now: number;
  onOpenRun: () => void;
}) {
  const captionId = `plan-history-caption-${grid.plan.id}`;
  const runs = grid.runs ?? [];
  const steps = grid.steps ?? [];
  const stickyHead: SxProps<Theme> = {
    position: 'sticky',
    top: 0,
    left: 0,
    zIndex: 3,
    bgcolor: 'background.paper',
    minWidth: 220,
    maxWidth: 320,
  };
  const stickyBody: SxProps<Theme> = {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    bgcolor: 'background.paper',
    minWidth: 220,
    maxWidth: 320,
    verticalAlign: 'top',
    overflowWrap: 'anywhere',
    borderRight: 1,
    borderColor: 'divider',
  };
  return (
    <Stack spacing={1} sx={{ minWidth: 0, maxWidth: '100%' }}>
      <Typography id={captionId} variant="caption" color="text.secondary" component="div">
        {grid.plan.title || grid.plan.key} (version {grid.plan.version}). Newest reviewed run
        first.
      </Typography>
      <TableContainer
        component={Box}
        sx={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Table
          size="small"
          stickyHeader
          aria-labelledby={captionId}
          sx={{ minWidth: 220 + runs.length * 132, borderCollapse: 'separate' }}
        >
          <TableHead>
            <TableRow>
              <TableCell scope="col" sx={stickyHead}>
                Step
              </TableCell>
              {runs.map((run) => {
                const when = run.reviewed_at ? relativeTime(run.reviewed_at, now) : '—';
                return (
                  <TableCell key={run.id} scope="col" sx={{ verticalAlign: 'bottom', minWidth: 120 }}>
                    <Tooltip title={runTooltip(run)}>
                      <Link
                        component={RouterLink}
                        to={`/tests?run=${encodeURIComponent(run.id)}`}
                        underline="hover"
                        variant="caption"
                        aria-label={`Open run ${run.id}, reviewed ${when}`}
                        onClick={(event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey ||
                            event.button !== 0
                          ) {
                            return;
                          }
                          onOpenRun();
                        }}
                        sx={{
                          display: 'inline-flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>{when}</span>
                        <Box
                          component="span"
                          sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                        >
                          {shortRunId(run.id)}
                        </Box>
                      </Link>
                    </Tooltip>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {steps.length ? (
              steps.map((step) => {
                const cells = step.cells ?? [];
                return (
                  <TableRow key={step.key} hover>
                    <TableCell component="th" scope="row" sx={stickyBody}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <Stack direction="row" spacing={0.75} alignItems="baseline" useFlexGap flexWrap="wrap">
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {step.position}
                          </Typography>
                          {step.section ? (
                            <Typography variant="caption" color="text.secondary">
                              {step.section}
                            </Typography>
                          ) : null}
                        </Stack>
                        <Typography variant="body2">{step.action}</Typography>
                        {step.needs_retest ? (
                          <Chip
                            size="small"
                            color="warning"
                            label="Needs retest"
                            sx={compactChipSx}
                          />
                        ) : null}
                        {(step.defects ?? []).map((defect, index) => (
                          <DefectLinkChip
                            key={`${defect.id}:${defect.run_id}:${index}`}
                            id={defect.id}
                            status={defect.status}
                          />
                        ))}
                      </Stack>
                    </TableCell>
                    {runs.map((run, index) => (
                      <TableCell key={run.id} sx={{ verticalAlign: 'top', minWidth: 120 }}>
                        <HistoryCell cell={index < cells.length ? cells[index] : null} />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={runs.length + 1}>
                  <Typography variant="body2" color="text.secondary">
                    This plan has no steps.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

export function PlanHistoryDialog({
  open,
  planId,
  now,
  onClose,
  onOpenRun,
}: {
  open: boolean;
  planId: string;
  now: number;
  onClose: () => void;
  onOpenRun: () => void;
}) {
  const [limit, setLimit] = useState<RunLimit>('10');
  const [grid, setGrid] = useState<PlanGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestKey = `${planId}:${limit}`;
  const requestKeyRef = useRef(requestKey);
  if (requestKeyRef.current !== requestKey) {
    requestKeyRef.current = requestKey;
    setGrid(null);
    setError('');
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setGrid(null);
    void api<{ grid: PlanGrid }>(
      `/api/test-plans/${encodeURIComponent(planId)}/grid?runs=${limit}`,
    )
      .then((res) => {
        if (cancelled) return;
        if (!res.grid) throw new Error('History response had no grid.');
        setGrid(res.grid);
        setError('');
      })
      .catch((e) => {
        if (cancelled) return;
        setGrid(null);
        setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, limit]);

  const title = grid?.plan.title ? `History · ${grid.plan.title}` : 'History';
  const showGrid = Boolean(grid) && !loading && !error;
  const noRuns = Boolean(showGrid && (grid?.runs ?? []).length === 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      scroll="paper"
      slotProps={{ paper: { sx: { overflowX: 'hidden' } } }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ overflowX: 'hidden', minWidth: 0 }}>
        <Stack spacing={1.5} sx={{ pt: 1, minWidth: 0 }}>
          <FormControl size="small" sx={{ width: 140 }}>
            <InputLabel id="plan-history-runs-label">Runs</InputLabel>
            <Select
              labelId="plan-history-runs-label"
              label="Runs"
              value={limit}
              onChange={(e) => setLimit(parseLimit(String(e.target.value)))}
            >
              {RUN_LIMITS.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading ? <LoadingState /> : null}
          {noRuns ? (
            <Typography variant="body2" color="text.secondary">
              No reviewed runs yet — only reviewed runs appear here.
            </Typography>
          ) : null}
          {showGrid && grid && (grid.runs ?? []).length > 0 ? (
            <HistoryMatrix grid={grid} now={now} onOpenRun={onOpenRun} />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
