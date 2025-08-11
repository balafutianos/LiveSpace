// FriendInbox.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

export default function FriendInbox({ currentUserId }) {
  const [incoming, setIncoming] = useState([]);

  useEffect(() => {
    if (!currentUserId) return;

    // pending requests addressed to me
    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(qy, (snap) => {
      // de-dupe by doc id just in case
      const map = new Map();
      snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
      setIncoming(Array.from(map.values()));
    }, (err) => {
      console.error("FriendInbox listener error:", err);
    });

    return () => unsub();
  }, [currentUserId]);

  async function accept(id) {
    await updateDoc(doc(db, "FriendRequests", id), {
      status: "accepted",
      respondedAt: serverTimestamp(),
    });
  }

  async function decline(id) {
    await updateDoc(doc(db, "FriendRequests", id), {
      status: "declined",
      respondedAt: serverTimestamp(),
    });
  }

  if (incoming.length === 0) return null;

  return (
    <div style={{ marginTop: 16, padding: "0 24px" }}>
      <div style={{ border: "1px solid #ccc", borderRadius: 4, padding: 12, background: "#f9f9f9" }}>
        <h4 style={{ marginTop: 0, marginBottom: 12 }}>Friend Requests</h4>
        {incoming.map((req) => (
          <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #eee" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                From: {req.fromId}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>Pair: {req.id}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => accept(req.id)} style={{ padding: "6px 10px", borderRadius: 6 }}>Accept</button>
              <button onClick={() => decline(req.id)} style={{ padding: "6px 10px", borderRadius: 6 }}>Decline</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
