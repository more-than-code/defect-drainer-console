/**
 * Main content region aligned with mo-webadmin-next `RouteFocusRegion` padding:
 * horizontal px, bottom pb, top spacing under sticky app bar.
 */
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import type { ReactNode } from 'react';

type PageBodyProps = {
  children: ReactNode;
  /** When true, wrap in maxWidth container (default true). */
  contained?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | false;
};

export function PageBody({
  children,
  contained = true,
  maxWidth = 'lg',
}: PageBodyProps) {
  const body = (
    <Box
      component="main"
      id="admin-main-content"
      tabIndex={-1}
      sx={{
        flexGrow: 1,
        minWidth: 0,
        pt: 3,
        px: contained ? 0 : 3,
        pb: 4,
        '&:focus': { outline: 'none' },
      }}
    >
      {children}
    </Box>
  );

  if (!contained) return body;

  return (
    <Container maxWidth={maxWidth} sx={{ pt: 3, pb: 4, px: 3 }}>
      <Box component="main" id="admin-main-content" tabIndex={-1}>
        {children}
      </Box>
    </Container>
  );
}
