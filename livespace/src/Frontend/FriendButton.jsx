// FriendButton.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

function pairKeyFor(u1, u2) {
  const a = String(u1), b = String(u2);
  // use double underscore to avoid clashing with your Friends "_" id
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export default function FriendButton({ viewerId, profileUserId, onChanged }) {
  const [status, setStatus] = useState(null); // 'pending' | 'accepted' | 'declined' | 'cancelled' | null
  const [fromId, setFromId] = useState(null);
  const [loading, setLoading] = useState(true);

  const pairId = useMemo(() => pairKeyFor(viewerId, profileUserId), [viewerId, profileUserId]);
  const reqRef = useMemo(() => doc(db, "FriendRequests", pairId), [pairId]);

  const iAmSender = fromId === viewerId;
  const iAmReceiver = fromId && fromId !== viewerId;

  useEffect(() => {
    if (!viewerId || !profileUserId) return;
    const unsub = onSnapshot(
      reqRef,
      (snap) => {
        if (!snap.exists()) {
          setStatus(null);
          setFromId(null);
        } else {
          const d = snap.data();
          setStatus(d.status);
          setFromId(d.fromId); // strings
        }
        setLoading(false);
        onChanged?.();
      },
      (err) => {
        console.error("FriendButton listener error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [reqRef, viewerId, profileUserId, onChanged]);

  async function sendRequest() {
    if (!viewerId || !profileUserId) return;
    setLoading(true);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(reqRef);
        if (snap.exists()) {
          const s = snap.data()?.status;
          // idempotent: if already pending or accepted, do nothing
          if (s === "pending" || s === "accepted") return;
        }
        tx.set(reqRef, {
          fromId: viewerId,
          toId: profileUserId,
          status: "pending",
          createdAt: serverTimestamp(),
        }, { merge: true });
      });
    } finally {
      setLoading(false);
    }
  }

  async function cancelRequest() {
    if (!iAmSender || status !== "pending") return;
    setLoading(true);
    try {
      await updateDoc(reqRef, { status: "cancelled", respondedAt: serverTimestamp() });
    } finally {
      setLoading(false);
    }
  }

  async function acceptRequest() {
    if (!iAmReceiver || status !== "pending") return;
    setLoading(true);
    try {
      await updateDoc(reqRef, { status: "accepted", respondedAt: serverTimestamp() });
    } finally {
      setLoading(false);
    }
  }

  async function declineRequest() {
    if (!iAmReceiver || status !== "pending") return;
    setLoading(true);
    try {
      await updateDoc(reqRef, { status: "declined", respondedAt: serverTimestamp() });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <button disabled style={{ opacity: 0.6 }}>Loading…</button>;
  }

  if (status === "accepted") {
    return <button disabled style={{ background: "#00ff90", border: 0, padding: "8px 12px", borderRadius: 6 }}>Friends</button>;
  }

  if (status === "pending") {
    if (iAmSender) {
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled style={{ padding: "8px 12px", borderRadius: 6 }}>Requested</button>
          <button onClick={cancelRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>Cancel</button>
        </div>
      );
    }
    if (iAmReceiver) {
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={acceptRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>Accept</button>
          <button onClick={declineRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>Decline</button>
        </div>
      );
    }
  }

  return (
    <button onClick={sendRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>
      Add Friend
    </button>
  );
}
