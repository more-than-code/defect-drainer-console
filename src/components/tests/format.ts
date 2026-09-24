import type { AppRecord, TestRun, TestRunProgress } from '../../api';

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isPlanKey(value: string): boolean {
  return KEY_RE.test(value) && !value.includes('..');
}

/** ASCII slug. Non-latin titles stay empty so the operator types a key. */
export function slugKey(input: string, max = 64): string {
  const limit = max > 0 ? max : 64;
  let out = '';
  let prevDash = false;
  for (const ch of input.toLowerCase()) {
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (ok) {
      out += ch;
      prevDash = false;
      continue;
    }
    if (!prevDash && out.length > 0) {
      out += '-';
      prevDash = true;
    }
  }
  out = out.replace(/-+$/, '');
  if (out.length > limit) out = out.slice(0, limit).replace(/-+$/, '');
  return out;
}

export function uniqueKey(action: string, used: Set<string>): string {
  const root = slugKey(action, 64) || 'step';
  if (!used.has(root) && isPlanKey(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    let stem = root;
    if (stem.length + suffix.length > 64) {
      stem = stem.slice(0, 64 - suffix.length).replace(/-+$/, '');
    }
    if (!stem) stem = 'step';
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate) && isPlanKey(candidate)) return candidate;
  }
  return root;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function envString(
  env: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = env?.[key];
  return typeof value === 'string' ? value : '';
}

export const PLAN_ENV_FIELDS = ['target', 'device', 'api_base', 'flavor'] as const;

export type PlanEnvFields = Record<(typeof PLAN_ENV_FIELDS)[number], string> & {
  account_label: string;
};

export function buildPlanEnv(
  base: Record<string, unknown>,
  fields: PlanEnvFields,
): Record<string, unknown> {
  const env: Record<string, unknown> = { ...base };
  for (const key of PLAN_ENV_FIELDS) {
    const value = fields[key].trim();
    if (value) env[key] = value;
    else delete env[key];
  }
  const label = fields.account_label.trim();
  if (label) env.account_label = label;
  else delete env.account_label;
  return env;
}

export type AccountView = {
  label: string;
  username: string;
  environment: string;
  secret_ref: string;
};

export function accountView(
  env: Record<string, unknown> | undefined,
): AccountView | null {
  const nested = env?.account;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const row = nested as Record<string, unknown>;
    const str = (key: string) => (typeof row[key] === 'string' ? row[key] : '');
    const view = {
      label: str('label') || envString(env, 'account_label'),
      username: str('username'),
      environment: str('environment'),
      secret_ref: str('secret_ref'),
    };
    if (view.label || view.username || view.secret_ref) return view;
  }
  const label = envString(env, 'account_label');
  if (!label) return null;
  return { label, username: '', environment: '', secret_ref: '' };
}

export function accountLabel(run: TestRun): string {
  return accountView(run.env)?.label || '';
}

export function progressCaption(progress: TestRunProgress): string {
  const done = Math.max(0, progress.total - progress.pending);
  const parts = [`${done}/${progress.total} done`];
  if (progress.fail) parts.push(`${progress.fail} fail`);
  if (progress.blocked) parts.push(`${progress.blocked} blocked`);
  if (progress.skipped) parts.push(`${progress.skipped} skipped`);
  if (progress.unverified) parts.push(`${progress.unverified} unverified`);
  return parts.join(' · ');
}

export function progressPercent(progress: TestRunProgress): number {
  if (progress.total <= 0) return 0;
  const done = Math.max(0, progress.total - progress.pending);
  return Math.round((done / progress.total) * 100);
}

export type RepoRefRow = { name: string; ref: string };

/** One row per repo name on the app. Entry base branch, else the app base branch. */
export function appRepoRefs(app: AppRecord): RepoRefRow[] {
  const fallback = app.base_branch?.trim() || '';
  const seen = new Set<string>();
  const rows: RepoRefRow[] = [];
  for (const entry of app.repo_entries ?? []) {
    const name = entry.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, ref: entry.base_branch?.trim() || fallback });
  }
  for (const raw of app.repos ?? []) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    rows.push({ name, ref: fallback });
  }
  return rows;
}

/** Same extension normalising as report evidence, so paste blobs keep an image suffix. */
export function evidenceFileName(index: number, file: File): string {
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

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|heic)$/i.test(file.name)
  );
}
