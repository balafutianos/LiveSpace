// NotifyButton.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

export default function NotifyButton({ currentUserId, profileUserId, isFriends }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const prefId = `${currentUserId}__${profileUserId}`;

  useEffect(() => {
    if (!currentUserId || !profileUserId || !isFriends) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "NotificationPrefs", prefId));
        setEnabled(snap.exists() ? !!snap.data().enabled : true); // default ON if no doc
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUserId, profileUserId, isFriends, prefId]);

  if (!isFriends || currentUserId === profileUserId) return null;

  const toggle = async () => {
    try {
      const ref = doc(db, "NotificationPrefs", prefId);
      if (enabled) {
        await setDoc(ref, { subscriberId: currentUserId, publisherId: profileUserId, enabled: false }, { merge: true });
        setEnabled(false);
      } else {
        await setDoc(ref, { subscriberId: currentUserId, publisherId: profileUserId, enabled: true }, { merge: true });
        setEnabled(true);
      }
    } catch (e) {
      console.error("Toggle notify error:", e);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        backgroundColor: enabled ? "#00ff90" : "#ddd",
        color: enabled ? "#000" : "#333",
        border: "none",
        padding: "8px 12px",
        borderRadius: 6,
        cursor: "pointer"
      }}
    >
      {enabled ? "Notifications On" : "Notifications Off"}
    </button>
  );
}
