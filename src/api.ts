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
  /** Cap on the coding agent's turns for this app. 0 / absent = server default (80). */
  agent_max_turns?: number;
  /** Commands DD re-runs after a fix job; all must pass before a defect resolves */
  verify_commands?: VerifyCommand[];
  /** Operator login hints. Passwords are never stored. */
  test_accounts?: TestAccount[];
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
  /** How it was detected: detector or lens name (`parity-review`, `console`, `test-run`). */
  source?: string;
  /** Who filed it: operator name or agent tool. Empty on pre-existing records. */
  reporter?: string;
  /** Related repo names (from Report ticks) */
  repos?: string[];
  /** Cross-links. Filed from a test run: `<TRUN-id>/steps/<step key>`. */
  related?: string[];
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
  /** pr = GitHub pull request; merge = local base branch. Absent on older rows. */
  kind?: 'pr' | 'merge' | string;
};

export type HarvestOutcome =
  | 'resolved'
  | 'regression'
  | 'not_resolved'
  | 'notes_only'
  | 'no_evidence'
  | 'error';

/** One defect's result in one harvest. `images` are inventory paths this run imported. */
export type HarvestDefect = {
  defectId: string;
  outcome: HarvestOutcome | string;
  reason?: string;
  /** e.g. "evidence/DEF-…/fix-01.png"; pass to evidenceUrl() */
  images?: string[];
};

/** One harvest (one agent run), oldest first, last 20 kept. */
export type HarvestRun = { at: string; defects: HarvestDefect[] };

/** Live simulator-line slot. Present only while this job is waiting. */
export type SimQueue = {
  /** 1-based FIFO position. */
  position: number;
  /** Job id currently holding the simulator. */
  holder: string;
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
  /** RFC3339 time this job started waiting. Kept after it runs. */
  queuedAt?: string;
  /** How the waiting job was submitted. Kept after it runs. */
  queuedMode?: 'fresh' | 'rerun' | 'resume';
  /** Set only while waiting; absent once this job holds the simulator. */
  simQueue?: SimQueue;
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
    /** Commit-ish the job branch was cut from. */
    baseRef?: string;
    /** Branch a PR or local merge targets. */
    baseBranch?: string;
    /** local = merge into the checkout; origin = GitHub pull request. */
    baseSource?: 'local' | 'origin' | string;
  }>;
  prs?: BatchJobPr[];
  verification?: BatchJobVerification;
  /** Same commands run before the agent, so pre-existing red is attributable. */
  baseline?: BatchJobVerification;
  diffHygiene?: DiffHygieneReport;
  /** Driver-loop record, cumulative across Re-run and Resume. */
  agentRun?: AgentRun;
  /**
   * Harvest results, oldest first. On GET /api/batch-jobs/{id} only —
   * GET /api/batches omits it. Absent on jobs run before harvests existed.
   */
  harvests?: HarvestRun[];
  /** Server-computed: may this job continue its last agent session? */
  resumable?: RestartCheck;
  /** Server-computed: may this job start a new agent session? */
  rerunnable?: RestartCheck;
};

/** What deleting a job does (delete-preview) or did (DELETE) to one repo. */
export type WorktreeDiscard = {
  repo: string;
  worktree: string;
  /** Still a usable checkout. */
  present: boolean;
  /** Up to 50 uncommitted paths that deleting discards. */
  uncommitted?: string[];
  uncommittedCount: number;
  branch: string;
  /** Commits on the branch not in its base, HEAD or upstream; -1 unknown. */
  unmerged: number;
  branchAction: 'delete' | 'keep' | 'none' | string;
  reason?: string;
  error?: string;
};

/** Whether a restart is allowed; `reason` says why not, for the operator. */
export type RestartCheck = { ok: boolean; reason?: string };

