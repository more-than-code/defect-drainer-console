import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { useAppContext } from './AppContext';
import { useColorMode } from './ColorModeContext';

const nav = [
  { to: '/', label: 'Defects' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { pathname } = useLocation();
  const { app, appId } = useAppContext();
  const { mode, toggleMode } = useColorMode();
  const onboarding = pathname.startsWith('/onboarding');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 1, fontWeight: 700 }}>
            Defect Drainer
          </Typography>
          {!onboarding &&
            nav.map((item) => {
              const active =
                item.to === '/'
                  ? pathname === '/'
                  : pathname.startsWith(item.to);
              return (
                <Button
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  color={active ? 'primary' : 'inherit'}
                  variant={active ? 'contained' : 'text'}
                  size="small"
                >
                  {item.label}
                </Button>
              );
            })}
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip
            title={
              mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
            }
          >
            <IconButton
              size="small"
              color="inherit"
              onClick={toggleMode}
              aria-label={
                mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
            >
              {mode === 'dark' ? (
                <LightModeOutlinedIcon fontSize="small" />
              ) : (
                <DarkModeOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          {appId && app ? (
            <Chip
              size="small"
              label={app.name}
              title={app.id}
              component={RouterLink}
              to="/onboarding"
              clickable
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600 }}
            />
          ) : null}
          {appId ? (
            <Button
              component={RouterLink}
              to="/onboarding"
              size="small"
              color="inherit"
            >
              Switch app
            </Button>
          ) : null}
        </Toolbar>
      </AppBar>
      <Outlet />
    </Box>
  );
}
