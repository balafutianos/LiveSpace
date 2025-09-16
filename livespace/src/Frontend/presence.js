// src/Frontend/presence.js
import { doc, serverTimestamp, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export const WINDOW_MS = 2 * 60 * 1000; // consider online if active in last 2 min

// Call this once for the signed-in user to publish their presence.
export function usePresence(uid) {
  const React = require("react");
  const { useEffect } = React;

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "presence", uid);

    // write immediately, then every 30s
    setDoc(ref, { lastActive: serverTimestamp() }, { merge: true }).catch(() => {});
    const id = setInterval(() => {
      setDoc(ref, { lastActive: serverTimestamp() }, { merge: true }).catch(() => {});
    }, 30_000);

    const onUnload = () => {
      try { setDoc(ref, { lastActive: serverTimestamp() }, { merge: true }); } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        try { setDoc(ref, { lastActive: serverTimestamp() }, { merge: true }); } catch {}
      }
    });

    return () => {
      clearInterval(id);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [uid]);
}

// Subscribe to one user's presence
export function watchPresence(uid, onChange) {
  const ref = doc(db, "presence", uid);
  return onSnapshot(ref, (snap) => {
    const data = snap.data() || {};
    const ts = data.lastActive?.toMillis
      ? data.lastActive.toMillis()
      : data.lastActive?.seconds
      ? data.lastActive.seconds * 1000
      : 0;
    const online = ts && Date.now() - ts < WINDOW_MS;
    onChange({ online, lastActive: ts || 0 });
  });
}
