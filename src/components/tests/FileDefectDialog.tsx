import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState, type MutableRefObject } from 'react';
import type { TestRun, TestRunRef, TestRunStep } from '../../api';
import { useAppContext } from '../../AppContext';
import { getOperatorName } from '../../operator';
import { errorMessage } from './format';

const SEVERITIES = ['P1', 'P2', 'P3'] as const;
type Severity = (typeof SEVERITIES)[number];
const TITLE_MAX_BYTES = 200;

const titleEncoder = new TextEncoder();

/** Prefix whose UTF-8 size is at most `maxBytes`, cut on a code point. */
function utf8Prefix(text: string, maxBytes: number): string {
  if (titleEncoder.encode(text).length <= maxBytes) return text;
  let out = '';
  let bytes = 0;
  for (const ch of text) {
    const size = titleEncoder.encode(ch).length;
    if (bytes + size > maxBytes) break;
    out += ch;
    bytes += size;
  }
  return out;
}

export type FileDefectBody = {
  title?: string;
  severity?: string;
  repos?: string[];
  reporter?: string;
  note?: string;
};

function appRepoNames(repos: string[] | undefined): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of repos ?? []) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Tick the run's ref repos when those names are on the app; otherwise tick all. */
function initialRepos(names: string[], refs: TestRunRef[]): string[] {
  const refNames = new Set(refs.map((ref) => ref.repo.trim()).filter(Boolean));
  const matched = names.filter((name) => refNames.has(name));
  return matched.length ? matched : names;
}

function screenshotLine(count: number): string {
  return count === 1 ? '1 screenshot will be copied' : `${count} screenshots will be copied`;
}

export function FileDefectDialog({
  open,
  run,
  step,
  busy,
  generation,
  onClose,
  onSubmit,
}: {
  open: boolean;
  run: TestRun;
  step: TestRunStep;
  busy: boolean;
  /** Bumped when the open run or step changes. A late submit must not close a newer dialog. */
  generation: MutableRefObject<number>;
  onClose: () => void;
  onSubmit: (body: FileDefectBody) => Promise<void>;
}) {
  const { app } = useAppContext();
  const repoNames = appRepoNames(app?.repos);
  const [title, setTitle] = useState(() => utf8Prefix(step.action, TITLE_MAX_BYTES));
  const [severity, setSeverity] = useState<Severity>('P2');
  const [selected, setSelected] = useState<string[]>(() =>
    initialRepos(repoNames, run.refs ?? []),
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const locked = submitting || busy;
  const shots = step.evidence?.length ?? 0;

  function toggleRepo(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((repo) => repo !== name) : [...prev, name],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked || submittingRef.current) return;
    submittingRef.current = true;
    const gen = generation.current;
    const body: FileDefectBody = { severity };
    const trimmedTitle = utf8Prefix(title.trim(), TITLE_MAX_BYTES);
    if (trimmedTitle) body.title = trimmedTitle;
    if (repoNames.length) {
      body.repos = repoNames.filter((name) => selected.includes(name));
    }
    const trimmedNote = note.trim();
    if (trimmedNote) body.note = trimmedNote;
    const reporter = getOperatorName().trim();
    if (reporter) body.reporter = reporter;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(body);
    } catch (e) {
      if (generation.current !== gen) return;
      submittingRef.current = false;
      setError(errorMessage(e));
      setSubmitting(false);
      return;
    }
    if (generation.current !== gen) return;
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
    >
      <DialogTitle>File defect</DialogTitle>
      <DialogContent>
        <Stack component="form" id="file-defect-form" onSubmit={(e) => void submit(e)} spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Box
            component="section"
            aria-label="Step being filed"
            sx={{
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Box
              component="dl"
              sx={{
                m: 0,
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: 1.5,
                rowGap: 0.5,
                '& dt': { color: 'text.secondary' },
                '& dd': { m: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
              }}
            >
              <Typography component="dt" variant="caption">
                Run
              </Typography>
              <Typography component="dd" variant="body2">
                {run.title || '—'}
              </Typography>
              <Typography component="dt" variant="caption">
                Action
              </Typography>
              <Typography component="dd" variant="body2">
                {step.action || '—'}
              </Typography>
              <Typography component="dt" variant="caption">
                Expected
              </Typography>
              <Typography component="dd" variant="body2">
                {step.expected || '—'}
              </Typography>
              <Typography component="dt" variant="caption">
                Actual
              </Typography>
              <Typography component="dd" variant="body2">
                {step.actual || '—'}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {screenshotLine(shots)}
            </Typography>
          </Box>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(utf8Prefix(e.target.value, TITLE_MAX_BYTES))}
            fullWidth
            size="small"
            autoFocus
            disabled={submitting}
            helperText={
              titleEncoder.encode(step.action).length > TITLE_MAX_BYTES
                ? 'Title is limited to 200 bytes. Leave blank and the server uses the step action, shortened to 80 characters.'
                : 'Leave blank and the server uses the step action, shortened to 80 characters.'
            }
          />
          <FormControl size="small" sx={{ width: 160 }}>
            <InputLabel id="file-defect-severity">Severity</InputLabel>
            <Select
              labelId="file-defect-severity"
              label="Severity"
              value={severity}
              disabled={submitting}
              onChange={(e) => {
                const value = String(e.target.value);
                if (value === 'P1' || value === 'P2' || value === 'P3') setSeverity(value);
              }}
            >
              {SEVERITIES.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {repoNames.length ? (
            <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
              <Typography component="legend" variant="subtitle2" sx={{ mb: 0.5 }}>
                Repos
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap>
                {repoNames.map((name) => (
                  <FormControlLabel
                    key={name}
                    control={
                      <Checkbox
                        size="small"
                        checked={selected.includes(name)}
                        onChange={() => toggleRepo(name)}
                        disabled={locked}
                      />
                    }
                    label={name}
                  />
                ))}
              </Stack>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No repos configured — add named URLs in App Settings.
            </Typography>
          )}
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            disabled={submitting}
            helperText="Optional."
            slotProps={{ htmlInput: { maxLength: 4000 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" form="file-defect-form" variant="contained" disabled={locked}>
          {submitting ? 'Filing…' : 'File defect'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
