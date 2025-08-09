// FriendInbox.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

export default function FriendInbox({ currentUserId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      const frRef = collection(db, "FriendRequests");
      const q = query(frRef, where("toId", "==", currentUserId), where("status", "==", "pending"));
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    })();
  }, [currentUserId]);

  async function act(id, status) {
    await updateDoc(doc(db, "FriendRequests", id), { status });
    setItems(prev => prev.filter(x => x.id !== id));
  }

  if (!items.length) return null;

  return (
    <div style={{ margin: "16px 24px", border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
      <strong>Friend Requests</strong>
      {items.map(r => (
        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f3f3" }}>
          <div>From: <code>{r.fromId}</code></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => act(r.id, "accepted")} style={{ padding: "6px 10px" }}>Accept</button>
            <button onClick={() => act(r.id, "declined")} style={{ padding: "6px 10px" }}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}
