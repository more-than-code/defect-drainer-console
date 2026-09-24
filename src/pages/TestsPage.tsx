import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import useMediaQuery from '@mui/material/useMediaQuery';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type TestPlan, type TestRun } from '../api';
import { useAppContext } from '../AppContext';
import { AdminDataGrid } from '../components/AdminDataGrid';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilterSelect } from '../components/FilterSelect';
import { ListPage } from '../components/ListPage';
import { PlanDialog } from '../components/tests/PlanDialog';
import { RunDrawer } from '../components/tests/RunDrawer';
import { StartRunDialog } from '../components/tests/StartRunDialog';
import { planColumns, runColumns } from '../components/tests/testColumns';
import { errorMessage } from '../components/tests/format';
import { runStatusLabel, runStatusOptions } from '../testStatus';

const EXPLORATORY = '__exploratory__';

export function TestsPage() {
  const { appId } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{
    text: string;
    severity: 'info' | 'error';
  } | null>(null);
  const [status, setStatus] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [startPlanId, setStartPlanId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [seed, setSeed] = useState<TestRun | null>(null);
  const [removePlan, setRemovePlan] = useState<TestPlan | null>(null);
  const [removing, setRemoving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const seenApp = useRef<string | null>(null);
  const appNow = useRef(appId);
  const listToken = useRef(0);
  appNow.current = appId;
  const narrow = useMediaQuery('(max-width:600px)');

  const tab = searchParams.get('tab') === 'plans' ? 'plans' : 'runs';
  const runParam = searchParams.get('run');
  const planParam = searchParams.get('plan');

  const refresh = useCallback(async () => {
    const requested = appNow.current;
    if (!requested) return;
    const token = ++listToken.current;
    const current = () => appNow.current === requested && listToken.current === token;
    try {
      const [planRes, runRes] = await Promise.all([
        api<{ plans: TestPlan[] }>(
          `/api/test-plans?app_id=${encodeURIComponent(requested)}&include_archived=1`,
        ),
        api<{ runs: TestRun[] }>(
          `/api/test-runs?app_id=${encodeURIComponent(requested)}`,
        ),
      ]);
      if (!current()) return;
      setPlans(planRes.plans ?? []);
      setRuns(runRes.runs ?? []);
      setError('');
    } catch (e) {
      if (!current()) return;
      setError(errorMessage(e));
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [appId, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!appId) return;
    if (seenApp.current === null) {
      seenApp.current = appId;
      return;
    }
    if (seenApp.current === appId) return;
    seenApp.current = appId;
    setSeed(null);
    setCreateOpen(false);
    setStartOpen(false);
    setStartPlanId(null);
    setStatus('all');
    setPlanFilter('all');
    setShowArchived(false);
    setNotice(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('run');
        next.delete('plan');
        return next;
      },
      { replace: true },
    );
  }, [appId, setSearchParams]);

  function setTab(next: 'runs' | 'plans') {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'plans') params.set('tab', 'plans');
        else params.delete('tab');
        return params;
      },
      { replace: true },
    );
  }

  function openRun(id: string, known?: TestRun | null) {
    setSeed(known ?? null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('run', id);
        return params;
      },
      { replace: true },
    );
  }

  function closeRun() {
    setSeed(null);
    setSearchParams(
      (prev) => {
        if (!prev.get('run')) return prev;
        const params = new URLSearchParams(prev);
        params.delete('run');
        return params;
      },
      { replace: true },
    );
  }

  function openEdit(id: string) {
    setCreateOpen(false);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('plan', id);
        params.set('tab', 'plans');
        return params;
      },
      { replace: true },
    );
  }

  function openCreate() {
    setCreateOpen(true);
    setSearchParams(
      (prev) => {
        if (!prev.get('plan')) return prev;
        const params = new URLSearchParams(prev);
        params.delete('plan');
        return params;
      },
      { replace: true },
    );
  }

  function closePlan() {
    setCreateOpen(false);
    setSearchParams(
      (prev) => {
        if (!prev.get('plan')) return prev;
        const params = new URLSearchParams(prev);
        params.delete('plan');
        return params;
      },
      { replace: true },
    );
  }

  const planById = useMemo(() => {
    const map = new Map<string, TestPlan>();
    for (const plan of plans) map.set(plan.id, plan);
    return map;
  }, [plans]);

  const statusOptions = useMemo(() => {
    const known = runStatusOptions();
    const seen = new Set(known.map((option) => option.value));
    const extra: Array<{ value: string; label: string }> = [];
    for (const run of runs) {
      if (!run.status || seen.has(run.status)) continue;
      seen.add(run.status);
      extra.push({ value: run.status, label: runStatusLabel(run.status) });
    }
    return [...known, ...extra];
  }, [runs]);

  const planOptions = useMemo(
    () => [
      { value: EXPLORATORY, label: 'Exploratory' },
      ...plans.map((plan) => ({
        value: plan.id,
        label: plan.archived ? `${plan.title} (archived)` : plan.title,
      })),
    ],
    [plans],
  );

  const filteredRuns = useMemo(
    () =>
      runs.filter((run) => {
        if (status !== 'all' && run.status !== status) return false;
        if (planFilter === EXPLORATORY) return !run.plan_id;
        if (planFilter !== 'all' && run.plan_id !== planFilter) return false;
        return true;
      }),
    [runs, status, planFilter],
  );

  const filteredPlans = useMemo(
    () => plans.filter((plan) => showArchived || !plan.archived),
    [plans, showArchived],
  );

  const runCols = useMemo(
    () => runColumns({ now, planById, narrow, onOpen: (id) => openRun(id) }),
    // openRun closes over the latest setter; identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, planById, narrow],
  );

  const planCols = useMemo(
    () =>
      planColumns({
        now,
        narrow,
        onStart: (plan) => {
          setStartPlanId(plan.id);
          setStartOpen(true);
        },
        onEdit: (plan) => openEdit(plan.id),
        onRemove: (plan) => setRemovePlan(plan),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, narrow],
  );

  async function confirmRemove() {
    if (!removePlan || removing) return;
    setRemoving(true);
    try {
      const res = await api<{ archived?: boolean; deleted?: boolean }>(
        `/api/test-plans/${encodeURIComponent(removePlan.id)}`,
        { method: 'DELETE' },
      );
      const name = removePlan.title || removePlan.key;
      setNotice({
        severity: 'info',
        text: res.archived
          ? `Archived “${name}”. A run still references it.`
          : res.deleted
            ? `Deleted “${name}”.`
            : `Removed “${name}”.`,
      });
      setRemovePlan(null);
      if (planParam === removePlan.id) closePlan();
      await refresh();
    } catch (e) {
      setNotice({ severity: 'error', text: errorMessage(e) });
      setRemovePlan(null);
    } finally {
      setRemoving(false);
    }
  }

  const shown = tab === 'runs' ? filteredRuns.length : filteredPlans.length;
  const noun = tab === 'runs' ? 'run' : 'plan';

  return (
    <ListPage
      title="Tests"
      totalLabel={`${shown} ${noun}${shown === 1 ? '' : 's'}`}
      primaryAction={
        tab === 'runs'
          ? {
              label: 'Start run',
              icon: <PlayArrowIcon />,
              onClick: () => {
                setStartPlanId(null);
                setStartOpen(true);
              },
            }
          : {
              label: 'New plan',
              icon: <AddIcon />,
              onClick: openCreate,
            }
      }
      description={
        <Tabs
          value={tab}
          onChange={(_event, value: 'runs' | 'plans') => setTab(value)}
          aria-label="Tests"
          sx={{ color: 'text.primary' }}
        >
          <Tab label="Runs" value="runs" />
          <Tab label="Plans" value="plans" />
        </Tabs>
      }
      filters={
        tab === 'runs' ? (
          <>
            <FilterSelect
              label="Status"
              value={status}
              allLabel="All"
              options={statusOptions}
              onChange={setStatus}
            />
            <FilterSelect
              label="Plan"
              value={planFilter}
              allLabel="All"
              options={planOptions}
              onChange={setPlanFilter}
              minWidth={220}
            />
          </>
        ) : (
          <FormControlLabel
            control={
              <Switch
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
            }
            label="Show archived"
          />
        )
      }
      error={error || null}
    >
      {notice ? (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.text}
        </Alert>
      ) : null}
      {tab === 'runs' ? (
        <AdminDataGrid
          aria-label="Test runs"
          rows={filteredRuns}
          columns={runCols}
          loading={loading}
          getRowId={(row) => row.id}
          density="compact"
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 56}
          scrollbarSize={0}
          onRowClick={(params) => openRun(params.row.id)}
          localeText={{ noRowsLabel: 'No test runs yet' }}
        />
      ) : (
        <AdminDataGrid
          aria-label="Test plans"
          rows={filteredPlans}
          columns={planCols}
          loading={loading}
          getRowId={(row) => row.id}
          density="compact"
          getRowHeight={() => 'auto'}
          getEstimatedRowHeight={() => 56}
          scrollbarSize={0}
          onRowClick={(params) => openEdit(params.row.id)}
          localeText={{ noRowsLabel: 'No test plans yet' }}
        />
      )}
      <StartRunDialog
        open={startOpen}
        plans={plans}
        initialPlanId={startPlanId}
        onClose={() => setStartOpen(false)}
        onCreated={(run) => {
          setStartOpen(false);
          setCreateOpen(false);
          setSeed(run);
          setNotice({ severity: 'info', text: `Started run “${run.title}”.` });
          setSearchParams(
            (prev) => {
              const params = new URLSearchParams(prev);
              params.set('run', run.id);
              params.delete('tab');
              params.delete('plan');
              return params;
            },
            { replace: true },
          );
          void refresh();
        }}
      />
      <PlanDialog
        open={Boolean(planParam) || createOpen}
        planId={planParam}
        onClose={closePlan}
        onSaved={(message) => {
          setNotice({ severity: 'info', text: message });
          closePlan();
          void refresh();
        }}
      />
      <RunDrawer
        runId={runParam}
        seed={seed?.id === runParam ? seed : null}
        plans={plans}
        onClose={closeRun}
        onChanged={() => void refresh()}
        onNotice={(message) => setNotice({ severity: 'info', text: message })}
      />
      <ConfirmDialog
        open={Boolean(removePlan)}
        title="Archive or delete this plan?"
        message={
          removePlan
            ? `Remove “${removePlan.title || removePlan.key}”? If a run still references it, the plan is archived. Otherwise it is deleted.`
            : ''
        }
        confirmLabel={removing ? 'Removing…' : removePlan?.archived ? 'Delete' : 'Archive'}
        cancelLabel="Cancel"
        onConfirm={() => void confirmRemove()}
        onCancel={() => {
          if (!removing) setRemovePlan(null);
        }}
      />
    </ListPage>
  );
}