export type AgentRun = {
  iterations: number;
  completedByArtifacts: boolean;
  stoppedBy?: string;
  stopReasons?: string[];
  turns?: number;
  totalCostUsd?: number;
  sessionId?: string;
  missing?: string[];
  resumes?: number;
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

/** How much of a job's diff was reformatting rather than change. */
export type RepoDiffHygiene = {
  repo: string;
  filesChanged: number;
  changedLines: number;
  effectiveLines: number;
  formattingOnlyLines: number;
  hunks: number;
  formattingOnlyHunks: number;
  formattingRatio: number;
  error?: string;
};

export type DiffHygieneReport = { repos: RepoDiffHygiene[]; noisy: boolean };

/** One hunk from the drill-down endpoint. */
export type DiffHunk = {
  file: string;
  header: string;
  removed: string[];
  added: string[];
  reflow: boolean;
};

export type DiffHunksResponse = {
  repo: string;
  kind: 'reflow' | 'all';
  hunks: DiffHunk[];
  total: number;
  truncated: boolean;
};

export type BatchJobVerification = {
  ran: boolean;
  ok: boolean;
  results: VerifyResult[];
  startedAt: string;
  finishedAt: string;
};

/** Operator login hint. A password is never a field. */
export type TestAccount = {
  label: string;
  username: string;
  environment: string;
  secret_ref: string;
};

export type TestPlanStep = {
  key: string;
  position: number;
  section: string;
  action: string;
  expected: string;
};

/** Detail responses include `steps`. List rows include `step_count` and omit `steps`. */
export type TestPlan = {
  id: string;
  app_id: string;
  key: string;
  title: string;
  purpose: string;
  env: Record<string, unknown>;
  version: number;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  steps?: TestPlanStep[];
  step_count?: number;
};

export type TestStepStatus =
  | 'pass'
  | 'fail'
  | 'blocked'
  | 'skipped'
  | 'pending'
  | 'unverified'
  | string;

export type TestRunStatus =
  | 'in_progress'
  | 'awaiting_review'
  | 'reviewed'
  | 'abandoned'
  | 'queued'
  | string;

export type TestStepReview = '' | 'accepted' | 'disputed' | string;

export type TestRunStep = {
  key: string;
  position: number;
  section: string;
  action: string;
  expected: string;
  exploratory: boolean;
  status: TestStepStatus;
  actual: string;
  evidence: string[];
  defect_id: string | null;
  /** Status of the linked defect. Null when there is no link, or the defect was deleted. */
  defect_status: string | null;
  review: TestStepReview;
  review_note: string;
  updated_at: string;
};

export type TestRunProgress = {
  total: number;
  pending: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  unverified: number;
};

export type TestRunRef = {
  repo: string;
  ref: string;
  sha?: string;
};

/** Detail responses include `steps`. List rows keep `progress` and omit `steps`. */
export type TestRun = {
  id: string;
  app_id: string;
  plan_id: string | null;
  plan_version: number | null;
  title: string;
  executor: 'operator' | 'agent-session' | string;
  executed_by: string;
  job_id: string | null;
  env: Record<string, unknown>;
  refs: TestRunRef[];
  status: TestRunStatus;
  reviewed_by: string;
  reviewed_at: string | null;
  review_note: string;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  progress: TestRunProgress;
  steps?: TestRunStep[];
};

export type PlanGridPlan = {
  id: string;
  key: string;
  title: string;
  version: number;
};

export type PlanGridRun = {
  id: string;
  title: string;
  plan_version: number;
  started_at: string;
  reviewed_at: string;
  reviewed_by: string;
  refs: TestRunRef[];
};

export type PlanGridDefect = {
  id: string;
  status: string;
  run_id: string;
};

export type PlanGridCell = {
  run_id: string;
  status: string;
  review: string;
  defect_id: string | null;
};

export type PlanGridStep = {
  key: string;
  position: number;
  section: string;
  action: string;
  needs_retest: boolean;
  defects: PlanGridDefect[];
  /** Aligned with `runs`. Null when that run has no step with this key. */
  cells: Array<PlanGridCell | null>;
};

/** `GET /api/test-plans/{id}/grid` — the `grid` object. */
export type PlanGrid = {
  plan: PlanGridPlan;
  runs: PlanGridRun[];
  steps: PlanGridStep[];
};

/** Defect body on a file-defect 201. Fields match that response. */
export type FiledTestDefect = {
  id: string;
  app_id: string;
  title: string;
  severity: string;
  status: string;
  area: string;
  client: string;
  surface: string;
  repos: string[];
  labels: string[];
  related: string[];
  source: string;
  reporter: string;
  key_files: string[];
  evidence: string[];
  fix_evidence: string[];
  reported: string;
  summary: string;
  body: string;
  bucket: string;
  created_at: string;
  path: string;
};

/** `POST /api/test-runs/{id}/steps/{key}/file-defect` — 201. */
export type FileDefectResponse = {
  defect: FiledTestDefect;
  run: TestRun;
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
