import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import type { TestRun, TestRunStep } from '../../api';
import { LoadingState } from '../LoadingState';
import { progressCaption, progressPercent } from './format';
import { RunEnvironment } from './RunEnvironment';
import { StepRow } from './StepRow';

type ReviewChoice = '' | 'accepted' | 'disputed';

export function RunDetail({
  loading,
  loadError,
  missing,
  run,
  mode,
  actionError,
  pollError,
  infoMessage,
  operatorMissing,
  pasteTarget,
  busy,
  reviewDraft,
  addOpen,
  addAction,
  addExpected,
  addSection,
  onAddAction,
  onAddExpected,
  onAddSection,
  onAddSubmit,
  onAddCancel,
  onActivate,
  onStatus,
  onActual,
  onFiles,
  onReview,
  onReviewNote,
  onViewerChange,
  onFileDefect,
}: {
  loading: boolean;
  loadError: string;
  missing: boolean;
  run: TestRun | null;
  mode: 'edit' | 'review' | 'readonly';
  actionError: string;
  pollError: string;
  infoMessage: string;
  operatorMissing: boolean;
  pasteTarget: string | null;
  busy: boolean;
  reviewDraft: Record<string, { review: ReviewChoice; note: string }>;
  addOpen: boolean;
  addAction: string;
  addExpected: string;
  addSection: string;
  onAddAction: (value: string) => void;
  onAddExpected: (value: string) => void;
  onAddSection: (value: string) => void;
  onAddSubmit: (event: React.FormEvent) => void;
  onAddCancel: () => void;
  onActivate: (step: TestRunStep) => void;
  onStatus: (key: string, status: string) => void;
  onActual: (key: string, actual: string) => Promise<boolean>;
  onFiles: (key: string, files: File[]) => void;
  onReview: (key: string, review: 'accepted' | 'disputed') => void;
  onReviewNote: (key: string, note: string) => void;
  onViewerChange: (stepKey: string, open: boolean) => void;
  onFileDefect: (step: TestRunStep) => void;
}) {
  const steps = run?.steps ?? [];
  const progress = run?.progress;
  return (
    <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
      {loading ? <LoadingState /> : null}
      {loadError ? <Alert severity="error">{loadError}</Alert> : null}
      {missing ? <Typography color="text.secondary">Run not found.</Typography> : null}
      {run ? (
        <Stack spacing={2}>
          {actionError ? <Alert severity="error">{actionError}</Alert> : null}
          {pollError ? <Alert severity="warning">{pollError}</Alert> : null}
          {infoMessage ? <Alert severity="info">{infoMessage}</Alert> : null}
          {mode === 'review' && operatorMissing ? (
            <Alert severity="warning">
              Set an operator name in{' '}
              <Link component={RouterLink} to="/settings">
                Settings
              </Link>{' '}
              before submitting a review.
            </Alert>
          ) : null}
          {mode === 'edit' ? (
            <Typography variant="caption" color="text.secondary">
              Click a step, then paste screenshots. The paste target is outlined and labelled.
            </Typography>
          ) : null}
          <RunEnvironment run={run} />
          {progress ? (
            <Box>
              <Typography variant="subtitle2">Progress</Typography>
              <LinearProgress
                variant="determinate"
                value={progressPercent(progress)}
                color={progress.fail ? 'error' : progress.unverified ? 'warning' : 'primary'}
                aria-label={progressCaption(progress)}
                sx={{ mt: 0.5, height: 4, borderRadius: 1 }}
              />
              <Typography variant="caption" color="text.secondary">
                {progressCaption(progress)}
              </Typography>
            </Box>
          ) : null}
          {run.review_note ? (
            <Typography variant="body2">Review note: {run.review_note}</Typography>
          ) : null}
          {addOpen && mode === 'edit' ? (
            <Box component="form" onSubmit={onAddSubmit}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Add exploratory step</Typography>
                <TextField
                  label="Action"
                  value={addAction}
                  onChange={(e) => onAddAction(e.target.value)}
                  required
                  size="small"
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 4000 } }}
                />
                <TextField
                  label="Expected"
                  value={addExpected}
                  onChange={(e) => onAddExpected(e.target.value)}
                  size="small"
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 4000 } }}
                />
                <TextField
                  label="Section"
                  value={addSection}
                  onChange={(e) => onAddSection(e.target.value)}
                  size="small"
                  fullWidth
                />
                <Stack direction="row" spacing={1}>
                  <Button type="submit" size="small" variant="contained" disabled={busy}>
                    Add step
                  </Button>
                  <Button size="small" onClick={onAddCancel} disabled={busy}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ) : null}
          {steps.map((step) => (
            <StepRow
              key={step.key}
              step={step}
              mode={mode}
              runStatus={run?.status ?? ''}
              pasteTarget={pasteTarget === step.key}
              busy={busy}
              reviewValue={reviewDraft[step.key]?.review ?? ''}
              reviewNote={reviewDraft[step.key]?.note ?? ''}
              onActivate={() => onActivate(step)}
              onStatus={(value) => onStatus(step.key, value)}
              onActual={(actual) => onActual(step.key, actual)}
              onFiles={(files) => onFiles(step.key, files)}
              onReview={(review) => onReview(step.key, review)}
              onReviewNote={(note) => onReviewNote(step.key, note)}
              onViewerChange={onViewerChange}
              onFileDefect={() => onFileDefect(step)}
            />
          ))}
          {!steps.length ? (
            <Typography variant="body2" color="text.secondary">
              No steps yet.
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}
