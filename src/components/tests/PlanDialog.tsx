import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { api, type TestAccount, type TestPlan } from '../../api';
import { getOperatorName } from '../../operator';
import { useAppContext } from '../../AppContext';
import { LoadingState } from '../LoadingState';
import {
  buildPlanEnv,
  envString,
  errorMessage,
  isPlanKey,
  jsonRequest,
  slugKey,
  uniqueKey,
} from './format';
import { PlanStepsEditor, nextLocalId, type DraftStep } from './PlanStepsEditor';

function stepsFromPlan(plan: TestPlan): DraftStep[] {
  return (plan.steps ?? []).map((step) => ({
    localId: step.key || nextLocalId(),
    key: step.key,
    lockedKey: true,
    section: step.section,
    action: step.action,
    expected: step.expected,
  }));
}

function finalizeSteps(steps: DraftStep[]): DraftStep[] {
  const used = new Set(steps.filter((step) => step.lockedKey).map((step) => step.key));
  return steps.map((step) => {
    if (step.lockedKey) return step;
    const key = uniqueKey(step.action, used);
    used.add(key);
    return { ...step, key };
  });
}

export function PlanDialog({
  open,
  planId,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Null creates a plan. An id loads that plan for edit. */
  planId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { appId, app } = useAppContext();
  const accounts = app?.test_accounts ?? [];
  const creating = !planId;
  const keyTouched = useRef(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('');
  const [purpose, setPurpose] = useState('');
  const [target, setTarget] = useState('');
  const [device, setDevice] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [flavor, setFlavor] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [version, setVersion] = useState(1);
  const [archived, setArchived] = useState(false);
  const [baseEnv, setBaseEnv] = useState<Record<string, unknown>>({});
  const [steps, setSteps] = useState<DraftStep[]>([]);
  // '' is a cleared create form. An id is set only after that plan's GET succeeds.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const requestKey = open ? (planId ?? '') : null;
  const resetKey = useRef<string | null>(null);
  if (resetKey.current !== requestKey) {
    resetKey.current = requestKey;
    keyTouched.current = false;
    setLoadedId(requestKey === '' ? '' : null);
    setLoading(Boolean(requestKey));
    setError('');
    setTitle('');
    setKey('');
    setPurpose('');
    setTarget('');
    setDevice('');
    setApiBase('');
    setFlavor('');
    setAccountLabel('');
    setVersion(1);
    setArchived(false);
    setBaseEnv({});
    setSteps([]);
  }

  useEffect(() => {
    if (!open || !planId) return;
    let cancelled = false;
    setLoading(true);
    void api<{ plan: TestPlan }>(`/api/test-plans/${encodeURIComponent(planId)}`)
      .then((res) => {
        if (cancelled) return;
        const plan = res.plan;
        setTitle(plan.title);
        setKey(plan.key);
        setPurpose(plan.purpose || '');
        setTarget(envString(plan.env, 'target'));
        setDevice(envString(plan.env, 'device'));
        setApiBase(envString(plan.env, 'api_base'));
        setFlavor(envString(plan.env, 'flavor'));
        setAccountLabel(envString(plan.env, 'account_label'));
        setVersion(plan.version);
        setArchived(plan.archived);
        setBaseEnv(plan.env ?? {});
        setSteps(stepsFromPlan(plan));
        setLoadedId(planId);
        setError('');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setLoadedId(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, planId]);

  function onTitle(value: string) {
    setTitle(value);
    if (creating && !keyTouched.current) setKey(slugKey(value));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!appId || saving || loadedId !== (planId ?? '')) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    if (creating && !isPlanKey(key.trim())) {
      setError(
        'Key must match ^[a-z0-9][a-z0-9._-]{0,63}$ and must not contain "..".',
      );
      return;
    }
    if (steps.some((step) => !step.action.trim())) {
      setError('Each step needs an action.');
      return;
    }
    const finalSteps = finalizeSteps(steps);
    const env = buildPlanEnv(creating ? {} : baseEnv, {
      target,
      device,
      api_base: apiBase,
      flavor,
      account_label: accountLabel,
    });
    const bodySteps = finalSteps.map((step) => ({
      key: step.key,
      section: step.section.trim(),
      action: step.action.trim(),
      expected: step.expected.trim(),
    }));
    setSaving(true);
    setError('');
    try {
      if (creating) {
        const res = await api<{ plan: TestPlan; created: boolean; changed: boolean }>(
          '/api/test-plans',
          jsonRequest('POST', {
            app_id: appId,
            key: key.trim(),
            title: trimmedTitle,
            purpose: purpose.trim(),
            env,
            created_by: getOperatorName(),
            steps: bodySteps,
          }),
        );
        const name = res.plan.title || trimmedTitle;
        onSaved(
          res.created
            ? `Created plan “${name}”.`
            : res.changed
              ? `Updated existing plan “${res.plan.key}” (version ${res.plan.version}).`
              : `Plan “${res.plan.key}” already matches this form.`,
        );
      } else {
        const res = await api<{ plan: TestPlan }>(
          `/api/test-plans/${encodeURIComponent(planId)}`,
          jsonRequest('PATCH', {
            title: trimmedTitle,
            purpose: purpose.trim(),
            env,
            steps: bodySteps,
          }),
        );
        onSaved(`Saved plan “${res.plan.title}” (version ${res.plan.version}).`);
      }
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
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{creating ? 'New plan' : 'Edit plan'}</DialogTitle>
      <DialogContent>
        {loading ? (
          <LoadingState />
        ) : (
          <Box component="form" id="plan-form" onSubmit={onSubmit} sx={{ pt: 1 }}>
            <Stack spacing={2}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Typography variant="body2" color="text.secondary">
                Version {version}
                {archived ? ' · archived' : ''}
              </Typography>
              <TextField
                label="Title"
                value={title}
                onChange={(e) => onTitle(e.target.value)}
                required
                fullWidth
                size="small"
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              {creating ? (
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
                  helperText='Lowercase letters, digits, and . _ -. Cannot contain "..". Taken from the title until you edit it.'
                  slotProps={{ htmlInput: { maxLength: 64 } }}
                />
              ) : (
                <TextField
                  label="Key"
                  value={key}
                  fullWidth
                  size="small"
                  slotProps={{ input: { readOnly: true } }}
                  helperText="Keys stay put after the plan is created."
                />
              )}
              <TextField
                label="Purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                fullWidth
                size="small"
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 4000 } }}
              />
              <Typography variant="subtitle2">Environment</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Device"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="API base"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Flavor"
                  value={flavor}
                  onChange={(e) => setFlavor(e.target.value)}
                  size="small"
                  fullWidth
                />
              </Stack>
              <AccountSelect
                accounts={accounts}
                value={accountLabel}
                onChange={setAccountLabel}
              />
              <PlanStepsEditor steps={steps} onChange={setSteps} />
            </Stack>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="plan-form"
          variant="contained"
          disabled={saving || loading || loadedId !== (planId ?? '')}
        >
          {saving ? 'Saving…' : creating ? 'Create plan' : 'Save plan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: TestAccount[];
  value: string;
  onChange: (value: string) => void;
}) {
  const known = accounts.some((account) => account.label === value);
  return (
    <TextField
      id="plan-default-test-account"
      select
      label="Default test account"
      value={value}
      onChange={(e) => onChange(String(e.target.value))}
      size="small"
      fullWidth
      slotProps={{
        inputLabel: { id: 'plan-default-test-account-label' },
        select: {
          labelId: 'plan-default-test-account-label',
          inputProps: { 'aria-labelledby': 'plan-default-test-account-label' },
        },
      }}
    >
      <MenuItem value="">None</MenuItem>
      {!known && value ? <MenuItem value={value}>{value}</MenuItem> : null}
      {accounts.map((account) => (
        <MenuItem key={account.label} value={account.label}>
          {account.label}
          {account.username ? ` · ${account.username}` : ''}
        </MenuItem>
      ))}
    </TextField>
  );
}
