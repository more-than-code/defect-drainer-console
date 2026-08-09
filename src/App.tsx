import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from './AppContext';
import { Layout } from './Layout';
import { RequireApp } from './RequireApp';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DefectsPage } from './pages/DefectsPage';
import { JobsPage } from './pages/JobsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route element={<RequireApp />}>
              <Route index element={<DefectsPage />} />
              <Route path="defects" element={<Navigate to="/" replace />} />
              <Route path="report" element={<Navigate to="/" replace />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
