# defect-drainer-console

**In-workspace path:** `console/`  
**Git repo name (when initialized):** `defect-drainer-console`

Operator UI for the **agent harness defect-fixing workflow** (React 19 + MUI). Primitives adapted from `mo-webadmin-next` (copy-only; extract shared package later).

Workflow framing: [`../backend-go/docs/workflow.md`](../backend-go/docs/workflow.md) — **coding agent**, not a single vendor product name. What each button does and when to use it: [`../backend-go/docs/operating.md`](../backend-go/docs/operating.md).

Routes:

| Path | Page |
|------|------|
| `/onboarding` | **Choose or create app** (required first; stored in localStorage) |
| `/` | **Defects** — inventory, report modal. One checked defect is **Start fix**; more than one is **Start batch fix**. A resolved defect cannot start a fix until it is reopened. The defect dialog can **Start fix** for an open defect, or add it to the selection. Reported column is local date + 24h time (`created_at`). Reporter column is who filed it (`reporter`, else dimmed `source`). Report/fix evidence are 96×96 thumbs; click opens a gallery modal (←/→, Esc back to the defect). |
| `/jobs` | **Jobs** — harness runs, logs. The job detail opens in a side drawer (batch id, status, job id, relative created time). A bar under the header has **Stop**, **Resume** (continue the agent's last session), **Re-run** (new session, same worktrees) and **Create PR** / **Merge**, plus a **⋮** menu with **Refresh log**, **Refresh PRs** and **Delete**. **Stop**, **Resume** and **Re-run** are enabled by the same rules as before (**Stop** while running or queued; **Resume** / **Re-run** by the server's `resumable` / `rerunnable` checks). A disabled Resume or Re-run tooltip gives the reason, and that reason is repeated under the bar when the job is not running or queued. Tabs are **Overview**, **Evidence** and **Log** — Log is selected when a running or queued job opens. Overview shows the agent run summary (attempts, how it stopped, turns, cost), each linked defect with its latest harvest outcome, verification, diff hygiene, PRs, and worktrees collapsed (base branch, job branch, path). Evidence shows the defect's report screenshots and each harvest run's imported images, or a note when the job has no harvest record. GitHub bases show Create PR and Refresh PRs. A local checkout shows Merge, and that button is disabled once the merge has landed. Refresh PRs is not shown for a local merge. If the worktree has uncommitted files, the confirm dialog lists them and a message, and **Commit and merge** commits those files before merging. Cancel leaves the worktree unchanged. A queued job shows its place in the simulator line (tooltip and drawer). |
| `/tests` | **Tests** — per-app test plans and manual test runs. Runs and Plans tabs; a run opens in a side drawer for step results, screenshots, and review. |
| `/analytics` | **Analytics** — Phase A defect/prompt/job SQL charts + FTS find |
| `/settings` | **Settings** — per-repo **Base source** (GitHub \| Local checkout) → **Location** (URL or absolute path; Local starts empty, folder button opens Finder) → **Base branch** (read from that repo). Agent sandbox. This-browser operator name (reporter). |

Talks **only** to the harness HTTP API (`/api`, `/health`, `/evidence`) — live process is `defect-drainer serve` in `../backend-go`.

## Run

```bash
# Terminal 1
cd /Users/joe/workspace/defect-drainer/backend-go && go run ./cmd/defect-drainer serve

# Terminal 2
cd /Users/joe/workspace/defect-drainer/console && pnpm install && pnpm dev
# → http://127.0.0.1:5174
```

## Related

- Umbrella: `../README.md`
- Live API: `../backend-go/README.md`
- Operator runbook: `../backend-go/docs/operating.md`

## License

MIT — see [LICENSE](./LICENSE).
