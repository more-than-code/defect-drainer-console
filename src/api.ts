/** Named repo configured in App Settings */
export type AppRepoEntry = {
  name: string;
  /** GitHub URL when base_source is origin; absolute checkout path when local. */
  url: string;
  base_source?: 'origin' | 'local';
  base_branch?: string;
};

/** Agent sandbox profile for this app (App Settings). API field: grok_sandbox. */
export type GrokSandboxProfile = 'strict' | 'workspace';

/** Toolchain DD pre-provisions into the job handoff. API field: agent_toolchain. */
export type AgentToolchain = 'none' | 'flutter';

/** Operator-defined check DD re-runs in a worktree after a fix job. */
export type VerifyCommand = { repo: string; command: string };

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
  /** none = agent brings its own; flutter = pinned SDK cloned into the handoff */
  agent_toolchain?: AgentToolchain;
  /** Grant the agent Simulator device-tree writes (real installs/screenshots) */
  allow_simulator_writes?: boolean;
  /** Commands DD re-runs after a fix job; all must pass before a defect resolves */
  verify_commands?: VerifyCommand[];
  /** App-level fallback when a repo entry has no source of its own. */
  base_remote?: string;
  /** App-level fallback branch. */
  base_branch?: string;
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
  /** How it was detected: detector or lens name (`parity-review`, `console`). */
  source?: string;
  /** Who filed it: operator name or agent tool. Empty on pre-existing records. */
  reporter?: string;
  /** Related repo names (from Report ticks) */
  repos?: string[];
  /** Report-time screenshots */
  evidence: string[];
  /** Post-fix proof (required to resolve) */
  fix_evidence?: string[];
  body: string;
  path: string;
  /** UTC date-only, e.g. `2026-08-16` — no time. Prefer `created_at` for display. */
  reported?: string;
  /** Report instant, ISO 8601 UTC. Absent on records written before it was exposed. */
  created_at?: string;
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
  verification?: BatchJobVerification;
};

/** One operator-defined check DD re-ran after the fix session. */
export type VerifyResult = {
  repo: string;
  command: string;
  cwd: string;
  exit_code: number | null;
  signal: string | null;
  ok: boolean;
  duration_ms: number;
  output_tail: string;
  skipped_reason?: string;
};

export type BatchJobVerification = {
  ran: boolean;
  ok: boolean;
  results: VerifyResult[];
  startedAt: string;
  finishedAt: string;
};

export async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function listRepoBranches(
  source: 'origin' | 'local',
  location: string,
): Promise<{ branches: string[]; current?: string }> {
  return api('/api/git/branches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, location }),
  });
}

export function chooseLocalFolder(): Promise<{
  path?: string;
  cancelled?: boolean;
}> {
  return api('/api/git/choose-folder', { method: 'POST' });
}

export function evidenceUrl(rel: string): string | null {
  const parts = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = parts[parts.length - 1];
  const did = parts[parts.length - 2];
  if (!file || !did) return null;
  return `/evidence/${encodeURIComponent(did)}/${encodeURIComponent(file)}`;
}
