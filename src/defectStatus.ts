/** Operator-facing status labels (API still uses snake_case values). */

export const DEFECT_STATUS_VALUES = [
  'open',
  'triaged',
  'in_progress',
  'resolved',
  'wontfix',
  'duplicate',
] as const;

export type DefectStatusValue = (typeof DEFECT_STATUS_VALUES)[number];

const LABELS: Record<string, string> = {
  open: 'Open',
  triaged: 'Triaged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wontfix: "Won't fix",
  duplicate: 'Duplicate',
};

export function defectStatusLabel(status: string | undefined | null): string {
  if (!status) return '—';
  return LABELS[status] ?? status;
}

export function defectStatusOptions(): Array<{ value: string; label: string }> {
  return DEFECT_STATUS_VALUES.map((value) => ({
    value,
    label: defectStatusLabel(value),
  }));
}

export function defectStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'resolved') return 'success';
  if (status === 'in_progress') return 'info';
  if (status === 'wontfix' || status === 'duplicate') return 'default';
  if (status === 'open' || status === 'triaged') return 'warning';
  return 'default';
}
