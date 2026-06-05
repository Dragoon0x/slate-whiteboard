import type { AssetRecord, BoardMeta, BoardRecord } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB wrapper. Three stores: boards, assets (image blobs), settings (kv).
// All access is client-only and degrades gracefully if IndexedDB is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'slate-whiteboard';
const DB_VERSION = 1;
const STORE_BOARDS = 'boards';
const STORE_ASSETS = 'assets';
const STORE_SETTINGS = 'settings';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BOARDS)) {
        db.createObjectStore(STORE_BOARDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── Boards ───────────────────────────────────────────────────────────────────

export function saveBoard(board: BoardRecord): Promise<void> {
  return tx(STORE_BOARDS, 'readwrite', (s) => s.put(board)).then(() => undefined);
}

export function getBoard(id: string): Promise<BoardRecord | undefined> {
  return tx<BoardRecord | undefined>(STORE_BOARDS, 'readonly', (s) => s.get(id));
}

export async function getAllBoards(): Promise<BoardRecord[]> {
  try {
    const all = await tx<BoardRecord[]>(STORE_BOARDS, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function listBoardMeta(): Promise<BoardMeta[]> {
  const boards = await getAllBoards();
  return boards.map(({ elements, camera, ...meta }) => meta);
}

export function deleteBoard(id: string): Promise<void> {
  return tx(STORE_BOARDS, 'readwrite', (s) => s.delete(id)).then(() => undefined);
}

export async function patchBoard(
  id: string,
  patch: Partial<BoardRecord>,
): Promise<BoardRecord | undefined> {
  const existing = await getBoard(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  await saveBoard(updated);
  return updated;
}

// ── Assets ───────────────────────────────────────────────────────────────────

export function saveAsset(asset: AssetRecord): Promise<void> {
  return tx(STORE_ASSETS, 'readwrite', (s) => s.put(asset)).then(() => undefined);
}

export function getAsset(id: string): Promise<AssetRecord | undefined> {
  return tx<AssetRecord | undefined>(STORE_ASSETS, 'readonly', (s) => s.get(id));
}

export function deleteAsset(id: string): Promise<void> {
  return tx(STORE_ASSETS, 'readwrite', (s) => s.delete(id)).then(() => undefined);
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const rec = await tx<{ key: string; value: T } | undefined>(
      STORE_SETTINGS,
      'readonly',
      (s) => s.get(key),
    );
    return rec ? rec.value : fallback;
  } catch {
    return fallback;
  }
}

export function setSetting<T>(key: string, value: T): Promise<void> {
  return tx(STORE_SETTINGS, 'readwrite', (s) => s.put({ key, value })).then(() => undefined);
}
