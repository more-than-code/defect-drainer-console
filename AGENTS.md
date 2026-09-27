# defect-drainer-console

**Folder:** `console/` · **Git name:** `defect-drainer-console`

- Operator UI only — all data via harness HTTP (`/api`, `/evidence`, `/health`)
- Dev proxy: Vite → `127.0.0.1:8788` (`defect-drainer serve` in `../backend-go`)
- Cross-repo plans: `/Users/joe/workspace/defect-drainer/tasks/todo.md`
- Local tasks: `tasks/todo.md`
- Run: `pnpm dev` → `127.0.0.1:5174` (Go API must be up)

## Page composition (mo-webadmin-next)

**Always** use the mo-webadmin-next listing pattern for screens whose primary UI is a table.

### Listing / table screens (required)

```
ListPage
  ├─ PageHeader (title, totalLabel, primaryAction)
  │    ├─ optional description
  │    └─ filters (FilterSelect, SearchField, …)  // header children only
  ├─ ErrorState (if load error)
  ├─ AdminDataGrid / ServerDataGrid               // primary table — not MUI Table
  ├─ optional secondary panels (detail, toolbars)
  └─ dialogs
```

| Primitive | Role |
|-----------|------|
| `ListPage` | Shell = PageBody + PageHeader + error slot |
| `AdminDataGrid` | mo `ServerDataGrid` — Paper, bold headers, pagination |
| `FilterSelect` / `SearchField` | Filters **inside** PageHeader children |
| `ConfirmDialog` | Deletes / destructive confirms |

**Do not:**

- Build list screens with raw `<Table>` / ad-hoc card lists for the primary data set
- Put filters outside `PageHeader` / `ListPage` filters slot
- Skip `ListPage` for a new route that is “rows in a grid”

**Reference:** `mohiguide/mo-webadmin-next` — `PageHeader` + `ServerDataGrid` (e.g. `CommentsPage`, `TasksPage`).

### Non-list screens

Settings / onboarding / free-form report UI may use `PageBody` + `PageHeader` without a grid.

### Settings repos

Each repo row is **Name → Base source → Location → Base branch**. Switching to Local checkout clears Location. Branch options come from `POST /api/git/branches`; the folder icon calls `POST /api/git/choose-folder` (macOS Finder). Do not put a free-text placeholder inside the Base branch select (it overlaps the label).

### Defect evidence

Thumbs stay in the defect dialog. Full-size browse is `EvidenceGallery` (modal only).

### Tests page

`/tests` is a `ListPage` with **Runs** and **Plans** tabs (`?tab=plans`). `?run=<TRUN-id>` opens the run drawer; `?plan=<TPLAN-id>` opens the plan dialog; `?tab=plans&history=<TPLAN-id>` opens that plan's history dialog. Step screenshots are uploaded while a run is `in_progress`, multipart field `file`, to `POST /api/test-runs/{id}/steps/{key}/evidence`. Paste applies to the step marked as the paste target. Test accounts are label, username, environment, and `secret_ref` only — never add a password field.

