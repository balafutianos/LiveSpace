// src/Messages.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export default function Messages() {
  const { uid: otherId } = useParams(); // route: /messages/:uid
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  // wait for auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setMe(u?.uid || null);
      setReady(true);
    });
    return () => unsub();
  }, []);

  const threadId = useMemo(() => {
    if (!me || !otherId) return null;
    return [me, otherId].sort().join("_");
  }, [me, otherId]);

  async function ensureThreadExists() {
    if (!threadId) return null;
    const tRef = doc(db, "Messages", threadId);
    const snap = await getDoc(tRef);
    if (!snap.exists()) {
      await setDoc(tRef, {
        userIds: [me, otherId].sort(),
        createdAt: serverTimestamp(),
        lastText: "",
        lastAt: serverTimestamp(),
        unread: { [me]: 0, [otherId]: 0 },
      });
    } else {
      // make sure unread map has both keys (in case of old docs)
      const data = snap.data() || {};
      const unread = { ...(data.unread || {}) };
      let needsFix = false;
      if (unread[me] === undefined) { unread[me] = 0; needsFix = true; }
      if (unread[otherId] === undefined) { unread[otherId] = 0; needsFix = true; }
      if (needsFix) await updateDoc(tRef, { unread });
    }
    return tRef;
  }

  // subscribe AFTER we ensured the thread exists
  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    (async () => {
      if (!ready || !me || !otherId || !threadId) return;

      try {
        await ensureThreadExists(); // <- important

        if (cancelled) return;

        const q = query(
          collection(db, "Messages", threadId, "Items"),
          orderBy("createdAt", "asc")
        );

        unsub = onSnapshot(
          q,
          async (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setMessages(rows);

            // mark my unread as 0 while viewing
            try {
              await updateDoc(doc(db, "Messages", threadId), { [`unread.${me}`]: 0 });
            } catch (_e) {
              // ignore — will succeed next time
            }

            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          },
          (err) => {
            console.error("messages snapshot error:", err);
          }
        );
      } catch (e) {
        console.error("ensure/subscribe error:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [ready, me, otherId, threadId]);

  async function send() {
    if (!me || !otherId || !text.trim() || me === otherId) return;
    try {
      const tRef = (await ensureThreadExists()) || doc(db, "Messages", threadId);

      await addDoc(collection(tRef, "Items"), {
        senderId: me,
        text: text.trim(),
        createdAt: serverTimestamp(),
      });

      await updateDoc(tRef, {
        lastText: text.trim(),
        lastAt: serverTimestamp(),
        [`unread.${otherId}`]: increment(1),
      });

      setText("");
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      console.error("send error:", e);
      alert("Couldn't send message. Check rules and authentication.");
    }
  }

  if (!ready) return <div style={{ padding: 16 }}>Loading…</div>;
  if (!me) return <div style={{ padding: 16 }}>Please sign in.</div>;
  if (!otherId) return <div style={{ padding: 16 }}>No user selected.</div>;

  return (
    <div style={{ maxWidth: 640, margin: "24px auto", padding: 16 }}>
      <h2>Messages</h2>

      <div
        style={{
          height: 420,
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#666" }}>No messages yet. Say hello 👋</div>
        )}

        {messages.map((m) => {
          const mine = m.senderId === me;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div
                style={{
                  maxWidth: "80%",
                  padding: "8px 12px",
                  borderRadius: 14,
                  background: mine ? "#dcf8c6" : "#f1f1f1",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
        />
        <button onClick={send} style={{ padding: "10px 16px" }}>
          Send
        </button>
      </div>
    </div>
  );
}
