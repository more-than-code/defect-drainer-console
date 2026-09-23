# defect-drainer-console

**In-workspace path:** `console/`  
**Git repo name (when initialized):** `defect-drainer-console`

Operator UI for the **agent harness defect-fixing workflow** (React 19 + MUI). Primitives adapted from `mo-webadmin-next` (copy-only; extract shared package later).

Workflow framing: [`../docs/workflow.md`](../docs/workflow.md) — **coding agent**, not a single vendor product name.

Routes:

| Path | Page |
|------|------|
| `/onboarding` | **Choose or create app** (required first; stored in localStorage) |
| `/` | **Defects** — inventory, report modal. One checked defect is **Start fix**; more than one is **Start batch fix**. A resolved defect cannot start a fix until it is reopened. The defect dialog can **Start fix** for an open defect, or add it to the selection. Reported column is local date + 24h time (`created_at`). Reporter column is who filed it (`reporter`, else dimmed `source`). Report/fix evidence are 96×96 thumbs; click opens a gallery modal (←/→, Esc back to the defect). |
| `/jobs` | **Jobs** — harness runs, logs. The job detail opens in a side drawer and lists each worktree's base branch, job branch, and path. GitHub bases show Create PR and Refresh PRs. A local checkout shows Merge, and that button is disabled once the merge has landed. Refresh PRs is not shown for a local merge. If the worktree has uncommitted files, the confirm dialog lists them and a message, and **Commit and merge** commits those files before merging. Cancel leaves the worktree unchanged |
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

- Umbrella: `../README.md`, `../apps/registry.json`
- Live API: `../backend-go/README.md`
- Rollback API: `../backend/README.md`

## License

MIT — see [LICENSE](./LICENSE).
