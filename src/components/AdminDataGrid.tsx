/**
 * Primary table for list screens — mo-webadmin-next `ServerDataGrid` equivalent:
 * Paper + divider border, bold column headers, autoHeight, page sizes 10/20/50.
 * Client pagination/sorting by default (in-memory lists).
 *
 * Fits container width (no horizontal scroll); cells clip overflow.
 * Prefer flex columns + modest minWidth; clamp multi-line text in renderCell.
 *
 * Always use via `ListPage` for typical listing screens.
 */
import Paper from '@mui/material/Paper';
import {
  DataGrid,
  type DataGridProps,
  type GridValidRowModel,
} from '@mui/x-data-grid';

export type AdminDataGridProps<Row extends GridValidRowModel> = Omit<
  DataGridProps<Row>,
  'disableRowSelectionOnClick'
> & {
  'aria-label': string;
};

/** Max two lines of body text inside a cell (use on Typography/Box). */
export const cellTextClamp2 = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
  wordBreak: 'break-word' as const,
  lineHeight: 1.3,
  width: '100%',
  minWidth: 0,
};

export function AdminDataGrid<Row extends GridValidRowModel>({
  sx,
  pageSizeOptions = [10, 20, 50],
  initialState,
  ...props
}: AdminDataGridProps<Row>) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <DataGrid
        {...props}
        disableRowSelectionOnClick
        autoHeight
        pageSizeOptions={pageSizeOptions}
        initialState={{
          pagination: { paginationModel: { page: 0, pageSize: 20 } },
          ...initialState,
        }}
        sx={{
          border: 0,
          width: '100%',
          maxWidth: '100%',
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          '& .MuiDataGrid-main': {
            overflowX: 'hidden',
            width: '100%',
          },
          '& .MuiDataGrid-virtualScroller': {
            overflowX: 'hidden !important',
          },
          '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-row': {
            width: '100% !important',
          },
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            minWidth: 0,
            py: 0.5,
            outline: 'none',
          },
          '& .MuiDataGrid-cellContent': {
            overflow: 'hidden',
            minWidth: 0,
            width: '100%',
          },
          '& .MuiDataGrid-columnHeader': {
            minWidth: 0,
          },
          ...((sx as object) || {}),
        }}
      />
    </Paper>
  );
}

/** Alias matching mo-webadmin-next naming. Prefer AdminDataGrid in new code. */
export const ServerDataGrid = AdminDataGrid;
