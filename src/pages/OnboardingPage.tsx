import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { api, type AppRecord } from '../api';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';

export function OnboardingPage() {
  const { ready, apps, selectApp, appId, refreshApps } = useAppContext();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrlText, setRepoUrlText] = useState('');

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <LoadingState />
      </Container>
    );
  }

  function choose(id: string) {
    selectApp(id);
    navigate('/', { replace: true }); // Defects (list + New defect)
  }

  async function createAndSelect(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const urls = repoUrlText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const { app } = await api<{ app: AppRecord }>('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          repo_url: urls.length === 1 ? urls[0] : undefined,
          repo_urls: urls.length > 1 ? urls : undefined,
        }),
      });
      await refreshApps();
      selectApp(app.id);
      navigate('/', { replace: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight={700}>
            Choose an app
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Select an existing product app or create a new one. Defects and Jobs use this
            app until you switch (header → Switch app).
          </Typography>
        </Box>

        {apps.length ? (
          <Stack spacing={1.5}>
            {apps.map((a) => {
              const selected = a.id === appId;
              return (
                <Card
                  key={a.id}
                  variant="outlined"
                  sx={{
                    borderColor: selected ? 'primary.main' : 'divider',
                    borderWidth: selected ? 2 : 1,
                  }}
                >
                  <CardActionArea onClick={() => choose(a.id)}>
                    <CardContent>
                      <Typography variant="h6">{a.name}</Typography>
                      <Typography
                        variant="caption"
                        display="block"
                        sx={{
                          fontFamily: 'ui-monospace, Menlo, monospace',
                          mb: 0.5,
                        }}
                      >
                        {a.id}
                      </Typography>
                      {a.description ? (
                        <Typography variant="body2" color="text.secondary">
                          {a.description}
                        </Typography>
                      ) : null}
                      {a.repos?.length ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          sx={{ mt: 1 }}
                        >
                          repos: {a.repos.join(', ')}
                        </Typography>
                      ) : null}
                      {a.default ? (
                        <Typography
                          variant="caption"
                          color="primary"
                          display="block"
                          sx={{ mt: 0.5 }}
                        >
                          default
                        </Typography>
                      ) : null}
                    </CardContent>
                  </CardActionArea>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <ErrorState message="No apps yet — create one below." />
        )}

        <Button
          startIcon={<AddIcon />}
          variant={showCreate ? 'outlined' : 'contained'}
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? 'Hide create form' : 'Create new app'}
        </Button>

        <Collapse in={showCreate}>
          <Card variant="outlined" component="form" onSubmit={createAndSelect}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="subtitle1" fontWeight={700}>
                  New app
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Platform generates a unique App ID (<code>app_</code> + hash). You can
                  edit repo URLs later in Settings.
                </Typography>
                <TextField
                  label="Display name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  fullWidth
                  size="small"
                  placeholder="e.g. Acme Dashboard"
                />
                <TextField
                  label="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                />
                <TextField
                  label="Repo URL(s) (optional)"
                  value={repoUrlText}
                  onChange={(e) => setRepoUrlText(e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  placeholder="https://github.com/org/webapp.git"
                  helperText="One per line — batch fix clone + worktree; agent picks which to fix"
                />
                {createError ? <Alert severity="error">{createError}</Alert> : null}
                <Button
                  type="submit"
                  variant="contained"
                  disabled={creating || !name.trim()}
                >
                  {creating ? 'Creating…' : 'Create and continue'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Collapse>

        {appId ? (
          <Button variant="text" onClick={() => navigate('/', { replace: true })}>
            Continue with current selection
          </Button>
        ) : null}
      </Stack>
    </Container>
  );
}
