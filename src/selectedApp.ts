import type { AppRecord } from './api';
import { api } from './api';

const STORAGE_KEY = 'defect-drainer.activeAppId';

export function getStoredAppId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setStoredAppId(appId: string): void {
  localStorage.setItem(STORAGE_KEY, appId);
}

export function clearStoredAppId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Remember Report-screen repo ticks per app */
function reportReposKey(appId: string): string {
  return `defect-drainer.reportRepos.${appId}`;
}

export function getStoredReportRepos(appId: string): string[] | null {
  try {
    const raw = localStorage.getItem(reportReposKey(appId));
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return null;
    return v.map(String).filter(Boolean);
  } catch {
    return null;
  }
}

export function setStoredReportRepos(appId: string, names: string[]): void {
  try {
    localStorage.setItem(reportReposKey(appId), JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

/** Resolve stored id against live registry; null if unset or unknown. */
export async function resolveActiveApp(): Promise<{
  appId: string | null;
  app: AppRecord | null;
  apps: AppRecord[];
  defaultAppId: string;
}> {
  const res = await api<{ apps: AppRecord[]; defaultAppId: string }>('/api/apps');
  const stored = getStoredAppId();
  const app =
    (stored && res.apps.find((a) => a.id === stored)) ||
    null;
  return {
    appId: app?.id ?? null,
    app,
    apps: res.apps,
    defaultAppId: res.defaultAppId,
  };
}
