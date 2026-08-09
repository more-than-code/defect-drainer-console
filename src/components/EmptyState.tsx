/** Adapted from mo-webadmin-next EmptyState. */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function EmptyState({ title }: { title: string }) {
  return (
    <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
      <Typography>{title}</Typography>
    </Box>
  );
}
