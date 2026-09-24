import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tooltip from '@mui/material/Tooltip';
import { ConfirmDialog } from '../ConfirmDialog';

export function RunActions({
  status,
  busy,
  operatorMissing,
  onAdd,
  onFinish,
  onAbandon,
  onReview,
  onAcceptAll,
  onSave,
  onDelete,
}: {
  status: string;
  busy: boolean;
  operatorMissing: boolean;
  onAdd: () => void;
  onFinish: () => void;
  onAbandon: () => void;
  onReview: () => void;
  onAcceptAll: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
        borderBottom: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      {status === 'in_progress' ? (
        <Button size="small" variant="outlined" disabled={busy} onClick={onAdd}>
          Add step
        </Button>
      ) : null}
      {status === 'in_progress' ? (
        <Button size="small" variant="contained" disabled={busy} onClick={onFinish}>
          Finish
        </Button>
      ) : null}
      {status === 'awaiting_review' ? (
        <Button size="small" variant="outlined" disabled={busy} onClick={onAcceptAll}>
          Accept all
        </Button>
      ) : null}
      {status === 'awaiting_review' ? (
        <Tooltip title={operatorMissing ? 'Set an operator name in Settings first' : 'Submit review'}>
          <span>
            <Button
              size="small"
              variant="contained"
              disabled={busy || operatorMissing}
              onClick={onReview}
            >
              Submit review
            </Button>
          </span>
        </Tooltip>
      ) : null}
      {status === 'in_progress' || status === 'awaiting_review' ? (
        <Button size="small" color="warning" disabled={busy} onClick={onAbandon}>
          Abandon
        </Button>
      ) : null}
      {status !== 'abandoned' ? (
        <Button size="small" disabled={busy} onClick={onSave}>
          Save as plan
        </Button>
      ) : null}
      <Box sx={{ flex: 1 }} />
      <Button size="small" color="error" disabled={busy} onClick={onDelete}>
        Delete
      </Button>
    </Box>
  );
}

export function RunConfirmDialogs({
  confirm,
  deleteEvidence,
  onDeleteEvidence,
  onFinish,
  onAbandon,
  onDelete,
  onCancel,
  confirmDisabled,
}: {
  confirm: 'finish' | 'abandon' | 'delete' | null;
  deleteEvidence: boolean;
  onDeleteEvidence: (value: boolean) => void;
  onFinish: () => void;
  onAbandon: () => void;
  onDelete: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <>
      <ConfirmDialog
        open={confirm === 'finish'}
        title="Finish this run?"
        message="Finish this run and send it for review? Passes without screenshots become unverified."
        confirmLabel="Finish"
        cancelLabel="Cancel"
        confirmDisabled={confirmDisabled}
        onConfirm={onFinish}
        onCancel={onCancel}
      />
      <ConfirmDialog
        open={confirm === 'abandon'}
        title="Abandon this run?"
        message="Abandon this run? It can no longer be finished or reviewed."
        confirmLabel="Abandon"
        cancelLabel="Cancel"
        confirmDisabled={confirmDisabled}
        onConfirm={onAbandon}
        onCancel={onCancel}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this run?"
        message="Delete this run? This cannot be undone."
        details={
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                checked={deleteEvidence}
                onChange={(e) => onDeleteEvidence(e.target.checked)}
              />
            }
            label="Also delete screenshots"
          />
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmDisabled={confirmDisabled}
        onConfirm={onDelete}
        onCancel={onCancel}
      />
    </>
  );
}
