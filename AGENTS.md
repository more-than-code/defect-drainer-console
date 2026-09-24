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

`/tests` is a `ListPage` with **Runs** and **Plans** tabs (`?tab=plans`). `?run=<TRUN-id>` opens the run drawer; `?plan=<TPLAN-id>` opens the plan dialog. Step screenshots are uploaded while a run is `in_progress`, multipart field `file`, to `POST /api/test-runs/{id}/steps/{key}/evidence`. Paste applies to the step marked as the paste target. Test accounts are label, username, environment, and `secret_ref` only — never add a password field.
