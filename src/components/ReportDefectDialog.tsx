/**
 * Create-defect form (former Report intake) as a modal for Defects list creation.
 */
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../AppContext';
import { api, type Job } from '../api';
import {
  getStoredReportRepos,
  setStoredReportRepos,
} from '../selectedApp';

function evidenceFileName(index: number, file: File): string {
  const raw = (file.name && /\.[a-z0-9]+$/i.test(file.name)
    ? file.name.slice(file.name.lastIndexOf('.'))
    : ''
  ).toLowerCase();
  const ext =
    raw && /^\.(png|jpe?g|webp|gif|heic)$/i.test(raw)
      ? raw === '.jpeg'
        ? '.jpg'
        : raw
      : file.type === 'image/jpeg'
        ? '.jpg'
        : file.type === 'image/webp'
          ? '.webp'
          : file.type === 'image/gif'
            ? '.gif'
            : '.png';
  return `${String(index + 1).padStart(2, '0')}${ext}`;
}

type ReportDefectDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a defect is successfully stored (intake completed). */
  onCreated?: (defectId: string) => void;
};

export function ReportDefectDialog({
  open,
  onClose,
  onCreated,
}: ReportDefectDialogProps) {
  const { appId, app } = useAppContext();
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState('P2');
  const [surface, setSurface] = useState('');
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [useGrokNormalize, setUseGrokNormalize] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [intakeStatus, setIntakeStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const appRepoNames = useMemo(() => {
    if (!app) return [] as string[];
    if (app.repo_entries?.length) {
      return app.repo_entries.map((e) => e.name).filter(Boolean);
    }
    return (app.repos || []).filter(Boolean);
  }, [app]);

  useEffect(() => {
    if (!open) return;
    setComment('');
    setSeverity('P2');
    setSurface('');
    setFiles([]);
    setIntakeStatus('');
    setUseGrokNormalize(false);
    if (!appId || !appRepoNames.length) {
      setSelectedRepos([]);
      return;
    }
    const stored = getStoredReportRepos(appId);
    if (stored?.length) {
      const allowed = new Set(appRepoNames);
      const kept = stored.filter((n) => allowed.has(n));
      setSelectedRepos(kept.length ? kept : [...appRepoNames]);
    } else {
      setSelectedRepos([...appRepoNames]);
    }
  }, [open, appId, appRepoNames]);

  function toggleRepo(name: string) {
    setSelectedRepos((prev) => {
      const next = prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name];
      if (appId) setStoredReportRepos(appId, next);
      return next;
    });
  }

  function addFiles(list: FileList | File[]) {
    const next = [...files];
    for (const f of list) {
      if (f.type.startsWith('image/')) next.push(f);
    }
    setFiles(next.slice(0, 12));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const out: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) out.push(f);
        }
      }
      if (out.length) {
        e.preventDefault();
        addFiles(out);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, files]);

  const previews = useMemo(
    () =>
      files.map((f, i) => ({
        index: i,
        label: evidenceFileName(i, f),
        shortLabel: String(i + 1).padStart(2, '0'),
        url: URL.createObjectURL(f),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appId || !comment.trim()) return;
    setSubmitting(true);
    setIntakeStatus('Submitting…');
    try {
      const fd = new FormData();
      fd.set('comment', comment.trim());
      fd.set('severity', severity);
      fd.set('surface', surface.trim());
      fd.set('app_id', appId);
      fd.set('source', 'console');
      fd.set('mode', useGrokNormalize ? 'grok' : 'local');
      if (selectedRepos.length) {
        fd.set('repos', JSON.stringify(selectedRepos));
      }
      setStoredReportRepos(appId, selectedRepos);
      files.forEach((f, i) => {
        fd.append('files', f, evidenceFileName(i, f));
      });
      const { job } = await api<{ job: Job }>('/api/intake', {
        method: 'POST',
        body: fd,
      });
      setIntakeStatus(`Job ${job.jobId} → ${job.status} (${job.defectId})`);
      if (job.status === 'completed' && job.defectId) {
        onCreated?.(job.defectId);
        onClose();
      } else {
        // Poll briefly for grok normalize
        pollJob(job.jobId);
      }
    } catch (err) {
      setIntakeStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function pollJob(jobId: string) {
    const timer = window.setInterval(async () => {
      try {
        const { job } = await api<{ job: Job }>(`/api/jobs/${jobId}`);
        setIntakeStatus(
          `Job ${job.jobId}: ${job.status}${job.error ? ' — ' + job.error : ''}`,
        );
        if (
          job.status === 'completed' ||
          job.status === 'failed' ||
          job.status === 'cancelled'
        ) {
          clearInterval(timer);
          if (job.status === 'completed' && job.defectId) {
            onCreated?.(job.defectId);
            onClose();
          }
        }
      } catch {
        /* ignore */
      }
    }, 1000);
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={submitting ? undefined : onClose}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 6 }}>
          New defect
          <IconButton
            aria-label="Close"
            onClick={onClose}
            disabled={submitting}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack
            component="form"
            id="report-defect-form"
            onSubmit={onSubmit}
            spacing={1.5}
          >
            <Typography variant="body2" color="text.secondary">
              Report for <strong>{app?.name ?? 'app'}</strong>
              {appRepoNames.length
                ? ` · repos: ${appRepoNames.join(', ')}`
                : ''}
              . Paste or attach screenshots.
            </Typography>
            <TextField
              label="Comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required
              multiline
              minRows={3}
              fullWidth
              autoFocus
              placeholder="What’s wrong? Route/screen? Expected vs actual."
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Severity</InputLabel>
                <Select
                  label="Severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  {['P0', 'P1', 'P2', 'P3'].map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Surface (optional)"
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                placeholder="/chat, practice hub…"
                sx={{ minWidth: 160, flex: 1 }}
              />
            </Stack>
            {appRepoNames.length ? (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Related repos
                </Typography>
                <Stack direction="row" flexWrap="wrap" useFlexGap>
                  {appRepoNames.map((repoName) => (
                    <FormControlLabel
                      key={repoName}
                      control={
                        <Checkbox
                          size="small"
                          checked={selectedRepos.includes(repoName)}
                          onChange={() => toggleRepo(repoName)}
                        />
                      }
                      label={repoName}
                    />
                  ))}
                </Stack>
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No repos configured — add named URLs in App Settings.
              </Typography>
            )}
            <Button variant="outlined" component="label">
              Add screenshots (or paste)
              <input
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  addFiles(e.target.files || []);
                  e.target.value = '';
                }}
              />
            </Button>
            {previews.length ? (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {previews.map((p) => (
                  <Box
                    key={p.url}
                    sx={{
                      position: 'relative',
                      width: 88,
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      overflow: 'hidden',
                      bgcolor: 'background.default',
                    }}
                  >
                    <Chip
                      size="small"
                      label={p.shortLabel}
                      sx={{
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        zIndex: 1,
                        height: 20,
                        fontWeight: 700,
                        bgcolor: 'rgba(0,0,0,0.65)',
                        color: '#fff',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={`Remove ${p.label}`}
                      onClick={() => removeFile(p.index)}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        zIndex: 1,
                        p: 0.25,
                        bgcolor: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <Box
                      component="img"
                      src={p.url}
                      alt={p.label}
                      onClick={() => setLightbox(p.url)}
                      sx={{
                        display: 'block',
                        width: '100%',
                        height: 72,
                        objectFit: 'cover',
                        cursor: 'zoom-in',
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            ) : null}
            <FormControlLabel
              control={
                <Checkbox
                  checked={useGrokNormalize}
                  onChange={(e) => setUseGrokNormalize(e.target.checked)}
                />
              }
              label="optional agent vision normalize"
            />
            {intakeStatus ? (
              <Alert
                severity={
                  intakeStatus.toLowerCase().includes('fail')
                    ? 'error'
                    : 'info'
                }
              >
                {intakeStatus}
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="report-defect-form"
            variant="contained"
            disabled={submitting || !comment.trim()}
          >
            {submitting ? 'Storing…' : 'Store defect'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!lightbox}
        onClose={() => setLightbox(null)}
        maxWidth="lg"
        onClick={() => setLightbox(null)}
      >
        {lightbox ? (
          <Box
            component="img"
            src={lightbox}
            alt="Preview"
            sx={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'block',
              cursor: 'zoom-out',
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