**File defect.** On a `fail` or `blocked` step with no `defect_id`, every run status except `abandoned` shows **File defect** (including after review). The dialog shows the step action, expected, actual, how many screenshots will be copied, and the run title, then title (prefilled from the step action, cut to 200 UTF-8 bytes; a blank title is omitted and the server uses the step action shortened to 80 characters), severity P1–P3 (default P2), repo checkboxes from the app (ticked repos are the run's `refs` when those names are on the app, otherwise every app repo), and an optional note. Each **File defect** button is named with its step position and action. `reporter` is the operator name when one is set, and is omitted otherwise. Submit is `POST /api/test-runs/{id}/steps/{key}/file-defect` on the run write chain. The drawer then shows the returned run. Server error text is shown verbatim in the dialog.

**Defect chips.** A step with `defect_id` shows `<id> · <status label>` coloured with `defectStatusColor`, linking to `/?id=<DEF-id>`. When `defect_status` is null the chip reads `<id> · deleted`, uses the default colour, and is not a link. History rows use the same chip for each linked defect. On the defect dialog, a `related` value matching `TRUN-…/steps/<key>` adds a **Found by test run** line linking to `/tests?run=<TRUN-id>` plus the step key.

**History.** Each plans row (named with the plan title) and a control under the plan dialog title open the history dialog (`maxWidth="lg"`). Changing the runs count drops the matrix until that request returns. It loads `GET /api/test-plans/{id}/grid?runs=N` for N in 5, 10, or 20 (default 10) and lays current steps against those reviewed runs, newest first. The matrix scrolls horizontally inside the dialog. A column header shows the relative reviewed time and a short run id; its tooltip has the title, reviewer, plan version, and refs; activating it opens that run (`/tests?run=…`). Cells are a status chip plus a review marker (✓ Accepted / ✕ Disputed), or `—` when that run has no such step. A **Needs retest** chip marks a step the grid flags. With no reviewed runs the dialog says "No reviewed runs yet — only reviewed runs appear here." The plans list has no needs-retest count and does not request one per row.

**Export.** Each plans row has **Export**, named with the plan title (or its key), including when the plan is archived. It links to `GET /api/test-plans/{id}/export` and downloads the server's `dd-test-plan/1` file under the filename the server sends. The console never renders the Markdown itself.

**Agent jobs.** Start run has an Execute choice: Manual (default) or Agent job. Manual still posts `execute:"manual"` and `executor:"operator"`. Agent job posts `execute:"agent"` and does not send `executor`; `executed_by` is the operator name when one is set. Per-repo refs stay. On an agent job an empty ref means that repo's saved base (the repo entry's `base_branch`, otherwise the app `base_branch`), shown as the field placeholder, and only a typed ref is sent. With Agent job and an account selected, `secret_ref` `env:NAME` says Defect Drainer reads the password from `$NAME` in its own environment; any other `secret_ref` warns that no password will be available and steps that need one will be blocked. No account adds no line. There is never a password field. The caption under Agent job is "Runs on the simulator in its own worktree; results come back for your review." A 201 opens the run drawer. A 400 stays in the dialog and shows the server `error` verbatim.

A run with `executor:"dd-job"` shows an **Agent job** chip beside the title in the runs list (no extra column or request) and in the drawer header, plus **Open job** to `/jobs?job=<job_id>`. A ref with `sha` renders as `repo@ref` and the first 7 characters of the sha. While the run is `queued` or `in_progress`, the drawer polls the run and `GET /api/batch-jobs/<job_id>` every 3s. Both drop a response when a newer read or a run write has started. The job is live when its status is `queued` or `running`. Until that poll returns, the drawer treats the job as live. While live, step result and actual edits, screenshot upload and paste, Add step, Finish, Abandon, and Delete are disabled, with one info alert: "Being executed by job <jobId>. Stop the job to edit this run by hand." The job id links to `/jobs?job=<job_id>`. A 404 counts as not live. When the job is not live, the usual controls return, and Abandon is also offered for a `queued` run. A 409 from a race is shown verbatim on the drawer's error alert.

**Jobs page.** A job with `kind:"test_run"` shows its `testRunId` where the batch id would be, with a **test run** chip. The list search matches `testRunId` as well as the job id, batch id, and defect ids. The drawer titles that job with the run id and has a line "Test run <TRUN-id>" with **Open run** to `/tests?run=<TRUN-id>`. Create PR / Merge, refresh PRs, ship preview, and the defects panel (the overview defects list and the Evidence tab) are hidden. Log, worktrees, agent run, diff hygiene, Stop, Resume, Re-run, and Delete stay. Fix jobs are unchanged. `batchId` and `defect_ids` are absent on a test job and are optional on the job type.
