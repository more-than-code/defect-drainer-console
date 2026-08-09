import type { BatchJobPr, GhPrState } from './api';

export function isTrackablePr(p: BatchJobPr): boolean {
  return (
    Boolean(p.url) || p.status === 'created' || p.status === 'existing'
  );
}

export function prsStale(
  prs: BatchJobPr[] | undefined,
  maxAgeMs = 2 * 60 * 1000,
): boolean {
  const trackable = (prs || []).filter(isTrackablePr);
  if (!trackable.length) return false;
  const now = Date.now();
  return trackable.some((p) => {
    if (!p.checkedAt) return true;
    const t = Date.parse(p.checkedAt);
    if (Number.isNaN(t)) return true;
    return now - t > maxAgeMs;
  });
}

export function ghStateColor(
  state: string | undefined,
): 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary' {
  if (state === 'open') return 'info';
  if (state === 'merged') return 'success';
  if (state === 'closed') return 'default';
  return 'default';
}

export function createStatusColor(
  status: string,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  if (status === 'created' || status === 'existing') return 'info';
  if (status === 'failed') return 'error';
  if (status === 'skipped') return 'warning';
  return 'default';
}

/** Short summary for list cells: "1 open · 1 merged" */
export function summarizePrs(prs: BatchJobPr[] | undefined): string {
  const list = prs || [];
  if (!list.length) return '';
  const open = list.filter((p) => p.ghState === 'open').length;
  const merged = list.filter((p) => p.ghState === 'merged').length;
  const closed = list.filter((p) => p.ghState === 'closed').length;
  const failed = list.filter((p) => p.status === 'failed').length;
  const pending = list.filter(
    (p) =>
      (p.status === 'created' || p.status === 'existing') && !p.ghState,
  ).length;
  const parts: string[] = [];
  if (open) parts.push(`${open} open`);
  if (merged) parts.push(`${merged} merged`);
  if (closed) parts.push(`${closed} closed`);
  if (pending) parts.push(`${pending} PR`);
  if (failed) parts.push(`${failed} failed`);
  if (!parts.length) {
    const skipped = list.filter((p) => p.status === 'skipped').length;
    if (skipped === list.length) return 'skipped';
    return `${list.length} PR`;
  }
  return parts.join(' · ');
}

export function allTrackableMerged(prs: BatchJobPr[]): boolean {
  const trackable = prs.filter(isTrackablePr);
  return (
    trackable.length > 0 && trackable.every((p) => p.ghState === 'merged')
  );
}

export function asGhState(raw: string | undefined): GhPrState | undefined {
  if (raw === 'open' || raw === 'merged' || raw === 'closed') return raw;
  return undefined;
}
