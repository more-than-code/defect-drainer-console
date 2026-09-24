/** Operator-facing test plan / run labels (API still uses snake_case values). */

export const STEP_RESULT_VALUES = [
  'pass',
  'fail',
  'blocked',
  'skipped',
  'pending',
] as const;

export const RUN_STATUS_VALUES = [
  'in_progress',
  'awaiting_review',
  'reviewed',
  'abandoned',
  'queued',
] as const;

export const REVIEW_VALUES = ['accepted', 'disputed'] as const;

const STEP_LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  skipped: 'Skipped',
  pending: 'Pending',
  unverified: 'Unverified',
};

const RUN_LABELS: Record<string, string> = {
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  reviewed: 'Reviewed',
  abandoned: 'Abandoned',
  queued: 'Queued',
};

const REVIEW_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  disputed: 'Disputed',
};

export const compactChipSx = {
  height: 22,
  fontSize: 11,
  maxWidth: '100%',
  '& .MuiChip-label': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    px: 0.75,
    fontSize: 11,
  },
} as const;

export function stepStatusLabel(status: string | undefined | null): string {
  if (!status) return '—';
  return STEP_LABELS[status] ?? status;
}

export function stepStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'error';
  if (status === 'blocked' || status === 'unverified') return 'warning';
  return 'default';
}

/** Pending is outlined so it is distinct from skipped (also default). */
export function stepStatusVariant(status: string): 'filled' | 'outlined' {
  return status === 'pending' ? 'outlined' : 'filled';
}

export function runStatusLabel(status: string | undefined | null): string {
  if (!status) return '—';
  return RUN_LABELS[status] ?? status;
}

export function runStatusOptions(): Array<{ value: string; label: string }> {
  return RUN_STATUS_VALUES.map((value) => ({
    value,
    label: runStatusLabel(value),
  }));
}

export function runStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'reviewed') return 'success';
  if (status === 'awaiting_review') return 'warning';
  if (status === 'in_progress' || status === 'queued') return 'info';
  return 'default';
}

export function reviewLabel(review: string | undefined | null): string {
  if (!review) return '—';
  return REVIEW_LABELS[review] ?? review;
}

export function reviewColor(
  review: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (review === 'accepted') return 'success';
  if (review === 'disputed') return 'error';
  return 'default';
}
