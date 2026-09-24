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
