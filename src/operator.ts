/**
 * Operator identity for the `reporter` field on filed defects.
 *
 * Browser-local and self-declared — there is no auth on the backend yet, so this
 * is provenance, not proof. When auth lands the server should set `reporter` from
 * the session and ignore whatever the client sends.
 */

const STORAGE_KEY = 'defect-drainer.operatorName';

export function getOperatorName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setOperatorName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
