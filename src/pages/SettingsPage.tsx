import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import {
  api,
  type AppRecord,
  type AppRepoEntry,
  type GrokSandboxProfile,
} from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageBody } from '../components/PageBody';
import { PageHeader } from '../components/PageHeader';

type RepoRow = { name: string; url: string };

function entriesFromApp(app: AppRecord): RepoRow[] {
  if (app.repo_entries?.length) {
    return app.repo_entries.map((e) => ({
      name: e.name || '',
      url: e.url || '',
    }));
  }
  const urls = [
    ...(app.repo_urls || []),
    ...(app.repo_url ? [app.repo_url] : []),
  ];
  const uniq = [...new Set(urls.filter(Boolean))];
  if (uniq.length) {
    return uniq.map((url, i) => ({
      name: app.repos?.[i] || '',
      url,
    }));
  }
  if (app.repos?.length) {
    return app.repos.map((name) => ({ name, url: '' }));
  }
  return [{ name: '', url: '' }];
}

export function SettingsPage() {
  const { appId: activeAppId, refreshApps, clearApp } = useAppContext();
  const navigate = useNavigate();
  const appId = activeAppId || '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoRows, setRepoRows] = useState<RepoRow[]>([{ name: '', url: '' }]);
  const [grokSandbox, setGrokSandbox] =
    useState<GrokSandboxProfile>('strict');
  const [isDefault, setIsDefault] = useState(false);

  const applyApp = useCallback((app: AppRecord | undefined) => {
    if (!app) return;
    setName(app.name || '');
    setDescription(app.description || '');
    setRepoRows(entriesFromApp(app));
    setGrokSandbox(
      app.grok_sandbox === 'workspace' ? 'workspace' : 'strict',
    );
    setIsDefault(!!app.default);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api<{ apps: AppRecord[]; defaultAppId: string }>(
        '/api/apps',
      );
      const app = res.apps.find((a) => a.id === appId);
      applyApp(app);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, applyApp]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateRow(index: number, patch: Partial<RepoRow>) {
    setRepoRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRepoRows((prev) => [...prev, { name: '', url: '' }]);
  }

  function removeRow(index: number) {
    setRepoRows((prev) => {
      if (prev.length <= 1) return [{ name: '', url: '' }];
      return prev.filter((_, i) => i !== index);
    });
  }

  async function save() {
    setSaving(true);
    setStatus('');
    try {
      const repo_entries: AppRepoEntry[] = repoRows
        .map((r) => ({
          name: r.name.trim(),
          url: r.url.trim(),
        }))
        .filter((r) => r.name || r.url);

      await api<{ app: AppRecord }>(`/api/apps/${encodeURIComponent(appId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          repo_entries,
          grok_sandbox: grokSandbox,
          default: isDefault,
        }),
      });
      setStatus('Saved');
      await refreshApps();
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeApp() {
    setDeleting(true);
    setStatus('');
    try {
      await api(`/api/apps/${encodeURIComponent(appId)}`, {
        method: 'DELETE',
      });
      setDeleteOpen(false);
      clearApp();
      await refreshApps();
      navigate('/onboarding', { replace: true });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <PageBody maxWidth="md">
        <LoadingState />
      </PageBody>
    );
  }

  return (
    <PageBody maxWidth="md">
      <PageHeader title="App settings" totalLabel={`id: ${appId}`}>
        <Typography variant="body2" color="text.secondary">
          Configure the <strong>currently selected app</strong>. Give each repo
          URL a short name — New defect form uses those names for related-repo ticks.
          Clones live under the backend data dir (sandboxed).
        </Typography>
      </PageHeader>

      {error ? (
        <Box sx={{ mb: 2 }}>
          <ErrorState message={error} />
        </Box>
      ) : null}

      <Paper sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="App ID"
            value={appId}
            fullWidth
            size="small"
            InputProps={{
              readOnly: true,
              sx: { fontFamily: 'ui-monospace, Menlo, monospace' },
            }}
            helperText="Platform hash id (app_ + 16 hex). Immutable."
          />

          <TextField
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Repositories
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Name is shown when reporting a defect (checkboxes). URL is cloned under{' '}
              <code>backend/.data/clones/</code> for batch fix worktrees.
            </Typography>
            <Stack spacing={1.5}>
              {repoRows.map((row, i) => (
                <Stack
                  key={i}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ sm: 'flex-start' }}
                >
                  <TextField
                    label="Name"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    size="small"
                    sx={{ minWidth: 140, flex: '0 0 160px' }}
                    placeholder="webapp"
                  />
                  <TextField
                    label="Repo URL"
                    value={row.url}
                    onChange={(e) => updateRow(i, { url: e.target.value })}
                    size="small"
                    fullWidth
                    placeholder="https://github.com/org/ttd-webapp.git"
                    InputProps={{
                      sx: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 },
                    }}
                  />
                  <IconButton
                    aria-label={`Remove repo ${i + 1}`}
                    onClick={() => removeRow(i)}
                    size="small"
                    sx={{ mt: { sm: 0.5 } }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
            <Button
              startIcon={<AddIcon />}
              onClick={addRow}
              size="small"
              sx={{ mt: 1.5 }}
            >
              Add repo
            </Button>
          </Box>

          <FormControl size="small" fullWidth>
            <InputLabel id="agent-sandbox-label">Agent sandbox</InputLabel>
            <Select
              labelId="agent-sandbox-label"
              label="Agent sandbox"
              value={grokSandbox}
              onChange={(e) =>
                setGrokSandbox(e.target.value as GrokSandboxProfile)
              }
            >
              <MenuItem value="strict">
                Strict (restrict) — code-only worktrees
              </MenuItem>
              <MenuItem value="workspace">
                Workspace — Simulator / host visual check
              </MenuItem>
            </Select>
            <FormHelperText>
              {grokSandbox === 'workspace'
                ? 'Read host (iOS Simulator, simctl). Writes still limited to batch handoff + temp. Use for agent fix screenshots / visual verification.'
                : 'Maximum isolation: no reliable Simulator access. Operator can upload fix evidence in the console.'}
            </FormHelperText>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
            }
            label="Default app"
          />

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={saving || deleting}
              onClick={() => void save()}
            >
              Save
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={saving || deleting || !appId}
              onClick={() => setDeleteOpen(true)}
            >
              Delete app
            </Button>
            {status ? (
              <Alert
                severity={status === 'Saved' ? 'success' : 'error'}
                sx={{ py: 0 }}
              >
                {status}
              </Alert>
            ) : null}
          </Stack>
        </Stack>
      </Paper>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this app?"
        message={`Remove ${name || appId} from the registry? Existing defects keep their app_id but this app will no longer appear in onboarding.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        onConfirm={() => void removeApp()}
        onCancel={() => setDeleteOpen(false)}
      />
    </PageBody>
  );
}
