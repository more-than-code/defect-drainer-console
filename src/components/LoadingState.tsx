/** Adapted from mo-webadmin-next LoadingState. */
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export function LoadingState() {
  return (
    <Box sx={{ minHeight: 160, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={28} />
    </Box>
  );
}
