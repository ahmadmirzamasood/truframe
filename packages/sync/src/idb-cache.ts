/** IndexedDB-backed `DocCache` for the browser: one record per project. */
import type { CachedState, DocCache } from "./client.ts";

const DB_NAME = "truframe-docs";
const STORE = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export function indexedDbCache(): DocCache {
  return {
    async load(projectId) {
      try {
        return (
          ((await run("readonly", (s) => s.get(projectId))) as CachedState | undefined) ?? null
        );
      } catch {
        // Private windows or blocked storage: start from the server instead.
        return null;
      }
    },
    async save(projectId, state) {
      await run("readwrite", (s) => s.put(state, projectId));
    },
  };
}

/** In-memory cache, for tests and when IndexedDB is unavailable. */
export function memoryCache(): DocCache & { data: Map<string, CachedState> } {
  const data = new Map<string, CachedState>();
  return {
    data,
    async load(projectId) {
      const s = data.get(projectId);
      return s ? structuredClone(s) : null;
    },
    async save(projectId, state) {
      data.set(projectId, structuredClone(state));
    },
  };
}
