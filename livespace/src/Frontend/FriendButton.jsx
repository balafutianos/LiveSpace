// FriendButton.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const BTN = {
  base: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "none",
    fontWeight: 600,
    cursor: "pointer",
  },
  primary: { background: "#00ff90", color: "#052023" },
  danger:  { background: "#ef4444", color: "#fff" },
  ghost:   { background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }
};

export default function FriendButton({ viewerId, profileUserId, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [req, setReq] = useState(null); // the existing request (if any)

  const isSelf = viewerId === profileUserId;

  // Load any friend request between the two users (either direction)
  useEffect(() => {
    if (!viewerId || !profileUserId) return;

    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const frRef = collection(db, "FriendRequests");
        const q1 = query(frRef, where("fromId", "==", viewerId), where("toId", "==", profileUserId));
        const q2 = query(frRef, where("fromId", "==", profileUserId), where("toId", "==", viewerId));
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const all = [...s1.docs, ...s2.docs];
        const first = all[0] ? { id: all[0].id, ...all[0].data() } : null;
        if (mounted) setReq(first || null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [viewerId, profileUserId]);

  const state = useMemo(() => {
    if (!req) return "none";
    return req.status; // 'pending' | 'accepted' | 'declined' | 'cancelled'
  }, [req]);

  const isSender = req && req.fromId === viewerId;
  const isReceiver = req && req.toId === viewerId;

  async function sendRequest() {
    setLoading(true);
    try {
      const frRef = collection(db, "FriendRequests");
      await addDoc(frRef, {
        fromId: viewerId,
        toId: profileUserId,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      onChanged?.();
      // Reload
      const q = query(frRef, where("fromId","==",viewerId), where("toId","==",profileUserId));
      const snap = await getDocs(q);
      const first = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
      setReq(first);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus) {
    if (!req) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "FriendRequests", req.id), { status: newStatus });
      setReq(prev => prev ? { ...prev, status: newStatus } : prev);
      onChanged?.();
    } finally {
      setLoading(false);
    }
  }

  if (isSelf) return null;

  // Render by state
  if (loading) {
    return <button style={{ ...BTN.base, ...BTN.ghost, opacity: .7 }} disabled>…</button>;
  }

  if (state === "accepted") {
    return (
      <button style={{ ...BTN.base, ...BTN.ghost }} disabled>
        Friends ✓
      </button>
    );
  }

  if (state === "pending") {
    if (isSender) {
      return (
        <button
          onClick={() => updateStatus("cancelled")}
          style={{ ...BTN.base, ...BTN.danger }}
        >
          Cancel Request
        </button>
      );
    }
    if (isReceiver) {
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => updateStatus("accepted")}
            style={{ ...BTN.base, ...BTN.primary }}
          >
            Accept
          </button>
          <button
            onClick={() => updateStatus("declined")}
            style={{ ...BTN.base, ...BTN.danger }}
          >
            Decline
          </button>
        </div>
      );
    }
  }

  // none | declined | cancelled -> can send again
  return (
    <button onClick={sendRequest} style={{ ...BTN.base, ...BTN.primary }}>
      Add Friend
    </button>
  );
}
