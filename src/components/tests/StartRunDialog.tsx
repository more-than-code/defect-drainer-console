import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api, type TestPlan, type TestRun } from '../../api';
import { useAppContext } from '../../AppContext';
import { getOperatorName } from '../../operator';
import { appRepoRefs, envString, errorMessage, jsonRequest } from './format';

export function StartRunDialog({
  open,
  plans,
  initialPlanId,
  onClose,
  onCreated,
}: {
  open: boolean;
  plans: TestPlan[];
  initialPlanId: string | null;
  onClose: () => void;
  onCreated: (run: TestRun) => void;
}) {
  const { appId, app } = useAppContext();
  const accounts = app?.test_accounts ?? [];
  const plansRef = useRef(plans);
  plansRef.current = plans;
  const appRef = useRef(app);
  appRef.current = app;
  const [planId, setPlanId] = useState('');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [account, setAccount] = useState('');
  const [accountTouched, setAccountTouched] = useState(false);
  const [refs, setRefs] = useState<Array<{ name: string; ref: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const currentApp = appRef.current;
    if (!currentApp) return;
    const currentAccounts = currentApp.test_accounts ?? [];
    const plan = plansRef.current.find(
      (item) => item.id === initialPlanId && !item.archived,
    );
    setPlanId(plan?.id ?? '');
    setTitle(plan?.title ?? 'Exploratory run');
    setTitleTouched(false);
    setAccount(matchingAccount(plan, currentAccounts));
    setAccountTouched(false);
    setRefs(appRepoRefs(currentApp));
    setError('');
    setSaving(false);
    // Reset only when the dialog opens or the caller picks a different plan.
    // A list poll must not wipe fields the operator is editing.
  }, [open, initialPlanId]);

  function onPlan(nextId: string) {
    setPlanId(nextId);
    const plan = plans.find((item) => item.id === nextId);
    if (!titleTouched) setTitle(plan?.title ?? 'Exploratory run');
    if (!accountTouched) setAccount(matchingAccount(plan, accounts));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!appId || saving) return;
    const body: Record<string, unknown> = {
      app_id: appId,
      title: title.trim() || (planId ? '' : 'Exploratory run'),
      execute: 'manual',
      executor: 'operator',
      executed_by: getOperatorName(),
    };
    if (!body.title) delete body.title;
    if (planId) body.plan_id = planId;
    if (account) body.account_label = account;
    const refRows = refs
      .map((row) => ({ repo: row.name, ref: row.ref.trim() }))
      .filter((row) => row.ref);
    if (refRows.length) body.refs = refRows;
    setSaving(true);
    setError('');
    try {
      const res = await api<{ run: TestRun }>(
        '/api/test-runs',
        jsonRequest('POST', body),
      );
      onCreated(res.run);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const operator = getOperatorName();

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Start run</DialogTitle>
      <DialogContent>
        <Box component="form" id="start-run-form" onSubmit={onSubmit} sx={{ pt: 1 }}>
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {!operator ? (
              <Typography variant="body2" color="text.secondary">
                No operator name is set. The run is still recorded.{' '}
                <Link component={RouterLink} to="/settings">
                  Set it in Settings
                </Link>
                .
              </Typography>
            ) : null}
            <FormControl size="small" fullWidth>
              <InputLabel id="start-run-plan">Plan</InputLabel>
              <Select
                labelId="start-run-plan"
                label="Plan"
                value={planId}
                onChange={(e) => onPlan(String(e.target.value))}
              >
                <MenuItem value="">No plan (exploratory)</MenuItem>
                {plans
                  .filter((plan) => !plan.archived)
                  .map((plan) => (
                    <MenuItem key={plan.id} value={plan.id}>
                      {plan.title}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
              fullWidth
              size="small"
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel id="start-run-account">Test account</InputLabel>
              <Select
                labelId="start-run-account"
                label="Test account"
                value={account}
                onChange={(e) => {
                  setAccountTouched(true);
                  setAccount(String(e.target.value));
                }}
              >
                <MenuItem value="">None</MenuItem>
                {accounts.map((item) => (
                  <MenuItem key={item.label} value={item.label}>
                    {item.label}
                    {item.username ? ` · ${item.username}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <Typography variant="subtitle2">Refs</Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Defaults to each repo's base branch. Leave a ref empty to skip that
                repo.
              </Typography>
              {refs.length ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {refs.map((row, index) => (
                    <TextField
                      key={row.name}
                      label={row.name}
                      value={row.ref}
                      onChange={(e) =>
                        setRefs((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, ref: e.target.value } : item,
                          ),
                        )
                      }
                      size="small"
                      fullWidth
                    />
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  This app has no repositories. The run will not record refs.
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="start-run-form" variant="contained" disabled={saving}>
          {saving ? 'Starting…' : 'Start run'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function matchingAccount(
  plan: TestPlan | undefined,
  accounts: Array<{ label: string }>,
): string {
  const wanted = envString(plan?.env, 'account_label').trim();
  if (!wanted) return '';
  const found = accounts.find(
    (account) => account.label.toLowerCase() === wanted.toLowerCase(),
  );
  return found?.label ?? '';
}
