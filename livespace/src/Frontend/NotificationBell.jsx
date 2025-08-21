// NotificationBell.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";

export default function NotificationBell({ currentUserId }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const unread = items.filter(i => !i.read).length;

  useEffect(() => {
    if (!currentUserId) return;
    const q = query(
      collection(db, "Notifications"),
      where("recipientId", "==", currentUserId),
      orderBy("createdAt", "desc"),
      limit(25)
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(rows);
    });
    return () => unsub();
  }, [currentUserId]);

  const markRead = async (id) => {
    try { await updateDoc(doc(db, "Notifications", id), { read: true }); }
    catch (e) { console.error("markRead", e); }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "relative",
          background: "#222",
          color: "#fff",
          border: "1px solid #444",
          padding: "8px 12px",
          borderRadius: 8,
          cursor: "pointer"
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute",
            top: -6, right: -6,
            background: "#ff3b30",
            color: "#fff",
            borderRadius: "999px",
            padding: "2px 6px",
            fontSize: 12,
            fontWeight: 700
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          right: 0, top: "110%",
          width: 360,
          maxHeight: 460,
          overflowY: "auto",
          background: "#fff",
          color: "#111",
          border: "1px solid #ddd",
          borderRadius: 8,
          boxShadow: "0 8px 20px rgba(0,0,0,.15)",
          zIndex: 50
        }}>
          {items.length === 0 && <div style={{ padding: 12, color: "#555" }}>No notifications</div>}
          {items.map(n => {
            const photo = n.actorPhoto || FALLBACK_IMAGE;
            const name = n.actorName || "Someone";
            const line =
              n.type === "post"
                ? `${name} posted`
                : `${name} liked a post`;

            return (
              <a
                key={n.id}
                href={n.postId ? `/post/${n.postId}` : "#"}
                onClick={() => markRead(n.id)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 12px",
                  background: n.read ? "#fff" : "#f6fbff",
                  borderBottom: "1px solid #eee",
                  textDecoration: "none",
                  color: "inherit",
                  alignItems: "center"
                }}
              >
                <img
                  src={photo}
                  alt={name}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1px solid #e6e6e6"
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {line}
                  </div>
                  {n.text && (
                    <div style={{ fontSize: 13, color: "#444", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {n.text}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                    {new Date(n.createdAt?.seconds ? n.createdAt.seconds * 1000 : Date.now()).toLocaleString()}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
