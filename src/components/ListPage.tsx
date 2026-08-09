/**
 * Canonical **listing screen** composition (mirrors mo-webadmin-next list pages).
 *
 * Structure (do not invent alternate shells for table screens):
 * ```
 * <ListPage title totalLabel primaryAction filters={…} error={…}>
 *   <AdminDataGrid … />          // primary table — required for list screens
 *   {optional secondary panels}
 *   {dialogs}
 * </ListPage>
 * ```
 *
 * mo-webadmin-next reference:
 * - PageHeader (h4 + total + action) with filter Stack as children
 * - ServerDataGrid (here: AdminDataGrid) immediately below — not wrapped in ad-hoc Tables
 * - Dialogs after the grid
 *
 * Padding/main region: PageBody ≈ RouteFocusRegion.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { ErrorState } from './ErrorState';
import { PageBody } from './PageBody';
import { PageHeader } from './PageHeader';

export type ListPageProps = {
  title: string;
  totalLabel?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    disabled?: boolean;
  };
  /** Optional one-line context under the title row (before filters). */
  description?: ReactNode;
  /**
   * Filter controls row — mo-webadmin puts these in PageHeader children.
   * Prefer FilterSelect + SearchField in a responsive Stack.
   */
  filters?: ReactNode;
  /** Full-page error (e.g. list load failed). */
  error?: string | null;
  /**
   * Body: **AdminDataGrid first**, then optional secondary panels, then dialogs.
   */
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | false;
};

export function ListPage({
  title,
  totalLabel,
  primaryAction,
  description,
  filters,
  error,
  children,
  maxWidth = 'lg',
}: ListPageProps) {
  return (
    <PageBody maxWidth={maxWidth}>
      <PageHeader
        title={title}
        totalLabel={totalLabel}
        primaryAction={primaryAction}
      >
        {description ? (
          <Typography variant="body2" color="text.secondary" component="div">
            {description}
          </Typography>
        ) : null}
        {filters ? (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{
              alignItems: { xs: 'stretch', md: 'center' },
              flexWrap: 'wrap',
            }}
          >
            {filters}
          </Stack>
        ) : null}
      </PageHeader>

      {error ? (
        <Box sx={{ mb: 2 }}>
          <ErrorState message={error} />
        </Box>
      ) : null}

      {children}
    </PageBody>
  );
}
