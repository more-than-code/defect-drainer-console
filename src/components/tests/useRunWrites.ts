import { useCallback, type MutableRefObject } from 'react';
import { api, type TestRun } from '../../api';
import { errorMessage, evidenceFileName, isImageFile } from './format';

type WriteRefs = {
  runIdRef: MutableRefObject<string | null>;
  runStateRef: MutableRefObject<TestRun | null>;
  busyEpoch: MutableRefObject<number>;
  readToken: MutableRefObject<number>;
  busyRef: MutableRefObject<boolean>;
  writeTail: MutableRefObject<Promise<void>>;
};

/** One in-flight chain. setRun and busy clear only for the latest write. */
export function useRunWrites(
  refs: WriteRefs,
  setBusy: (busy: boolean) => void,
  setActionError: (message: string) => void,
  setPollError: (message: string) => void,
  setRun: (run: TestRun) => void,
  onChanged: () => void,
) {
  const enqueue = useCallback(
    <T,>(id: string, exec: () => Promise<T>, apply?: (value: T) => void): Promise<T | null> => {
      const token = ++refs.busyEpoch.current;
      // A GET that started before this write must not paint over its result.
      refs.readToken.current += 1;
      refs.busyRef.current = true;
      setBusy(true);
      setActionError('');
      const task = refs.writeTail.current.then(async () => {
        if (refs.runIdRef.current !== id) return null;
        try {
          const value = await exec();
          // A superseded write must not look applied. Callers treat null as "not this run".
          if (refs.runIdRef.current !== id || refs.busyEpoch.current !== token) return null;
          apply?.(value);
          setPollError('');
          return value;
        } catch (e) {
          if (refs.runIdRef.current === id && refs.busyEpoch.current === token) {
            setActionError(errorMessage(e));
          }
          throw e;
        } finally {
          if (refs.busyEpoch.current === token) {
            refs.busyRef.current = false;
            setBusy(false);
          }
        }
      });
      refs.writeTail.current = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    [refs, setActionError, setBusy, setPollError],
  );

  const applyRun = useCallback(
    (next: TestRun) => {
      refs.runStateRef.current = next;
      setRun(next);
      onChanged();
    },
    [onChanged, refs, setRun],
  );

  const writeRun = useCallback(
    (id: string, exec: () => Promise<TestRun>) => enqueue(id, exec, applyRun),
    [applyRun, enqueue],
  );

  const upload = useCallback(
    async (runId: string, key: string, files: File[]) => {
      const images = files.filter(isImageFile);
      if (!images.length) {
        setActionError('No images to upload.');
        return;
      }
      const batch = images.slice(0, 12);
      const fd = new FormData();
      batch.forEach((file, index) => fd.append('file', file, evidenceFileName(index, file)));
      let before = 0;
      let after = 0;
      try {
        const next = await writeRun(runId, async () => {
          before =
            refs.runStateRef.current?.steps?.find((step) => step.key === key)?.evidence.length ??
            0;
          const res = await api<{ run: TestRun }>(
            `/api/test-runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(key)}/evidence`,
            { method: 'POST', body: fd },
          );
          after = res.run.steps?.find((step) => step.key === key)?.evidence.length ?? 0;
          return res.run;
        });
        if (!next) return;
        if (images.length > 12) {
          setActionError('Only the first 12 images were uploaded.');
        } else if (after === before) {
          setActionError(
            'No screenshots were stored. Use png, jpg, webp, gif, or heic, up to 12 files.',
          );
        }
      } catch {
        /* actionError already set */
      }
    },
    [refs, setActionError, writeRun],
  );

  return { enqueue, writeRun, upload };
}
