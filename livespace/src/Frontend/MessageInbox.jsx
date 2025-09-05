// MessageInbox.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function MessageInbox({ currentUserId }) {
  const [threads, setThreads] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // ---- audio + unread tracking ----
  const audioRef = useRef(null);
  const [soundArmed, setSoundArmed] = useState(false);
  const prevUnreadRef = useRef(0);

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
        list.sort((a, b) => {
          const aT = a?.lastAt?.toMillis?.() ? a.lastAt.toMillis() : 0;
          const bT = b?.lastAt?.toMillis?.() ? b.lastAt.toMillis() : 0;
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

  // unread is a map: unread.{uid}: number
  const totalUnread = useMemo(
    () => threads.reduce((acc, t) => acc + (t?.unread?.[currentUserId] || 0), 0),
    [threads, currentUserId]
  );

  // play sound when unread increases
  useEffect(() => {
    const prev = prevUnreadRef.current;
    const increased = totalUnread > prev;
    prevUnreadRef.current = totalUnread;

    if (!increased) return;
    if (!soundArmed) return; // need a user gesture first
    if (document.visibilityState !== "visible") return;

    const el = audioRef.current;
    if (!el) return;

    try {
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }, [totalUnread, soundArmed]);

  // Arm sound on first click of the button (user gesture)
  const toggleOpen = () => {
    if (!soundArmed) setSoundArmed(true);
    setOpen((v) => !v);
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Put your file at public/sounds/message.mp3 */}
      <audio ref={audioRef} src="/sounds/message.mp3" preload="auto" />

      <button
        aria-label="Messages"
        onClick={toggleOpen}
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
              const otherUid =
                (t.userIds || []).find((u) => u !== currentUserId) || "";
              const unread = t?.unread?.[currentUserId] || 0;

              const ts =
                typeof t?.lastAt?.toMillis === "function"
                  ? new Date(t.lastAt.toMillis()).toLocaleString()
                  : "";

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
                    <small style={{ color: "#666" }}>{ts}</small>
                  </div>
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
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
