import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type FileDefectResponse, type TestPlan, type TestRun } from '../../api';
import { getOperatorName } from '../../operator';
import { absoluteLocal, relativeTime } from '../../relativeTime';
import { compactChipSx, runStatusColor, runStatusLabel } from '../../testStatus';
import { errorMessage, jsonRequest } from './format';
import { FileDefectDialog, type FileDefectBody } from './FileDefectDialog';
import { useRunWrites } from './useRunWrites';
import { RunActions, RunConfirmDialogs } from './RunActions';
import { RunDetail } from './RunDetail';
import { SaveAsPlanDialog } from './SaveAsPlanDialog';

type ReviewChoice = '' | 'accepted' | 'disputed';
type ReviewDraft = Record<string, { review: ReviewChoice; note: string }>;
type ConfirmKind = 'finish' | 'abandon' | 'delete' | null;

export function RunDrawer({
  runId,
  seed,
  plans,
  onClose,
  onChanged,
  onNotice,
}: {
  runId: string | null;
  seed: TestRun | null;
  plans: TestPlan[];
  onClose: () => void;
  onChanged: () => void;
  onNotice: (message: string) => void;
}) {
  const [run, setRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pollError, setPollError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteTarget, setPasteTarget] = useState<string | null>(null);
  const [openViewers, setOpenViewers] = useState<Set<string>>(() => new Set());
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [deleteEvidence, setDeleteEvidence] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addAction, setAddAction] = useState('');
  const [addExpected, setAddExpected] = useState('');
  const [addSection, setAddSection] = useState('');
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const [fileStepKey, setFileStepKey] = useState<string | null>(null);
  const fileGen = useRef(0);
  const fileGenKey = useRef(`${runId ?? ''}::${fileStepKey ?? ''}`);
  const nextFileGenKey = `${runId ?? ''}::${fileStepKey ?? ''}`;
  if (fileGenKey.current !== nextFileGenKey) {
    fileGenKey.current = nextFileGenKey;
    fileGen.current += 1;
  }
  const [now, setNow] = useState(() => Date.now());
  const readToken = useRef(0);
  const busyEpoch = useRef(0);
  const writeTail = useRef<Promise<void>>(Promise.resolve());
  const runIdRef = useRef<string | null>(runId);
  const runStateRef = useRef<TestRun | null>(null);
  const busyRef = useRef(false);
  const draftRun = useRef<string | null>(null);
  runStateRef.current = run;

  const applyViewer = useCallback((key: string, open: boolean) => {
    setOpenViewers((prev) => {
      const has = prev.has(key);
      if (open === has) return prev;
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  useEffect(() => {
    runIdRef.current = runId;
    const token = ++readToken.current;
    // Drop in-flight writes for the previous run. Their finally must not clear busy here.
    busyEpoch.current += 1;
    busyRef.current = false;
    setBusy(false);
    writeTail.current = Promise.resolve();
    setPasteTarget(null);
    setOpenViewers(new Set());
    setActionError('');
    setPollError('');
    setInfoMessage('');
    setConfirm(null);
    setAddOpen(false);
    setSaveOpen(false);
    setFileStepKey(null);
    draftRun.current = null;
    if (!runId) {
      setRun(null);
      setLoading(false);
      setLoadError('');
      return;
    }
    if (seed?.id === runId) {
      setRun(seed);
      setLoading(false);
      setLoadError('');
      return;
    }
    setLoading(true);
    setRun(null);
    void (async () => {
      try {
        const res = await api<{ run: TestRun }>(
          `/api/test-runs/${encodeURIComponent(runId)}`,
        );
        if (runIdRef.current !== runId || readToken.current !== token) return;
        runStateRef.current = res.run;
        setRun(res.run);
        setLoadError('');
        setPollError('');
      } catch (e) {
        if (runIdRef.current !== runId || readToken.current !== token) return;
        setLoadError(errorMessage(e));
      } finally {
        if (runIdRef.current === runId && readToken.current === token) setLoading(false);
      }
    })();
  }, [runId, seed]);

  const refresh = useCallback(async (id: string) => {
    if (busyRef.current) return;
    const token = ++readToken.current;
    try {
      const res = await api<{ run: TestRun }>(
        `/api/test-runs/${encodeURIComponent(id)}`,
      );
      if (runIdRef.current !== id || readToken.current !== token || busyRef.current) return;
      runStateRef.current = res.run;
      setRun(res.run);
      setPollError('');
    } catch (e) {
      if (runIdRef.current !== id || readToken.current !== token) return;
      setPollError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!runId || run?.id !== runId || run.status !== 'in_progress') return;
    const timer = window.setInterval(() => void refresh(runId), 3000);
    return () => window.clearInterval(timer);
  }, [runId, run?.id, run?.status, refresh]);

  useEffect(() => {
    if (!runId) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [runId]);

  useEffect(() => {
    if (!run || run.status !== 'awaiting_review') return;
    if (draftRun.current === run.id) return;
    draftRun.current = run.id;
    const next: ReviewDraft = {};
    for (const step of run.steps ?? []) {
      next[step.key] = {
        review: step.review === 'accepted' || step.review === 'disputed' ? step.review : '',
        note: step.review_note || '',
      };
    }
    setReviewDraft(next);
  }, [run]);

  const { enqueue, writeRun, upload } = useRunWrites(
    { runIdRef, runStateRef, busyEpoch, readToken, busyRef, writeTail },
    setBusy,
    setActionError,
    setPollError,
    setRun,
    onChanged,
  );

  useEffect(() => {
    if (!runId || run?.status !== 'in_progress') return;
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (!files.length) return;
      event.preventDefault();
      if (!pasteTarget) {
        setActionError('Click a step before pasting screenshots.');
        return;
      }
      if (!runId) return;
      void upload(runId, pasteTarget, files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pasteTarget, run?.status, runId, upload]);

  async function patchStep(key: string, body: { status?: string; actual?: string }) {
    if (!runId) return false;
    try {
      await writeRun(runId, () =>
        api<{ run: TestRun }>(
          `/api/test-runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(key)}`,
          jsonRequest('PATCH', body),
        ).then((res) => res.run),
      );
      return true;
    } catch {
      return false;
    }
  }

  async function addStep(event: React.FormEvent) {
    event.preventDefault();
    if (!runId || !addAction.trim()) {
      setActionError('An exploratory step needs an action.');
      return;
    }
    let next: TestRun | null = null;
    try {
      next = await writeRun(runId, () =>
        api<{ run: TestRun }>(
          `/api/test-runs/${encodeURIComponent(runId)}/steps`,
          jsonRequest('POST', {
            action: addAction.trim(),
            expected: addExpected.trim(),
            section: addSection.trim(),
          }),
        ).then((res) => res.run),
      );
    } catch {
      return;
    }
    if (!next) return;
    setAddAction('');
    setAddExpected('');
    setAddSection('');
    setAddOpen(false);
  }

  async function finish() {
    if (!runId) return;
    setConfirm(null);
    try {
      await writeRun(runId, () =>
        api<{ run: TestRun }>(
          `/api/test-runs/${encodeURIComponent(runId)}/finish`,
          jsonRequest('POST', {}),
        ).then((res) => res.run),
      );
    } catch {
      /* actionError already set */
    }
  }

  async function abandon() {
    if (!runId) return;
    setConfirm(null);
    try {
      await writeRun(runId, () =>
        api<{ run: TestRun }>(
          `/api/test-runs/${encodeURIComponent(runId)}/abandon`,
          jsonRequest('POST', {}),
        ).then((res) => res.run),
      );
    } catch {
      /* actionError already set */
    }
  }

  async function remove() {
    if (!runId) return;
    const id = runId;
    const wipe = deleteEvidence;
    setConfirm(null);
    try {
      await enqueue(id, async () => {
        const query = wipe ? '?evidence=1' : '';
        await api(`/api/test-runs/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
        return true;
      });
      onChanged();
      if (runIdRef.current !== id) return;
      onNotice(
        wipe
          ? 'Deleted the run and its screenshots.'
          : 'Deleted the run. Screenshots were kept.',
      );
      onClose();
    } catch {
      /* actionError already set when this write is still the latest */
    }
  }

  async function fileDefect(body: FileDefectBody) {
    if (!runId || !fileStepKey) throw new Error('Run is closed');
    const id = runId;
    const key = fileStepKey;
    const next = await writeRun(id, () =>
      api<FileDefectResponse>(
        `/api/test-runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(key)}/file-defect`,
        jsonRequest('POST', body),
      ).then((res) => res.run),
    );
    if (!next) throw new Error('Run changed');
  }

  async function submitReview() {
    if (!run || !runId) return;
    const reviewer = getOperatorName().trim();
    if (!reviewer) return;
    const reviewable = (run.steps ?? []).filter((step) => step.status !== 'pending');
    if (
      reviewable.some((step) => {
        const choice = reviewDraft[step.key]?.review;
        return choice !== 'accepted' && choice !== 'disputed';
      })
    ) {
      setActionError('Choose accepted or disputed for every step that is not pending.');
      return;
    }
    try {
      await writeRun(runId, () =>
        api<{ run: TestRun }>(
          `/api/test-runs/${encodeURIComponent(runId)}/review`,
          jsonRequest('POST', {
            reviewer,
            steps: reviewable.map((step) => ({
              key: step.key,
              review: reviewDraft[step.key]?.review,
              note: (reviewDraft[step.key]?.note ?? '').trim(),
            })),
          }),
        ).then((res) => res.run),
      );
    } catch {
      /* actionError already set */
    }
  }

  const status = run?.status ?? '';
  const mode = status === 'in_progress' ? 'edit' : status === 'awaiting_review' ? 'review' : 'readonly';
  const fileStep = fileStepKey
    ? (run?.steps ?? []).find((step) => step.key === fileStepKey) ?? null
    : null;
  const operator = getOperatorName().trim();
  const source = run?.plan_id ? plans.find((plan) => plan.id === run.plan_id) : undefined;
  const steps = run?.steps ?? [];

  return (
    <>
      <Drawer
        anchor="right"
        open={Boolean(runId)}
        onClose={onClose}
        disableEscapeKeyDown={openViewers.size > 0}
        slotProps={{
          paper: {
            sx: {
              width: 'min(760px, 100%)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {run?.title || (loading ? 'Loading…' : 'Run')}
            </Typography>
            <Tooltip title="Close">
              <IconButton aria-label="Close" onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>
          {run ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 0.75 }}>
              <Chip size="small" label={runStatusLabel(run.status)} color={runStatusColor(run.status)} sx={compactChipSx} />
              <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {run.id}
              </Typography>
              {run.started_at ? (
                <Typography variant="caption" color="text.secondary" title={absoluteLocal(run.started_at)}>
                  started {relativeTime(run.started_at, now)}
                </Typography>
              ) : null}
              {run.reviewed_by ? (
                <Typography variant="caption" color="text.secondary">
                  reviewed by {run.reviewed_by}
                  {run.reviewed_at ? ` ${relativeTime(run.reviewed_at, now)}` : ''}
                </Typography>
              ) : null}
            </Stack>
          ) : null}
        </Box>
        {run ? (
          <RunActions
            status={run.status}
            busy={busy}
            operatorMissing={!operator}
            onAdd={() => setAddOpen(true)}
            onFinish={() => setConfirm('finish')}
            onAbandon={() => setConfirm('abandon')}
            onReview={() => void submitReview()}
            onAcceptAll={() => {
              setReviewDraft((prev) => {
                const next = { ...prev };
                for (const step of steps) {
                  if (step.status === 'pending') continue;
                  next[step.key] = { review: 'accepted', note: next[step.key]?.note ?? '' };
                }
                return next;
              });
            }}
            onSave={() => setSaveOpen(true)}
            onDelete={() => {
              setDeleteEvidence(true);
              setConfirm('delete');
            }}
          />
        ) : null}
        <RunDetail
          loading={loading}
          loadError={loadError}
          missing={!loading && Boolean(runId) && !run && !loadError}
          run={run}
          mode={mode}
          actionError={actionError}
          pollError={pollError}
          infoMessage={infoMessage}
          operatorMissing={!operator}
          pasteTarget={pasteTarget}
          busy={busy}
          reviewDraft={reviewDraft}
          addOpen={addOpen}
          addAction={addAction}
          addExpected={addExpected}
          addSection={addSection}
          onAddAction={setAddAction}
          onAddExpected={setAddExpected}
          onAddSection={setAddSection}
          onAddSubmit={(event) => void addStep(event)}
          onAddCancel={() => setAddOpen(false)}
          onActivate={(step) => {
            if (mode === 'edit') setPasteTarget(step.key);
          }}
          onStatus={(key, value) => void patchStep(key, { status: value })}
          onActual={(key, actual) => patchStep(key, { actual })}
          onFiles={(key, files) => {
            if (runId) void upload(runId, key, files);
          }}
          onReview={(key, review) =>
            setReviewDraft((prev) => ({
              ...prev,
              [key]: { review, note: prev[key]?.note ?? '' },
            }))
          }
          onReviewNote={(key, note) =>
            setReviewDraft((prev) => ({
              ...prev,
              [key]: { review: prev[key]?.review ?? '', note },
            }))
          }
          onViewerChange={applyViewer}
          onFileDefect={(step) => setFileStepKey(step.key)}
        />
      </Drawer>
      <RunConfirmDialogs
        confirm={confirm}
        deleteEvidence={deleteEvidence}
        onDeleteEvidence={setDeleteEvidence}
        onFinish={() => void finish()}
        onAbandon={() => void abandon()}
        onDelete={() => void remove()}
        onCancel={() => setConfirm(null)}
        confirmDisabled={busy}
      />
      <SaveAsPlanDialog
        open={saveOpen}
        run={run}
        sourceArchived={Boolean(source?.archived)}
        perform={(exec) => {
          if (!runId) return Promise.reject(new Error('Run is closed'));
          return enqueue(runId, exec).then((value) => {
            if (value == null) throw new Error('Run changed');
            return value;
          });
        }}
        onClose={() => setSaveOpen(false)}
        onDone={(message) => {
          setSaveOpen(false);
          setActionError('');
          setInfoMessage(message);
          onChanged();
        }}
      />
      {run && fileStep ? (
        <FileDefectDialog
          key={`${run.id}:${fileStep.key}`}
          open
          run={run}
          step={fileStep}
          busy={busy}
          generation={fileGen}
          onClose={() => setFileStepKey(null)}
          onSubmit={fileDefect}
        />
      ) : null}
    </>
  );
}
