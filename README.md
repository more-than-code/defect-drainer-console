# defect-drainer-console

**In-workspace path:** `console/`  
**Git repo name (when initialized):** `defect-drainer-console`

Operator UI for the **agent harness defect-fixing workflow** (React 19 + MUI). Primitives adapted from `mo-webadmin-next` (copy-only; extract shared package later).

Workflow framing: [`../docs/workflow.md`](../docs/workflow.md) — **coding agent**, not a single vendor product name.

Routes:

| Path | Page |
|------|------|
| `/onboarding` | **Choose or create app** (required first; stored in localStorage) |
| `/` | **Defects** — inventory, report modal, multi-select → batch agent fix |
| `/jobs` | **Jobs** — harness runs, logs, Create PR / Refresh PRs |
| `/analytics` | **Analytics** — Phase A defect/prompt/job SQL charts + FTS find |
| `/settings` | **Settings** — app repos, workspace root, agent sandbox |

Talks **only** to `defect-drainer-backend` over HTTP.

## Run

```bash
# Terminal 1
cd /Users/joe/workspace/defect-drainer/backend && pnpm dev

# Terminal 2
cd /Users/joe/workspace/defect-drainer/console && pnpm install && pnpm dev
# → http://127.0.0.1:5173
```

## Related

- Umbrella: `../README.md`, `../apps/registry.json`
- Backend: `../backend/README.md`

## License

MIT — see [LICENSE](./LICENSE).
