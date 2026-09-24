import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { evidenceUrl, type TestRunStep } from '../../api';
import { EvidenceGallery } from '../EvidenceGallery';
import { DefectLinkChip } from './DefectLinkChip';
import {
  REVIEW_VALUES,
  STEP_RESULT_VALUES,
  compactChipSx,
  reviewColor,
  reviewLabel,
  stepStatusColor,
  stepStatusLabel,
  stepStatusVariant,
} from '../../testStatus';

export function StepRow({
  step,
  mode,
  runStatus,
  pasteTarget,
  busy,
  reviewValue,
  reviewNote,
  onActivate,
  onStatus,
  onActual,
  onFiles,
  onReview,
  onReviewNote,
  onViewerChange,
  onFileDefect,
}: {
  step: TestRunStep;
  mode: 'edit' | 'review' | 'readonly';
  runStatus: string;
  pasteTarget: boolean;
  busy: boolean;
  reviewValue: '' | 'accepted' | 'disputed';
  reviewNote: string;
  onActivate: () => void;
  onFileDefect: () => void;
  onStatus: (status: string) => void;
  onActual: (actual: string) => Promise<boolean>;
  onFiles: (files: File[]) => void;
  onReview: (review: 'accepted' | 'disputed') => void;
  onReviewNote: (note: string) => void;
  onViewerChange: (stepKey: string, open: boolean) => void;
}) {
  const [actual, setActual] = useState(step.actual);
  const [focused, setFocused] = useState(false);
  // Draft kept until the server echoes it. A failed PATCH puts the typed text back.
  const pendingActual = useRef<string | null>(null);
  const reportViewer = useCallback(
    (open: boolean) => onViewerChange(step.key, open),
    [onViewerChange, step.key],
  );
  const statusId = `step-status-${step.key}`;
  const reviewId = `step-review-${step.key}`;
  const images = (step.evidence || []).flatMap((rel) => {
    const url = evidenceUrl(rel);
    return url ? [{ url, alt: rel }] : [];
  });
  const offered = STEP_RESULT_VALUES.some((value) => value === step.status);
  const canFile =
    runStatus !== 'abandoned' &&
    !step.defect_id &&
    (step.status === 'fail' || step.status === 'blocked');

  useEffect(() => {
    pendingActual.current = null;
    setActual(step.actual);
    setFocused(false);
  }, [step.key]);

  useEffect(() => {
    if (focused) return;
    const pending = pendingActual.current;
    if (pending !== null && step.actual !== pending && step.actual !== pending.trim()) return;
    pendingActual.current = null;
    setActual(step.actual);
  }, [step.actual, focused]);

  return (
    <Box
      onClick={onActivate}
      onFocusCapture={onActivate}
      sx={{
        p: 1,
        borderRadius: 1,
        border: 1,
        borderColor: step.status === 'fail' ? 'error.main' : 'divider',
        outline: mode === 'edit' && pasteTarget ? '2px solid' : 'none',
        outlineColor: 'primary.main',
        outlineOffset: 2,
        bgcolor: 'background.default',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 20 }}>
          {step.position}
        </Typography>
        <Chip
          size="small"
          label={stepStatusLabel(step.status)}
          color={stepStatusColor(step.status)}
          variant={stepStatusVariant(step.status)}
          sx={compactChipSx}
        />
        {step.exploratory ? (
          <Chip size="small" variant="outlined" label="exploratory" sx={compactChipSx} />
        ) : null}
        {mode === 'edit' && pasteTarget ? (
          <Chip size="small" variant="outlined" color="primary" label="Paste target" sx={compactChipSx} />
        ) : null}
        {step.defect_id ? (
          <DefectLinkChip id={step.defect_id} status={step.defect_status} />
        ) : null}
        {canFile ? (
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            aria-label={`File defect for step ${step.position}: ${step.action}`}
            onClick={(event) => {
              event.stopPropagation();
              onFileDefect();
            }}
            sx={{ py: 0.25 }}
          >
            File defect
          </Button>
        ) : null}
      </Stack>
      {step.section ? (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
          {step.section}
        </Typography>
      ) : null}
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {step.action}
      </Typography>
      {step.expected ? (
        <Typography variant="body2" color="text.secondary">
          Expected: {step.expected}
        </Typography>
      ) : null}

      {mode === 'edit' ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography id={statusId} variant="caption" component="div">
            Result
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            aria-labelledby={statusId}
            value={offered ? step.status : null}
            onChange={(_event, value: string | null) => {
              if (!value || value === step.status) return;
              onStatus(value);
            }}
            disabled={busy}
          >
            {STEP_RESULT_VALUES.map((value) => (
              <ToggleButton key={value} value={value}>
                {stepStatusLabel(value)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField
            label="Actual"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              if (actual === step.actual) return;
              const draft = actual;
              pendingActual.current = draft;
              void onActual(draft).then((ok) => {
                if (ok) return;
                pendingActual.current = draft;
                setActual(draft);
              });
            }}
            size="small"
            fullWidth
            multiline
            minRows={2}
            disabled={busy && !focused}
            slotProps={{ htmlInput: { maxLength: 4000 } }}
          />
          <Button
            component="label"
            size="small"
            startIcon={<AddPhotoAlternateIcon />}
            disabled={busy}
          >
            Add screenshots
            <input
              hidden
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = '';
                if (list.length) onFiles(list);
              }}
            />
          </Button>
        </Stack>
      ) : step.actual ? (
        <Typography variant="body2" sx={{ mt: 0.75 }}>
          Actual: {step.actual}
        </Typography>
      ) : null}

      <Box sx={{ mt: 1 }}>
        <EvidenceGallery
          groups={[
            {
              title: 'Screenshots',
              emptyLabel: 'No screenshots',
              items: images,
            },
          ]}
          onViewerChange={reportViewer}
        />
      </Box>

      {mode === 'review' ? (
        step.status === 'pending' ? (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Pending steps cannot be reviewed.
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography id={reviewId} variant="caption" component="div">
              Review
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              aria-labelledby={reviewId}
              value={reviewValue || null}
              disabled={busy}
              onChange={(_event, value: string | null) => {
                if (value === 'accepted' || value === 'disputed') onReview(value);
              }}
            >
              {REVIEW_VALUES.map((value) => (
                <ToggleButton key={value} value={value}>
                  {reviewLabel(value)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField
              label="Note"
              value={reviewNote}
              onChange={(e) => onReviewNote(e.target.value)}
              size="small"
              fullWidth
              disabled={busy}
              slotProps={{ htmlInput: { maxLength: 4000 } }}
            />
          </Stack>
        )
      ) : null}

      {mode === 'readonly' && step.review ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={reviewLabel(step.review)}
            color={reviewColor(step.review)}
            sx={compactChipSx}
          />
          {step.review_note ? (
            <Typography variant="body2">{step.review_note}</Typography>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}
