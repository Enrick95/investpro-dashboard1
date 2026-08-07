"use client";

const IDB_DB = "investpro_media_db_v1";
const IDB_STORE = "files";

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_open_failed"));
  });
}

export async function idbGetBlob(id: string): Promise<Blob | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error || new Error("idb_get_failed"));
  });
}

/** Avatar URL: IDB -> dataUrl -> "" */
export async function resolveAvatarUrl(acc: any): Promise<string> {
  try {
    if (acc?.avatarMediaId) {
      const blob = await idbGetBlob(String(acc.avatarMediaId));
      if (blob) return URL.createObjectURL(blob);
    }
  } catch {}
  return acc?.avatarDataUrl || "";
}
