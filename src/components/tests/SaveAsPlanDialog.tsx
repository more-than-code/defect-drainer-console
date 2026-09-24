import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { api, type TestPlan, type TestRun } from '../../api';
import { errorMessage, isPlanKey, jsonRequest, slugKey } from './format';

export function SaveAsPlanDialog({
  open,
  run,
  sourceArchived,
  onClose,
  onDone,
  perform,
}: {
  open: boolean;
  run: TestRun | null;
  sourceArchived: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Runs the request on the drawer's write chain. */
  perform: <T>(exec: () => Promise<T>) => Promise<T>;
}) {
  const keyTouched = useRef(false);
  const [mode, setMode] = useState<'update' | 'new'>('new');
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canUpdate = Boolean(run?.plan_id) && !sourceArchived;

  useEffect(() => {
    if (!open || !run) return;
    keyTouched.current = false;
    setMode(run.plan_id && !sourceArchived ? 'update' : 'new');
    setTitle(run.title);
    setKey(slugKey(run.title));
    setError('');
    setSaving(false);
    // Reset when the dialog opens. A run poll must not wipe a key the operator edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!run || saving) return;
    if (mode === 'update' && !run.plan_id) {
      setError('This run has no source plan.');
      return;
    }
    if (mode === 'new') {
      if (!title.trim()) {
        setError('Title is required.');
        return;
      }
      if (!isPlanKey(key.trim())) {
        setError(
          'Key must match ^[a-z0-9][a-z0-9._-]{0,63}$ and must not contain "..".',
        );
        return;
      }
    }
    const body =
      mode === 'update'
        ? { plan_id: run.plan_id }
        : { key: key.trim(), title: title.trim() };
    setSaving(true);
    setError('');
    try {
      const res = await perform(() =>
        api<{ plan: TestPlan; created: boolean; changed: boolean }>(
          `/api/test-runs/${encodeURIComponent(run.id)}/save-as-plan`,
          jsonRequest('POST', body),
        ),
      );
      const name = res.plan.title || title.trim();
      onDone(
        res.created
          ? `Created plan “${name}” (${res.plan.key}).`
          : res.changed
            ? `Updated plan “${name}” to version ${res.plan.version}.`
            : `Plan “${name}” already matches these steps.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Save as plan</DialogTitle>
      <DialogContent>
        <Box component="form" id="save-plan-form" onSubmit={onSubmit} sx={{ pt: 1 }}>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <FormControl>
              <RadioGroup
                aria-label="Save as plan"
                value={mode}
                onChange={(e) => setMode(e.target.value === 'update' ? 'update' : 'new')}
              >
                <FormControlLabel
                  value="update"
                  control={<Radio />}
                  disabled={!canUpdate}
                  label="Update source plan"
                />
                <FormControlLabel value="new" control={<Radio />} label="New plan" />
              </RadioGroup>
              {!run?.plan_id ? (
                <Typography variant="caption" color="text.secondary">
                  Exploratory runs have no source plan to update.
                </Typography>
              ) : sourceArchived ? (
                <Typography variant="caption" color="text.secondary">
                  The source plan is archived, so it cannot be updated from this run.
                </Typography>
              ) : null}
            </FormControl>
            {mode === 'new' ? (
              <>
                <TextField
                  label="Title"
                  value={title}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTitle(value);
                    if (!keyTouched.current) setKey(slugKey(value));
                  }}
                  required
                  fullWidth
                  size="small"
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
                <TextField
                  label="Key"
                  value={key}
                  onChange={(e) => {
                    keyTouched.current = true;
                    setKey(e.target.value);
                  }}
                  required
                  fullWidth
                  size="small"
                  error={key.length > 0 && !isPlanKey(key.trim())}
                  helperText='Lowercase letters, digits, and . _ -. Cannot contain "..".'
                  slotProps={{ htmlInput: { maxLength: 64 } }}
                />
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Replaces the source plan’s steps with this run. Exploratory flags are
                dropped. Version increases when the steps differ.
              </Typography>
            )}
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="save-plan-form" variant="contained" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
