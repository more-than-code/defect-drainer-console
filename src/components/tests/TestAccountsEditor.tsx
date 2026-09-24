import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { TestAccount } from '../../api';

const EMPTY: TestAccount = {
  label: '',
  username: '',
  environment: '',
  secret_ref: '',
};

export function TestAccountsEditor({
  accounts,
  onChange,
}: {
  accounts: TestAccount[];
  onChange: (next: TestAccount[]) => void;
}) {
  function patch(index: number, partial: Partial<TestAccount>) {
    onChange(accounts.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  const duplicate = new Set<string>();
  const seen = new Set<string>();
  for (const row of accounts) {
    const label = row.label.trim().toLowerCase();
    if (!label) continue;
    if (seen.has(label)) duplicate.add(label);
    seen.add(label);
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Test accounts
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ mb: 1.5 }}
      >
        DD never stores passwords. Put a 1Password item name here, or{' '}
        <code>env:VAR_NAME</code> to have DD pass that host environment variable
        to test jobs.
      </Typography>
      <Stack spacing={1.5}>
        {accounts.map((row, index) => {
          const name = row.label.trim();
          return (
            <Stack
              key={index}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'flex-start' }}
            >
              <TextField
                label="Label"
                value={row.label}
                onChange={(e) => patch(index, { label: e.target.value })}
                size="small"
                required
                error={duplicate.has(row.label.trim().toLowerCase())}
                helperText={
                  duplicate.has(row.label.trim().toLowerCase())
                    ? 'Duplicate label'
                    : undefined
                }
                sx={{ flex: 1, minWidth: 120 }}
              />
              <TextField
                label="Username"
                value={row.username}
                onChange={(e) => patch(index, { username: e.target.value })}
                size="small"
                sx={{ flex: 1, minWidth: 120 }}
              />
              <TextField
                label="Environment"
                value={row.environment}
                onChange={(e) => patch(index, { environment: e.target.value })}
                size="small"
                sx={{ flex: 1, minWidth: 100 }}
              />
              <TextField
                label="Where the password lives"
                value={row.secret_ref}
                onChange={(e) => patch(index, { secret_ref: e.target.value })}
                size="small"
                sx={{ flex: 1.4, minWidth: 180 }}
              />
              <Tooltip title="Remove test account">
                <IconButton
                  aria-label={
                    name ? `Remove test account ${name}` : `Remove test account ${index + 1}`
                  }
                  onClick={() => onChange(accounts.filter((_, i) => i !== index))}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        })}
      </Stack>
      <Button
        startIcon={<AddIcon />}
        size="small"
        sx={{ mt: 1 }}
        onClick={() => onChange([...accounts, { ...EMPTY }])}
      >
        Add test account
      </Button>
    </Box>
  );
}

/** Drop untouched blank rows. Anything else is sent so the API can reject it. */
export function testAccountsForSave(accounts: TestAccount[]): TestAccount[] {
  return accounts
    .filter(
      (row) =>
        row.label.trim() ||
        row.username.trim() ||
        row.environment.trim() ||
        row.secret_ref.trim(),
    )
    .map((row) => ({
      label: row.label.trim(),
      username: row.username.trim(),
      environment: row.environment.trim(),
      secret_ref: row.secret_ref.trim(),
    }));
}
