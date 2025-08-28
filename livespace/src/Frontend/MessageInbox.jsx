// MessageInbox.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function MessageInbox({ currentUserId }) {
  const [threads, setThreads] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUserId) return;
    const q = query(
      collection(db, "Messages"),
      where("userIds", "array-contains", currentUserId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // sort newest first
        list.sort((a, b) => {
          const aT = a.lastAt?.toMillis?.() || 0;
          const bT = b.lastAt?.toMillis?.() || 0;
          return bT - aT;
        });
        setThreads(list);
      },
      (err) => {
        console.error("inbox snapshot error:", err);
      }
    );
    return () => unsub();
  }, [currentUserId]);

  const totalUnread = useMemo(
    () =>
      threads.reduce((acc, t) => acc + (t.unread?.[currentUserId] || 0), 0),
    [threads, currentUserId]
  );

  return (
    <div style={{ position: "relative" }}>
      <button
        aria-label="Messages"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 20,
        }}
        title="Messages"
      >
        💬
        {totalUnread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -8,
              background: "red",
              color: "#fff",
              borderRadius: 999,
              padding: "2px 6px",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            right: 0,
            width: 300,
            maxHeight: 380,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,.1)",
            zIndex: 1000,
          }}
        >
          {threads.length === 0 ? (
            <div style={{ padding: 12 }}>No conversations</div>
          ) : (
            threads.map((t) => {
              const otherUid = (t.userIds || []).find((u) => u !== currentUserId) || "";
              const unread = t.unread?.[currentUserId] || 0;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    navigate(`/messages/${otherUid}`);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "none",
                    borderBottom: "1px solid #eee",
                    background: unread ? "#f0f8ff" : "#fff",
                    cursor: "pointer",
                  }}
                  title="Open conversation"
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 14 }}>
                      {t.lastText || "New conversation"}
                    </strong>
                    {!!unread && (
                      <span
                        style={{
                          background: "red",
                          color: "#fff",
                          borderRadius: 999,
                          padding: "0 6px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {unread}
                      </span>
                    )}
                  </div>
                  <small style={{ color: "#666" }}>
                    {t.lastAt?.toDate
                      ? new Date(t.lastAt.toDate()).toLocaleString()
                      : ""}
                  </small>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
