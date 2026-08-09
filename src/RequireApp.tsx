import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppContext } from './AppContext';
import { LoadingState } from './components/LoadingState';
import Box from '@mui/material/Box';

/** Operation routes: require onboarding app selection first. */
export function RequireApp() {
  const { ready, appId } = useAppContext();
  const location = useLocation();

  if (!ready) {
    return (
      <Box sx={{ py: 8 }}>
        <LoadingState />
      </Box>
    );
  }

  if (!appId) {
    return (
      <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}
