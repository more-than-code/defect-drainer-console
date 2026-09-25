import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TestRun } from '../../api';
import { accountView, envString, shortSha } from './format';

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'target', label: 'Target' },
  { key: 'device', label: 'Device' },
  { key: 'api_base', label: 'API base' },
  { key: 'flavor', label: 'Flavor' },
];

export function RunEnvironment({ run }: { run: TestRun }) {
  const account = accountView(run.env);
  const fields = FIELDS.map((field) => ({
    ...field,
    value: envString(run.env, field.key),
  })).filter((field) => field.value);
  const refs = run.refs ?? [];
  const empty = !fields.length && !account && !refs.length;

  return (
    <Stack spacing={0.5}>
      <Typography variant="subtitle2">Environment</Typography>
      {empty ? (
        <Typography variant="body2" color="text.secondary">
          No environment recorded.
        </Typography>
      ) : null}
      {fields.map((field) => (
        <Typography key={field.key} variant="body2">
          {field.label}: {field.value}
        </Typography>
      ))}
      {account ? (
        <Typography variant="body2">
          Account: {account.label || '—'}
          {account.username ? ` · ${account.username}` : ''}
          {account.secret_ref ? ` · secret: ${account.secret_ref}` : ''}
        </Typography>
      ) : null}
      {refs.map((ref) => (
        <Typography key={`${ref.repo}@${ref.ref}`} variant="body2">
          {ref.repo}@{ref.ref}
          {ref.sha ? ` (${shortSha(ref.sha)})` : ''}
        </Typography>
      ))}
    </Stack>
  );
}
