import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { GridColDef } from '@mui/x-data-grid';
import type { TestPlan, TestRun } from '../../api';
import { cellTextClamp2 } from '../AdminDataGrid';
import { absoluteLocal, relativeTime } from '../../relativeTime';
import { compactChipSx, runStatusColor, runStatusLabel } from '../../testStatus';
import { accountLabel, progressCaption, progressPercent } from './format';

export function runColumns(opts: {
  now: number;
  planById: Map<string, TestPlan>;
  narrow: boolean;
  onOpen: (id: string) => void;
}): GridColDef<TestRun>[] {
  const columns: GridColDef<TestRun>[] = [
    {
      field: 'title',
      headerName: 'Title',
      flex: 1.4,
      minWidth: opts.narrow ? 96 : 120,
      valueGetter: (_value, row) => row.title,
      renderCell: ({ row }) => {
        const plan = row.plan_id ? opts.planById.get(row.plan_id) : undefined;
        const caption = row.plan_id
          ? `${plan?.key || row.plan_id} · v${row.plan_version ?? '—'}`
          : 'Exploratory';
        return (
          <Box sx={{ minWidth: 0, width: '100%', py: 0.25 }}>
            <Typography variant="body2" sx={{ ...cellTextClamp2, fontSize: 13 }}>
              {row.title || '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={cellTextClamp2}>
              {caption}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.6,
      minWidth: opts.narrow ? 72 : 88,
      valueGetter: (_value, row) => row.status,
      renderCell: ({ row }) => (
        <Chip
          size="small"
          label={runStatusLabel(row.status)}
          color={runStatusColor(row.status)}
          sx={compactChipSx}
        />
      ),
    },
    {
      field: 'progress',
      headerName: 'Progress',
      flex: 1,
      minWidth: opts.narrow ? 72 : 108,
      sortable: false,
      valueGetter: (_value, row) => progressCaption(row.progress),
      renderCell: ({ row }) => {
        const caption = progressCaption(row.progress);
        return (
          <Box sx={{ width: '100%', minWidth: 0, py: 0.5 }}>
            <LinearProgress
              variant="determinate"
              value={progressPercent(row.progress)}
              color={
                row.progress.fail
                  ? 'error'
                  : row.progress.unverified
                    ? 'warning'
                    : 'primary'
              }
              aria-label={caption}
              sx={{ height: 4, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={cellTextClamp2}>
              {caption}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'account',
      headerName: 'Account',
      flex: 0.6,
      minWidth: 72,
      sortable: false,
      valueGetter: (_value, row) => accountLabel(row),
      renderCell: ({ row }) => (
        <Typography variant="caption" sx={cellTextClamp2}>
          {accountLabel(row) || '—'}
        </Typography>
      ),
    },
    {
      field: 'executed_by',
      headerName: 'Executed by',
      flex: 0.6,
      minWidth: 72,
      valueGetter: (_value, row) => row.executed_by,
      renderCell: ({ row }) => (
        <Typography variant="caption" sx={cellTextClamp2}>
          {row.executed_by || '—'}
        </Typography>
      ),
    },
    {
      field: 'started_at',
      headerName: 'Started',
      flex: 0.55,
      minWidth: 80,
      valueGetter: (_value, row) => row.started_at,
      renderCell: ({ row }) =>
        row.started_at ? (
          <Tooltip title={absoluteLocal(row.started_at)}>
            <Typography variant="caption" sx={cellTextClamp2}>
              {relativeTime(row.started_at, opts.now)}
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="caption">—</Typography>
        ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: 0.4,
      minWidth: 72,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Button
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            opts.onOpen(row.id);
          }}
        >
          Open
        </Button>
      ),
    },
  ];
  if (!opts.narrow) return columns;
  return columns.filter(
    (column) => !['account', 'executed_by', 'started_at'].includes(column.field),
  );
}

export function planColumns(opts: {
  now: number;
  narrow: boolean;
  onStart: (plan: TestPlan) => void;
  onEdit: (plan: TestPlan) => void;
  onHistory: (plan: TestPlan) => void;
  onRemove: (plan: TestPlan) => void;
}): GridColDef<TestPlan>[] {
  const columns: GridColDef<TestPlan>[] = [
    {
      field: 'title',
      headerName: 'Title',
      flex: 1.6,
      minWidth: opts.narrow ? 96 : 120,
      valueGetter: (_value, row) => row.title,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0, width: '100%', py: 0.25 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" sx={{ ...cellTextClamp2, fontSize: 13 }}>
              {row.title || '—'}
            </Typography>
            {row.archived ? (
              <Chip size="small" variant="outlined" label="Archived" sx={compactChipSx} />
            ) : null}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={cellTextClamp2}>
            {row.key}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'version',
      headerName: 'Version',
      flex: 0.35,
      minWidth: 64,
      valueGetter: (_value, row) => row.version,
    },
    {
      field: 'step_count',
      headerName: 'Steps',
      flex: 0.3,
      minWidth: 52,
      valueGetter: (_value, row) => row.step_count ?? 0,
    },
    {
      field: 'updated_at',
      headerName: 'Updated',
      flex: 0.55,
      minWidth: 80,
      valueGetter: (_value, row) => row.updated_at,
      renderCell: ({ row }) =>
        row.updated_at ? (
          <Tooltip title={absoluteLocal(row.updated_at)}>
            <Typography variant="caption" sx={cellTextClamp2}>
              {relativeTime(row.updated_at, opts.now)}
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="caption">—</Typography>
        ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      flex: opts.narrow ? 1.4 : 1.2,
      minWidth: opts.narrow ? 220 : 268,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Tooltip
            title={row.archived ? 'Archived plans cannot start a run' : 'Start run'}
          >
            <span>
              <Button
                size="small"
                disabled={row.archived}
                onClick={(event) => {
                  event.stopPropagation();
                  opts.onStart(row);
                }}
                sx={{ minWidth: 0, px: 0.75 }}
              >
                Start run
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              opts.onEdit(row);
            }}
            sx={{ minWidth: 0, px: 0.75 }}
          >
            Edit
          </Button>
          <Button
            size="small"
            aria-label={`History for ${row.title.trim() || row.key}`}
            onClick={(event) => {
              event.stopPropagation();
              opts.onHistory(row);
            }}
            sx={{ minWidth: 0, px: 0.75 }}
          >
            History
          </Button>
          <Button
            size="small"
            color="error"
            onClick={(event) => {
              event.stopPropagation();
              opts.onRemove(row);
            }}
            sx={{ minWidth: 0, px: 0.75 }}
          >
            {row.archived ? 'Delete' : 'Archive'}
          </Button>
        </Stack>
      ),
    },
  ];
  if (!opts.narrow) return columns;
  return columns.filter((column) => column.field !== 'version' && column.field !== 'updated_at');
}
