import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, where, limit as qlimit
} from "firebase/firestore";
import { db } from "./firebase";

const BEEP = "/sounds/message.mp3";


function useIncomingSound() {
  const audio = useRef(null);
  useEffect(() => { audio.current = new Audio(BEEP); }, []);
  return () => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => {});
  };
}

async function getOrCreateThreadId(myUid, peerUid) {
  // Try to find an existing thread where I'm a participant
  const q1 = query(
    collection(db, "Messages"),
    where("userIds", "array-contains", myUid),
    qlimit(20)
  );
  const s1 = await getDocs(q1);
  const existing = s1.docs.find(d => (d.data()?.userIds || []).includes(peerUid));
  if (existing) return existing.id;

  // Create a new thread
  const docRef = await addDoc(collection(db, "Messages"), {
    userIds: [myUid, peerUid],
    createdAt: serverTimestamp(),
    lastText: "",
    lastAt: serverTimestamp(),
    unread: { [peerUid]: 0, [myUid]: 0 },
  });
  return docRef.id;
}

export default function ChatBox({ me, peer, onClose }) {
  const [threadId, setThreadId] = useState(null);
  const [msgs, setMsgs] = useState([]); // {id, senderId, text, createdAt, imageUrl}
  const [text, setText] = useState("");
  const [minimized, setMinimized] = useState(false);
  const ding = useIncomingSound();
  const lastSeenIncoming = useRef(0); // timestamp to suppress repeat dings on initial load

  useEffect(() => {
    if (!me || !peer?.id) return;
    let unsub = () => {};
    let alive = true;

    (async () => {
      const tid = await getOrCreateThreadId(me, peer.id);
      if (!alive) return;
      setThreadId(tid);

      // Live messages
      const itemsRef = collection(db, "Messages", tid, "Items");
      const q = query(itemsRef, orderBy("createdAt", "asc"));
      unsub = onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setMsgs(list);

        // play a ding for new incoming items
        const last = list[list.length - 1];
        if (!last) return;
        const ts = last.createdAt?.toMillis ? last.createdAt.toMillis() :
                  (last.createdAt?.seconds ? last.createdAt.seconds * 1000 : Date.now());
        // Only ding for messages from peer and newer than the previous lastSeenIncoming
        if (last.senderId !== me && ts > lastSeenIncoming.current) {
  lastSeenIncoming.current = ts;
  // ✅ Only ding if page is not visible (user is away / tab inactive)
  if (document.hidden) {
    ding();
  }
}
else {
          lastSeenIncoming.current = Math.max(lastSeenIncoming.current, ts);
        }
      });
    })();

    return () => { alive = false; try { unsub(); } catch {} };
  }, [me, peer?.id]);

  const canSend = text.trim().length > 0 && !!threadId;

  const send = async () => {
    if (!canSend) return;
    try {
      await addDoc(collection(db, "Messages", threadId, "Items"), {
        senderId: me,
        text: text.trim(),
        createdAt: serverTimestamp(),
        imageUrl: null,
      });
      setText("");
      // Optionally update thread summary:
      await setDoc(doc(db, "Messages", threadId), {
        lastText: text.trim(),
        lastAt: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("send failed:", e);
    }
  };

  // basic enter-to-send
  const onKey = (e) => {
    if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      style={{
        width: 320,
        background: "#0f172a",
        color: "#e2e8f0",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        height: minimized ? 44 : 400,
      }}
    >
      {/* header */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(17,24,39,0.9)",
          cursor: "default",
        }}
      >
        <img
          src={peer.photo}
          alt={peer.name}
          style={{ width: 26, height: 26, borderRadius: 9999, objectFit: "cover" }}
        />
        <div style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {peer.name}
        </div>
        <button className="btn btn-ghost" onClick={() => setMinimized(m => !m)} style={{ padding: "2px 6px" }}>
          {minimized ? "▲" : "—"}
        </button>
        <button className="btn btn-ghost" onClick={onClose} style={{ padding: "2px 6px" }}>
          ✕
        </button>
      </div>

      {/* messages */}
      {!minimized && (
        <>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "#0b1220",
            }}
          >
            {msgs.map(m => {
              const mine = m.senderId === me;
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "78%",
                      background: mine ? "#1d4ed8" : "rgba(255,255,255,0.06)",
                      color: "#fff",
                      padding: "8px 10px",
                      borderRadius: mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 14,
                      lineHeight: 1.35,
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* composer */}
          <div style={{ padding: 8, borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0f172a" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              placeholder="Write a message…"
              style={{
                width: "100%",
                resize: "none",
                padding: 8,
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#0b1220",
                color: "#fff",
                fontSize: 14,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
              <button className="btn btn-primary" onClick={send} disabled={!canSend}>Send</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
