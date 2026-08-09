/** Named git remote configured in App Settings */
export type AppRepoEntry = {
  name: string;
  url: string;
};

/** Agent sandbox profile for this app (App Settings). API field: grok_sandbox. */
export type GrokSandboxProfile = 'strict' | 'workspace';

export type AppRecord = {
  id: string;
  name: string;
  description?: string;
  workspace_root?: string;
  /** Repo display names (ticks + defect.repos) */
  repos?: string[];
  /** Preferred: name + url from Settings */
  repo_entries?: AppRepoEntry[];
  /** Default remote(s) for batch worktree (Settings) */
  repo_url?: string;
  repo_urls?: string[];
  /** strict = restrict (code-only); workspace = host read incl. Simulator */
  grok_sandbox?: GrokSandboxProfile;
  default?: boolean;
};

export type Defect = {
  id: string;
  title: string;
  app_id: string;
  severity: string;
  status: string;
  summary: string;
  client: string;
  surface: string;
  source?: string;
  /** Related repo names (from Report ticks) */
  repos?: string[];
  /** Report-time screenshots */
  evidence: string[];
  /** Post-fix proof (required to resolve) */
  fix_evidence?: string[];
  body: string;
  path: string;
  reported?: string;
  resolution?: string;
};

export type Job = {
  jobId: string;
  defectId: string;
  status: string;
  mode: string;
  app_id?: string;
  source?: string;
  comment?: string;
  defectPath?: string;
  error?: string;
  log?: string[];
};

export type BatchRecord = {
  id: string;
  title: string;
  app_id: string;
  goal: string;
  status: string;
  defect_ids: string[];
  created: string;
  path: string;
  mode?: string;
};

/** GitHub PR lifecycle from host `gh` refresh */
export type GhPrState = 'open' | 'merged' | 'closed';

export type BatchJobPr = {
  repo: string;
  branch: string;
  base: string;
  status: 'created' | 'existing' | 'skipped' | 'failed' | string;
  url?: string;
  commits?: number;
  error?: string;
  /** Last known GitHub state (refresh-prs) */
  ghState?: GhPrState | string;
  ghNumber?: number;
  mergedAt?: string | null;
  checkedAt?: string;
  ghError?: string;
};

export type BatchJob = {
  jobId: string;
  batchId: string;
  status: string;
  mode: string;
  app_id: string;
  defect_ids: string[];
  createdAt: string;
  updatedAt?: string;
  error?: string;
  log?: string[];
  batchPath?: string;
  handoffPath?: string;
  repo_urls?: string[];
  worktrees?: Array<{
    repo: string;
    primaryAbs: string;
    worktreeAbs: string;
    branch: string;
    repoUrl?: string;
  }>;
  prs?: BatchJobPr[];
};

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function evidenceUrl(rel: string): string | null {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = parts[parts.length - 1];
  const did = parts[parts.length - 2];
  if (!file || !did) return null;
  return `/evidence/${encodeURIComponent(did)}/${encodeURIComponent(file)}`;
}
