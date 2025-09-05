// Messages.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit as qlimit,
  increment,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// OPTIONAL: only if you added the emoji keyboard files I gave you.
// If you didn't add them yet, comment the next line.
import EmojiKeyboard from "./EmojiKeyboard";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function sortPair(a, b) {
  return [a, b].sort();
}
function threadIdFor(a, b) {
  const [x, y] = sortPair(a, b);
  return `${x}_${y}`;
}

export default function Messages() {
  const params = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState(auth.currentUser?.uid || null);
  const [loading, setLoading] = useState(true);

  // who we're chatting with (from /messages/:uid)
  const peerId = params.uid || null;

  // left pane: all my threads
  const [threads, setThreads] = useState([]);
  const [userCache, setUserCache] = useState({}); // uid -> {name, photo}

  // main pane: messages in current thread
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  // Emoji toggle (safe to leave in; remove if you didn't add EmojiKeyboard yet)
  const [showEmoji, setShowEmoji] = useState(false);

  // ensure auth
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        navigate("/login");
        return;
      }
      setMe(u.uid);
    });
    return () => unsub();
  }, [navigate]);

  // subscribe to my threads (left list)
  useEffect(() => {
    if (!me) return;
    const q = query(
      collection(db, "Messages"),
      where("userIds", "array-contains", me)
      // add orderBy("lastAt","desc") if you build the index
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => {
          const at = a?.lastAt?.toMillis?.() ? a.lastAt.toMillis() : 0;
          const bt = b?.lastAt?.toMillis?.() ? b.lastAt.toMillis() : 0;
          return bt - at;
        });
        setThreads(rows);

        // Fetch user info for the left list
        const uidsToFetch = new Set();
        rows.forEach((t) => {
          (t.userIds || []).forEach((uid) => {
            if (uid !== me && !userCache[uid]) uidsToFetch.add(uid);
          });
        });
        if (uidsToFetch.size > 0) {
          const updates = {};
          await Promise.all(
            [...uidsToFetch].map(async (uid) => {
              const us = await getDoc(doc(db, "Users", uid));
              if (us.exists()) {
                const d = us.data();
                const name =
                  `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
                  d.email ||
                  "User";
                const photo =
                  !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE
                    ? FALLBACK_IMAGE
                    : d.photo;
                updates[uid] = { name, photo };
              } else {
                updates[uid] = { name: "User", photo: FALLBACK_IMAGE };
              }
            })
          );
          setUserCache((p) => ({ ...p, ...updates }));
        }
      },
      (err) => console.error("threads snapshot error:", err)
    );
    return () => unsub();
  }, [me, userCache]);

  // subscribe to current thread messages
  useEffect(() => {
    if (!me || !peerId) {
      setMsgs([]);
      setLoading(false);
      return;
    }
    const tid = threadIdFor(me, peerId);
    const itemsCol = collection(db, "Messages", tid, "Items");
    const q = query(itemsCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMsgs(list);
        setLoading(false);
      },
      (err) => {
        console.error("messages snapshot error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [me, peerId]);

  // load peer info for header (and cache)
  const peer = useMemo(() => userCache[peerId] || null, [userCache, peerId]);

  useEffect(() => {
    // fetch peer on enter if missing
    (async () => {
      if (!peerId || userCache[peerId]) return;
      const us = await getDoc(doc(db, "Users", peerId));
      if (us.exists()) {
        const d = us.data();
        const name =
          `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
          d.email ||
          "User";
        const photo =
          !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE
            ? FALLBACK_IMAGE
            : d.photo;
        setUserCache((p) => ({ ...p, [peerId]: { name, photo } }));
      } else {
        setUserCache((p) => ({
          ...p,
          [peerId]: { name: "User", photo: FALLBACK_IMAGE },
        }));
      }
    })();
  }, [peerId, userCache]);

  // when opening a thread, set my unread = 0 (map model)
  useEffect(() => {
    if (!me || !peerId) return;
    const tid = threadIdFor(me, peerId);
    const tRef = doc(db, "Messages", tid);
    (async () => {
      try {
        await updateDoc(tRef, { [`unread.${me}`]: 0 });
      } catch {
        /* ignore */
      }
    })();
  }, [me, peerId]);

  async function ensureThread(meUid, otherUid) {
    const tid = threadIdFor(meUid, otherUid);
    const tRef = doc(db, "Messages", tid);
    const snap = await getDoc(tRef);
    if (!snap.exists()) {
      await setDoc(
        tRef,
        {
          userIds: sortPair(meUid, otherUid),
          createdAt: serverTimestamp(),
          lastText: "",
          lastAt: serverTimestamp(),
          unread: { [meUid]: 0, [otherUid]: 0 }, // map-of-counts model
        },
        { merge: true }
      );
    }
    return tRef;
  }

  async function send() {
    const body = (text || "").trim();
    if (!me || !peerId || !body) return;

    try {
      const tRef = await ensureThread(me, peerId);
      // add message item
      await addDoc(collection(tRef, "Items"), {
        senderId: me,
        text: body,
        createdAt: serverTimestamp(),
      });

      // update thread summary + increment recipient unread (map model)
      await updateDoc(tRef, {
        lastText: body,
        lastAt: serverTimestamp(),
        [`unread.${peerId}`]: increment(1),
      });

      setText("");
      setShowEmoji(false);

      // keep my unread at 0 (optional but nice)
      await updateDoc(tRef, { [`unread.${me}`]: 0 });

      // scroll down
      requestAnimationFrame(() => {
        const el = document.getElementById("msg-end");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    } catch (e) {
      console.error("send error:", e);
      alert("Could not send.");
    }
  }

  function insertAtCursor(emoji) {
    const el = inputRef.current;
    if (!el) {
      setText((t) => (t || "") + emoji);
      return;
    }
    const start = el.selectionStart ?? (text?.length || 0);
    const end = el.selectionEnd ?? (text?.length || 0);
    const before = (text || "").slice(0, start);
    const after = (text || "").slice(end);
    const next = before + emoji + after;
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
    });
  }

  const myThreads = useMemo(() => threads, [threads]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", height: "calc(100vh - 60px)" }}>
      {/* LEFT: Conversations list */}
      <aside
        style={{
          borderRight: "1px solid #eee",
          overflowY: "auto",
          background: "#fafbfc",
        }}
      >
        <div style={{ padding: "12px 12px 8px", fontWeight: 700 }}>Conversations</div>
        {myThreads.length === 0 ? (
          <div style={{ padding: 12, color: "#666" }}>No conversations yet.</div>
        ) : (
          myThreads.map((t) => {
            const other = (t.userIds || []).find((u) => u !== me);
            const meta = userCache[other] || {};
            const unread = t?.unread?.[me] || 0;

            const timeLabel =
              typeof t?.lastAt?.toMillis === "function"
                ? new Date(t.lastAt.toMillis()).toLocaleTimeString()
                : "";

            return (
              <button
                key={t.id}
                onClick={() => navigate(`/messages/${other}`)}
                style={{
                  display: "flex",
                  width: "100%",
                  gap: 10,
                  padding: "10px 12px",
                  border: "none",
                  background: other === peerId ? "#eef7ff" : "#fff",
                  borderBottom: "1px solid #f1f1f1",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <img
                  src={meta.photo || FALLBACK_IMAGE}
                  alt=""
                  style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {meta.name || "User"}
                    </strong>
                    <small style={{ color: "#666" }}>{timeLabel}</small>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#555",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 180,
                      }}
                    >
                      {t.lastText || "New conversation"}
                    </span>
                    {!!unread && (
                      <span
                        style={{
                          marginLeft: "auto",
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
                </div>
              </button>
            );
          })
        )}
      </aside>

      {/* RIGHT: Chat area */}
      <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header with peer info */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderBottom: "1px solid #eee",
            background: "#fff",
          }}
        >
          <img
            src={peer?.photo || FALLBACK_IMAGE}
            alt=""
            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
          />
          <div>
            <div style={{ fontWeight: 700 }}>{peer?.name || "Select a conversation"}</div>
            {peerId && <small style={{ color: "#666" }}>Chat with {peer?.name || peerId}</small>}
          </div>
        </div>

        {/* Messages list */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f7f9fb" }}>
          {loading ? (
            <div style={{ color: "#666" }}>Loading…</div>
          ) : msgs.length === 0 ? (
            <div style={{ color: "#666" }}>No messages yet. Say hello 👋</div>
          ) : (
            msgs.map((m) => {
              const mine = m.senderId === me;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: mine ? "flex-end" : "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      background: mine ? "#27D496" : "#fff",
                      color: mine ? "#052023" : "#111",
                      padding: "8px 12px",
                      borderRadius: 10,
                      boxShadow: "0 2px 6px rgba(0,0,0,.08)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {m.text}
                    <div style={{ textAlign: "right", marginTop: 4 }}>
                      <small style={{ opacity: 0.7 }}>
                        {typeof m?.createdAt?.toMillis === "function"
                          ? new Date(m.createdAt.toMillis()).toLocaleTimeString()
                          : ""}
                      </small>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div id="msg-end" />
        </div>

        {/* Composer */}
        {peerId ? (
          <div style={{ padding: 12, borderTop: "1px solid #eee", background: "#fff", position: "relative" }}>
            <div style={{ display: "flex", gap: 8, position: "relative" }}>
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />

              {/* Emoji toggle (safe to keep; remove if you didn't add EmojiKeyboard.jsx) */}
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                title="Emoji"
                style={{
                  border: "1px solid #ddd",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "0 10px",
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                😊
              </button>

              <button
                type="button"
                onClick={send}
                style={{
                  border: "none",
                  background: "#27D496",
                  color: "#052023",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Send
              </button>

              {showEmoji && (
                <div style={{ position: "absolute", right: 110, bottom: 46 }}>
                  <EmojiKeyboard
                    onPick={(emoji) => {
                      insertAtCursor(emoji);
                      setShowEmoji(false);
                    }}
                    onClose={() => setShowEmoji(false)}
                    anchor="bottom-right"
                    maxPerRow={8}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: 16, color: "#666" }}>Pick a conversation from the left.</div>
        )}
      </main>
    </div>
  );
}
