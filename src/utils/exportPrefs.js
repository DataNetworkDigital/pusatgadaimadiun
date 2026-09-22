// Remembers which export columns the owner ticked, per device. Storage can be
// missing or throw (private mode, storage disabled), so every access is guarded
// and simply falls back to the defaults.
const KEY_PREFIX = 'pgm.exportCols.';

export function loadColumnKeys(kind, fallback) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + kind);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const keys = parsed.filter((k) => typeof k === 'string');
    return keys.length ? keys : fallback;
  } catch {
    return fallback;
  }
}

export function saveColumnKeys(kind, keys) {
  try {
    localStorage.setItem(KEY_PREFIX + kind, JSON.stringify(keys));
  } catch {
    // Nothing to do: the picker still works for this session.
  }
}
