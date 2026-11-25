const DRAFT_KEY = 'rp_draft_entries_v1';
const SAVED_LISTS_KEY = 'rp_saved_lists_v1';
const PREFS_KEY = 'rp_preferences_v1';
const MAX_SAVED_LISTS = 30;
const MAX_ENTRIES_PER_LIST = 2500;

const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'dark',
  sound: true,
  animation: true,
  dedupeAuto: false,
  weights: true
});

let memoryStore = null;

function getStorageBackend() {
  try {
    const testKey = '__rp_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    if (!memoryStore) {
      memoryStore = new Map();
    }
    return {
      getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
      setItem: (k, v) => {
        memoryStore.set(k, v);
      },
      removeItem: (k) => {
        memoryStore.delete(k);
      }
    };
  }
}

function readJson(key, fallback) {
  try {
    const backend = getStorageBackend();
    const raw = backend.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    const backend = getStorageBackend();
    backend.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_ENTRIES_PER_LIST);
}

function generateListId(now) {
  let suffix = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    suffix = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6);
  } else {
    suffix = Math.random().toString(36).slice(2, 8);
  }
  return `lst_${now.toString(36)}_${suffix}`;
}

export function loadDraft() {
  const value = readJson(DRAFT_KEY, '');
  return typeof value === 'string' ? value : '';
}

export function saveDraft(text) {
  return writeJson(DRAFT_KEY, String(text ?? ''));
}

export function getSavedLists() {
  const parsed = readJson(SAVED_LISTS_KEY, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        typeof item.name === 'string' &&
        Array.isArray(item.entries)
    )
    .map((item) => ({
      id: item.id,
      name: item.name.trim() || 'Untitled Roster',
      entries: normalizeEntries(item.entries),
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now()
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_LISTS);
}

export function upsertSavedList({ id, name, entries }) {
  const lists = getSavedLists();
  const now = Date.now();
  const cleanName = String(name ?? '').trim() || 'Untitled Roster';
  const cleanEntries = normalizeEntries(entries);

  if (id) {
    const index = lists.findIndex((item) => item.id === id);
    if (index !== -1) {
      const updated = {
        ...lists[index],
        name: cleanName,
        entries: cleanEntries,
        updatedAt: now
      };
      lists[index] = updated;
      const sorted = lists.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_LISTS);
      writeJson(SAVED_LISTS_KEY, sorted);
      return updated;
    }
  }

  const created = {
    id: generateListId(now),
    name: cleanName,
    entries: cleanEntries,
    createdAt: now,
    updatedAt: now
  };

  const next = [created, ...lists].slice(0, MAX_SAVED_LISTS);
  writeJson(SAVED_LISTS_KEY, next);
  return created;
}

export function deleteSavedList(id) {
  if (!id || typeof id !== 'string') return getSavedLists();
  const next = getSavedLists().filter((item) => item.id !== id);
  writeJson(SAVED_LISTS_KEY, next);
  return next;
}

export function exportAllData() {
  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      draft: loadDraft(),
      rosters: getSavedLists()
    },
    null,
    2
  );
}

export function importAllData(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rosters)) {
    throw new Error('Invalid backup format');
  }
  const existing = getSavedLists();
  const mergedMap = new Map(existing.map((r) => [r.id, r]));

  for (const raw of parsed.rosters) {
    if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.entries)) continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : generateListId(Date.now());
    mergedMap.set(id, {
      id,
      name: raw.name.trim() || 'Imported Roster',
      entries: normalizeEntries(raw.entries),
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      updatedAt: Date.now()
    });
  }

  const merged = Array.from(mergedMap.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SAVED_LISTS);

  writeJson(SAVED_LISTS_KEY, merged);
  return merged.length;
}

export function loadPreferences() {
  const raw = readJson(PREFS_KEY, null);
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }

  return {
    theme: raw.theme === 'light' ? 'light' : 'dark',
    sound: typeof raw.sound === 'boolean' ? raw.sound : DEFAULT_PREFERENCES.sound,
    animation: typeof raw.animation === 'boolean' ? raw.animation : DEFAULT_PREFERENCES.animation,
    dedupeAuto: typeof raw.dedupeAuto === 'boolean' ? raw.dedupeAuto : DEFAULT_PREFERENCES.dedupeAuto,
    weights: typeof raw.weights === 'boolean' ? raw.weights : DEFAULT_PREFERENCES.weights
  };
}

export function savePreferences(prefs) {
  const normalized = {
    theme: prefs?.theme === 'light' ? 'light' : 'dark',
    sound: typeof prefs?.sound === 'boolean' ? prefs.sound : DEFAULT_PREFERENCES.sound,
    animation: typeof prefs?.animation === 'boolean' ? prefs.animation : DEFAULT_PREFERENCES.animation,
    dedupeAuto: typeof prefs?.dedupeAuto === 'boolean' ? prefs.dedupeAuto : DEFAULT_PREFERENCES.dedupeAuto,
    weights: typeof prefs?.weights === 'boolean' ? prefs.weights : DEFAULT_PREFERENCES.weights
  };
  return writeJson(PREFS_KEY, normalized);
}