import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  resolveInitialColorMode,
  setStoredColorMode,
  type ColorMode,
} from './themeMode';

type ColorModeContextValue = {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
  toggleMode: () => void;
};

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

const sharedTypography = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  h4: { fontWeight: 700, letterSpacing: 0 },
  h6: { letterSpacing: 0 },
  button: { textTransform: 'none' as const, fontWeight: 700 },
};

const sharedComponents = {
  MuiButton: {
    defaultProps: { disableElevation: true },
  },
  MuiPaper: {
    styleOverrides: {
      root: { backgroundImage: 'none' },
    },
  },
};

function buildTheme(mode: ColorMode) {
  if (mode === 'light') {
    // Light tokens aligned with mo-webadmin-next
    return createTheme({
      palette: {
        mode: 'light',
        primary: { main: '#1f6f78' },
        secondary: { main: '#935f2d' },
        background: {
          default: '#f5f7fb',
          paper: '#ffffff',
        },
      },
      shape: { borderRadius: 8 },
      typography: sharedTypography,
      components: sharedComponents,
    });
  }
  return createTheme({
    palette: {
      mode: 'dark',
      primary: { main: '#6ea8fe' },
      background: { default: '#0f1115', paper: '#171a21' },
    },
    shape: { borderRadius: 8 },
    typography: sharedTypography,
    components: sharedComponents,
  });
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(() =>
    resolveInitialColorMode(),
  );

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    setStoredColorMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ColorMode = prev === 'dark' ? 'light' : 'dark';
      setStoredColorMode(next);
      return next;
    });
  }, []);

  const theme = useMemo(() => buildTheme(mode), [mode]);

  const value = useMemo(
    () => ({ mode, setMode, toggleMode }),
    [mode, setMode, toggleMode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode outside ColorModeProvider');
  return ctx;
}
