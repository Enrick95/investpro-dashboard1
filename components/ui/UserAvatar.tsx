"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type UserLike = {
  username?: string;
  avatarMediaId?: string | number;
  avatarDataUrl?: string;
};

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

async function idbGetBlob(id: string): Promise<Blob | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result?.blob ?? null);
    req.onerror = () => reject(req.error || new Error("idb_get_failed"));
  });
}

export default function UserAvatar(props: {
  user: UserLike | null | undefined;
  size?: number; // px
  className?: string;
}) {
  const { user, size = 36 } = props;
  const [src, setSrc] = useState<string>("");
  const objUrlRef = useRef<string>("");

  const initials = useMemo(() => {
    const u = user?.username?.trim();
    if (!u) return "IP";
    return u.slice(0, 2).toUpperCase();
  }, [user?.username]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        if (objUrlRef.current) {
          URL.revokeObjectURL(objUrlRef.current);
          objUrlRef.current = "";
        }

        if (user?.avatarMediaId != null) {
          const blob = await idbGetBlob(String(user.avatarMediaId));
          if (!alive) return;
          if (blob) {
            const url = URL.createObjectURL(blob);
            objUrlRef.current = url;
            setSrc(url);
            return;
          }
        }

        setSrc(user?.avatarDataUrl || "");
      } catch {
        setSrc(user?.avatarDataUrl || "");
      }
    }

    load();
    return () => {
      alive = false;
      if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
      objUrlRef.current = "";
    };
  }, [user?.avatarMediaId, user?.avatarDataUrl]);

  return (
    <div
      className={[
        "rounded-full overflow-hidden border border-[color:var(--gold-border)] bg-[color:var(--panel-2)] flex items-center justify-center",
        props.className || "",
      ].join(" ")}
      style={{ width: size, height: size }}
      title={user?.username || "Utilisateur"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="avatar" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-[color:var(--gold)]">{initials}</span>
      )}
    </div>
  );
}
