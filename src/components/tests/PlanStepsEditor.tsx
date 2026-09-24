import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { uniqueKey } from './format';

export type DraftStep = {
  localId: string;
  key: string;
  lockedKey: boolean;
  section: string;
  action: string;
  expected: string;
};

export function nextLocalId(): string {
  return `s-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyStep(): DraftStep {
  return {
    localId: nextLocalId(),
    key: '',
    lockedKey: false,
    section: '',
    action: '',
    expected: '',
  };
}

export function PlanStepsEditor({
  steps,
  onChange,
}: {
  steps: DraftStep[];
  onChange: (steps: DraftStep[]) => void;
}) {
  function onAction(index: number, action: string) {
    onChange(
      steps.map((step, i) => {
        if (i !== index) return step;
        if (step.lockedKey) return { ...step, action };
        const used = new Set(
          steps.filter((other, j) => j !== index && other.key).map((other) => other.key),
        );
        return {
          ...step,
          action,
          key: action.trim() ? uniqueKey(action, used) : '',
        };
      }),
    );
  }

  function move(index: number, dir: -1 | 1) {
    const next = steps.slice();
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(to, 0, item);
    onChange(next);
  }

  function patch(index: number, partial: Partial<DraftStep>) {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...partial } : step)));
  }

  return (
    <Box>
      <Typography variant="subtitle2">Steps</Typography>
      <Typography variant="caption" color="text.secondary">
        New step keys are generated from the action. Saved keys stay put.
      </Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {steps.map((step, index) => (
          <Box
            key={step.localId}
            sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
          >
            <Stack direction="row" spacing={0.5} sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ flex: 1, alignSelf: 'center' }}>
                {index + 1}
                {step.key ? ` · ${step.key}` : ''}
              </Typography>
              <Tooltip title="Move step up">
                <span>
                  <IconButton
                    aria-label={`Move step ${index + 1} up`}
                    size="small"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move step down">
                <span>
                  <IconButton
                    aria-label={`Move step ${index + 1} down`}
                    size="small"
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Remove step">
                <IconButton
                  aria-label={`Remove step ${index + 1}`}
                  size="small"
                  onClick={() => onChange(steps.filter((_, i) => i !== index))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Stack spacing={1}>
              <TextField
                label="Section"
                value={step.section}
                onChange={(e) => patch(index, { section: e.target.value })}
                size="small"
                fullWidth
              />
              <TextField
                label="Action"
                value={step.action}
                onChange={(e) => onAction(index, e.target.value)}
                required
                size="small"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 4000 } }}
              />
              <TextField
                label="Expected"
                value={step.expected}
                onChange={(e) => patch(index, { expected: e.target.value })}
                size="small"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 4000 } }}
              />
            </Stack>
          </Box>
        ))}
      </Stack>
      <Button
        startIcon={<AddIcon />}
        size="small"
        sx={{ mt: 1 }}
        onClick={() => onChange([...steps, emptyStep()])}
      >
        Add step
      </Button>
    </Box>
  );
}
