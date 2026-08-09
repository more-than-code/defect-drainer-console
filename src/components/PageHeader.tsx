/**
 * Page composition header — matches mo-webadmin-next `PageHeader`:
 * h4 title, total label, optional primary action, filter row as children.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  totalLabel?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
    disabled?: boolean;
  };
  children?: ReactNode;
};

export function PageHeader({
  title,
  totalLabel,
  primaryAction,
  children,
}: PageHeaderProps) {
  return (
    <Stack spacing={2} sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        {totalLabel ? (
          <Typography variant="body2" color="text.secondary">
            {totalLabel}
          </Typography>
        ) : null}
        {primaryAction ? (
          <Button
            variant="contained"
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
            startIcon={primaryAction.icon}
          >
            {primaryAction.label}
          </Button>
        ) : null}
      </Box>
      {children}
    </Stack>
  );
}
