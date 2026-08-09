import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppRecord } from './api';
import {
  clearStoredAppId,
  getStoredAppId,
  resolveActiveApp,
  setStoredAppId,
} from './selectedApp';

type AppContextValue = {
  ready: boolean;
  apps: AppRecord[];
  appId: string | null;
  app: AppRecord | null;
  selectApp: (id: string) => void;
  clearApp: () => void;
  refreshApps: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [appId, setAppId] = useState<string | null>(getStoredAppId());

  const refreshApps = useCallback(async () => {
    const r = await resolveActiveApp();
    setApps(r.apps);
    if (r.appId) {
      setAppId(r.appId);
      setStoredAppId(r.appId);
    } else if (getStoredAppId() && !r.app) {
      // stored id no longer valid
      clearStoredAppId();
      setAppId(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refreshApps();
      } catch {
        /* offline — still allow onboarding UI */
      } finally {
        setReady(true);
      }
    })();
  }, [refreshApps]);

  const app = useMemo(
    () => apps.find((a) => a.id === appId) ?? null,
    [apps, appId],
  );

  const selectApp = useCallback((id: string) => {
    setStoredAppId(id);
    setAppId(id);
  }, []);

  const clearApp = useCallback(() => {
    clearStoredAppId();
    setAppId(null);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      apps,
      appId,
      app,
      selectApp,
      clearApp,
      refreshApps,
    }),
    [ready, apps, appId, app, selectApp, clearApp, refreshApps],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext outside AppProvider');
  return ctx;
}
