import type { VaultPayload } from '../types';

const DB_NAME = 'quillit_local_desk_v1';
const DB_VERSION = 1;
const STORE_NAME = 'vaults';
const PRIMARY_KEY = 'primary_local_desk';
const FALLBACK_LS_KEY = 'quillit_local_desk_payload_v1';

function openDeskDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function isValidVaultPayload(raw: unknown): raw is VaultPayload {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    Array.isArray(obj.sessions) &&
    Array.isArray(obj.vocabulary) &&
    Array.isArray(obj.calendarSlots) &&
    typeof obj.settings === 'object' &&
    obj.settings !== null
  );
}

/**
 * Loads the zero-friction Local Desk payload from IndexedDB (with localStorage fallback)
 * so 1-tap "Enter Local Desk" opens in < 300ms with full session/draft persistence.
 */
export async function loadLocalDeskVault(): Promise<VaultPayload | null> {
  const db = await openDeskDb();
  if (db) {
    try {
      const fromIdb = await new Promise<VaultPayload | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(PRIMARY_KEY);
        getReq.onsuccess = () => {
          resolve(isValidVaultPayload(getReq.result) ? getReq.result : null);
        };
        getReq.onerror = () => resolve(null);
      });
      if (fromIdb) return fromIdb;
    } catch {
      // fall through to localStorage fallback
    }
  }

  try {
    const raw = localStorage.getItem(FALLBACK_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidVaultPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persists the Local Desk payload to IndexedDB + mirrors to localStorage fallback.
 */
export async function saveLocalDeskVault(payload: VaultPayload): Promise<void> {
  try {
    localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota limits
  }

  const db = await openDeskDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(payload, PRIMARY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Synchronously checks whether a Local Desk payload already exists in localStorage mirror.
 */
export function loadLocalDeskVaultSync(): VaultPayload | null {
  try {
    const raw = localStorage.getItem(FALLBACK_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidVaultPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearLocalDeskVault(): Promise<void> {
  try {
    localStorage.removeItem(FALLBACK_LS_KEY);
  } catch {
    // ignore
  }
  const db = await openDeskDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(PRIMARY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
