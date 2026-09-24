import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router-dom';
import { defectStatusColor, defectStatusLabel } from '../../defectStatus';
import { compactChipSx } from '../../testStatus';

/** Linked defect, or a non-link chip when the defect was deleted. */
export function DefectLinkChip({
  id,
  status,
}: {
  id: string;
  status: string | null;
}) {
  if (status == null) {
    return (
      <Box
        component="span"
        onClick={(event) => event.stopPropagation()}
        sx={{ display: 'inline-flex', maxWidth: '100%' }}
      >
        <Chip size="small" label={`${id} · deleted`} color="default" sx={compactChipSx} />
      </Box>
    );
  }
  const label = `${id} · ${defectStatusLabel(status)}`;
  return (
    <Link
      component={RouterLink}
      to={`/?id=${encodeURIComponent(id)}`}
      underline="none"
      onClick={(event) => event.stopPropagation()}
      sx={{ display: 'inline-flex', maxWidth: '100%', verticalAlign: 'middle' }}
    >
      <Chip
        size="small"
        color={defectStatusColor(status)}
        label={label}
        sx={{ ...compactChipSx, pointerEvents: 'none' }}
      />
    </Link>
  );
}
