/** Persist UI color mode (light | dark). */

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'defect-drainer.colorMode';

export function getStoredColorMode(): ColorMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim().toLowerCase();
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function setStoredColorMode(mode: ColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Prefer stored; else system preference; else dark (legacy default). */
export function resolveInitialColorMode(): ColorMode {
  const stored = getStoredColorMode();
  if (stored) return stored;
  try {
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {
    /* ignore */
  }
  return 'dark';
}
