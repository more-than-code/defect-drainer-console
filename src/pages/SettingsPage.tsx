import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SaveIcon from '@mui/icons-material/Save';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
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
  chooseLocalFolder,
  listRepoBranches,
  type AppRecord,
  type AppRepoEntry,
  type GrokSandboxProfile,
} from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getOperatorName, setOperatorName } from '../operator';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PageBody } from '../components/PageBody';
import { PageHeader } from '../components/PageHeader';

type BaseSource = 'origin' | 'local';

type RepoRow = {
  name: string;
  url: string;
  source: BaseSource;
  branch: string;
};

type BranchLoad = {
  loading: boolean;
  branches: string[];
  current?: string;
  error: string;
};

const BASE_SOURCES = [
  { value: 'origin' as const, label: 'GitHub' },
  { value: 'local' as const, label: 'Local checkout' },
];

function inferSource(url: string, explicit?: string): BaseSource {
  if (explicit === 'local' || explicit === 'origin') return explicit;
  const u = url.trim();
  if (u.startsWith('/') || u.startsWith('file://')) return 'local';
  return 'origin';
}

function emptyRow(): RepoRow {
  return { name: '', url: '', source: 'origin', branch: '' };
}

function entriesFromApp(app: AppRecord): RepoRow[] {
  if (app.repo_entries?.length) {
    return app.repo_entries.map((e) => ({
      name: e.name || '',
      url: e.url || '',
      source: inferSource(e.url || '', e.base_source),
      branch: e.base_branch || '',
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
      source: inferSource(url),
      branch: '',
    }));
  }
  if (app.repos?.length) {
    return app.repos.map((name) => ({
      name,
      url: '',
      source: 'origin' as const,
      branch: '',
    }));
  }
  return [emptyRow()];
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
  const [repoRows, setRepoRows] = useState<RepoRow[]>([emptyRow()]);
  const [grokSandbox, setGrokSandbox] =
    useState<GrokSandboxProfile>('strict');
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [branchLoads, setBranchLoads] = useState<Record<number, BranchLoad>>(
    {},
  );
  const [pickingIndex, setPickingIndex] = useState<number | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  // Browser-local, saved on change — deliberately outside the app-settings save().
  const [operatorName, setOperatorNameState] = useState(getOperatorName);

  const applyApp = useCallback((app: AppRecord | undefined) => {
    if (!app) return;
    setName(app.name || '');
    setDescription(app.description || '');
    setRepoRows(entriesFromApp(app));
    setGrokSandbox(
      app.grok_sandbox === 'workspace' ? 'workspace' : 'strict',
    );
    setWorkspaceRoot(app.workspace_root || '');
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
    setRepoRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRepoRows((prev) => {
      if (prev.length <= 1) return [emptyRow()];
      return prev.filter((_, i) => i !== index);
    });
  }

  async function pickLocalFolder(index: number) {
    setPickingIndex(index);
    setStatus('');
    try {
      const result = await chooseLocalFolder();
      if (result.cancelled || !result.path) return;
      const leaf = result.path.replace(/\/+$/, '').split('/').pop() || '';
      updateRow(index, {
        url: result.path,
        branch: '',
        name: repoRows[index]?.name.trim() ? repoRows[index]!.name : leaf,
      });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setPickingIndex(null);
    }
  }

  const branchKey = repoRows
    .map((r) => `${r.source}\0${r.url.trim()}`)
    .join('\n');

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const rows = branchKey.split('\n').map((line) => {
      const [source, url] = line.split('\0');
      return {
        source: (source === 'local' ? 'local' : 'origin') as BaseSource,
        url: url || '',
      };
    });
    rows.forEach((row, i) => {
      if (!row.url.trim()) {
        setBranchLoads((prev) => ({
          ...prev,
          [i]: { loading: false, branches: [], error: '' },
        }));
        return;
      }
      setBranchLoads((prev) => ({
        ...prev,
        [i]: {
          loading: true,
          branches: prev[i]?.branches ?? [],
          current: prev[i]?.current,
          error: '',
        },
      }));
      const t = window.setTimeout(() => {
        void listRepoBranches(row.source, row.url.trim())
          .then((r) => {
            if (cancelled) return;
            setBranchLoads((prev) => ({
              ...prev,
              [i]: {
                loading: false,
                branches: r.branches,
                current: r.current,
                error: '',
              },
            }));
            setRepoRows((prev) =>
              prev.map((cur, idx) => {
                if (idx !== i || cur.branch) return cur;
                const pick =
                  r.current ||
                  (r.branches.includes('dev') ? 'dev' : r.branches[0] || '');
                return pick ? { ...cur, branch: pick } : cur;
              }),
            );
          })
          .catch((e) => {
            if (cancelled) return;
            setBranchLoads((prev) => ({
              ...prev,
              [i]: {
                loading: false,
                branches: [],
                error: e instanceof Error ? e.message : String(e),
              },
            }));
          });
      }, 400);
      timers.push(t);
    });
    return () => {
      cancelled = true;
      for (const t of timers) window.clearTimeout(t);
    };
  }, [branchKey]);

  async function save() {
    setSaving(true);
    setStatus('');
    try {
      const repo_entries: AppRepoEntry[] = repoRows
        .map((r) => ({
          name:
            r.name.trim() ||
            (r.url.trim() ? r.url.replace(/\/+$/, '').split('/').pop() || '' : ''),
          url: r.url.trim(),
          base_source: r.source,
          base_branch: r.branch.trim() || undefined,
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
      <PageBody maxWidth="lg">
        <LoadingState />
      </PageBody>
    );
  }

  return (
    <PageBody maxWidth="lg">
      <PageHeader title="App settings" totalLabel={`id: ${appId}`}>
        <Typography variant="body2" color="text.secondary">
          Configure the <strong>currently selected app</strong>. Each repo
          chooses GitHub or a local checkout, then a base branch read from that
          repo. Names appear as related-repo ticks on New defect.
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
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{ mb: 1.5 }}
            >
              Per repo: pick GitHub or a local checkout, then the location, then
              the base branch read from that repo. Name is shown on New defect
              ticks.
            </Typography>
            <Stack spacing={1.5}>
              {repoRows.map((row, i) => {
                const loaded = branchLoads[i];
                const options = [
                  ...(row.branch &&
                  !(loaded?.branches || []).includes(row.branch)
                    ? [row.branch]
                    : []),
                  ...(loaded?.branches || []),
                ];
                return (
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
                      sx={{ minWidth: 120, flex: '0 0 140px' }}
                      placeholder="webapp"
                    />
                    <FormControl size="small" sx={{ minWidth: 160, flex: '0 0 160px' }}>
                      <InputLabel id={`repo-source-${i}`}>Base source</InputLabel>
                      <Select
                        labelId={`repo-source-${i}`}
                        label="Base source"
                        value={row.source}
                        onChange={(e) =>
                          updateRow(i, {
                            source: e.target.value as BaseSource,
                            url: '',
                            branch: '',
                          })
                        }
                      >
                        {BASE_SOURCES.map((s) => (
                          <MenuItem key={s.value} value={s.value}>
                            {s.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField
                      label="Location"
                      value={row.url}
                      onChange={(e) =>
                        updateRow(i, { url: e.target.value, branch: '' })
                      }
                      size="small"
                      fullWidth
                      placeholder={
                        row.source === 'local'
                          ? workspaceRoot
                            ? `${workspaceRoot}/ttd-webapp`
                            : '/absolute/path/to/checkout'
                          : 'https://github.com/org/ttd-webapp.git'
                      }
                      InputProps={{
                        sx: {
                          fontFamily: 'ui-monospace, Menlo, monospace',
                          fontSize: 13,
                        },
                        endAdornment:
                          row.source === 'local' ? (
                            <InputAdornment position="end">
                              <IconButton
                                aria-label="Choose folder in Finder"
                                edge="end"
                                size="small"
                                disabled={pickingIndex !== null}
                                onClick={() => void pickLocalFolder(i)}
                              >
                                <FolderOpenOutlinedIcon fontSize="small" />
                              </IconButton>
                            </InputAdornment>
                          ) : undefined,
                      }}
                    />
                    <FormControl
                      size="small"
                      sx={{ minWidth: 160, flex: '0 0 180px' }}
                      disabled={!row.url.trim()}
                    >
                      <InputLabel id={`repo-branch-${i}`}>Base branch</InputLabel>
                      <Select
                        labelId={`repo-branch-${i}`}
                        label="Base branch"
                        value={
                          row.branch && options.includes(row.branch)
                            ? row.branch
                            : ''
                        }
                        onChange={(e) =>
                          updateRow(i, { branch: String(e.target.value) })
                        }
                      >
                        {options.map((b) => (
                          <MenuItem key={b} value={b}>
                            {b}
                            {loaded?.current === b ? ' (current)' : ''}
                          </MenuItem>
                        ))}
                      </Select>
                      {loaded?.loading ? (
                        <FormHelperText>Reading branches…</FormHelperText>
                      ) : loaded?.error ? (
                        <FormHelperText error>
                          {loaded.error.slice(0, 160)}
                        </FormHelperText>
                      ) : !row.url.trim() ? (
                        <FormHelperText>Set the location first</FormHelperText>
                      ) : null}
                    </FormControl>
                    <IconButton
                      aria-label={`Remove repo ${i + 1}`}
                      onClick={() => removeRow(i)}
                      size="small"
                      sx={{ mt: { sm: 0.5 } }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
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

      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          This browser
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 1.5 }}
        >
          Not part of app settings and not sent to the server until you file a
          defect — stored in this browser only, and saved as you type. Agent tools
          set their own reporter when they post to <code>/api/intake</code>.
        </Typography>
        <TextField
          label="Operator name (reporter)"
          value={operatorName}
          onChange={(e) => {
            setOperatorNameState(e.target.value);
            setOperatorName(e.target.value);
          }}
          fullWidth
          size="small"
          placeholder="e.g. joe"
          helperText="Recorded as the reporter on defects you file from this console. Self-declared — there is no login yet."
        />
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
