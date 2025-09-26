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
import EmojiKeyboard from "./EmojiKeyboard";

// ---- WebRTC / Call support (minimal, style-preserving) ----
const TURN_CONFIG = {
  iceServers: [
    {
      urls: ["stun:fr-turn8.xirsys.com"],
    },
    {
      username:
        "T6F0sPKoekKf_FwKZhEcJCVQcDOaFHzg3mx5ZfwjWngRCzx2JpovkyLeQlHPq75aAAAAAGjXAXB0aGVCYWxhZnV0aWFu",
      credential: "548ad8d4-9b1d-11f0-ad6c-3eafa8ba3f72",
      urls: [
        "turn:fr-turn8.xirsys.com:80?transport=udp",
        "turn:fr-turn8.xirsys.com:3478?transport=udp",
        "turn:fr-turn8.xirsys.com:80?transport=tcp",
        "turn:fr-turn8.xirsys.com:3478?transport=tcp",
        "turns:fr-turn8.xirsys.com:443?transport=tcp",
        "turns:fr-turn8.xirsys.com:5349?transport=tcp",
      ],
    },
  ],
  iceTransportPolicy: "all",
};


// OPTIONAL: only if you added the emoji keyboard files I gave you.
// If you didn't add them yet, comment the next line.

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";
  function sortPair(a, b) {
  return [a, b].sort();
}

  function getThreadId(a, b) {
    return sortPair(a, b).join("_");
  }
  function callRoomRefFor(a, b) {
    const tid = getThreadId(a, b);
    return doc(db, "Messages", tid, "Call", "room");
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
  const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const [callActive, setCallActive] = useState(false);
    const [callRoomId, setCallRoomId] = useState(null);
    const [hasIncomingOffer, setHasIncomingOffer] = useState(false);
  
  
  

  // --- Call state/refs ---


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

  
  async function setupPeer(role) {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection(TURN_CONFIG);
    pcRef.current = pc;

    pc.oniceconnectionstatechange = () => {
      console.log("iceConnectionState:", pc.iceConnectionState);
    };
    pc.onconnectionstatechange = () => {
      console.log("connectionState:", pc.connectionState);
      if (pc.connectionState === "connected") setCallActive(true);
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setCallActive(false);
      }
    };
    pc.onicegatheringstatechange = () => {
      console.log("iceGatheringState:", pc.iceGatheringState);
    };
    pc.onsignalingstatechange = () => {
      console.log("signalingState:", pc.signalingState);
    };

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams;
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current
          .play()
          .catch(() => {/* autoplay may need user gesture */});
      }
    };

    // Get local media
    const ls = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = ls;
    ls.getTracks().forEach(t => pc.addTrack(t, ls));
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = ls;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(()=>{});
    }
    return pc;
  }

  async function startCall() {
    if (!me || !peerId) return;
    const pc = await setupPeer("caller");
    const roomRef = callRoomRefFor(me, peerId);
    setCallRoomId(roomRef.path);

    // create offer
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    await setDoc(roomRef, { offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp(), caller: me });

    // ICE candidates (caller)
    const callerCandidates = collection(roomRef, "callerCandidates");
    pc.onicecandidate = async (e) => {
      if (e.candidate) await addDoc(callerCandidates, e.candidate.toJSON());
    };

    // Listen for answer
    onSnapshot(roomRef, async (snap) => {
      const data = snap.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const ans = new RTCSessionDescription(data.answer);
        await pc.setRemoteDescription(ans);
      }
    });

    // Listen for callee candidates
    onSnapshot(collection(roomRef, "calleeCandidates"), (snap) => {
      snap.docChanges().forEach((c) => {
        if (c.type === "added") {
          pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));
          console.log("added remote ICE (callee)", c.doc.data()?.type || "host");
        }
      });
    });
  }

  // Observe for incoming offer and allow answering
  useEffect(() => {
    if (!me || !peerId) return;
    const roomRef = callRoomRefFor(me, peerId);
    const unsub = onSnapshot(roomRef, (snap) => {
      const data = snap.data();
      setHasIncomingOffer(Boolean(data?.offer && !data?.answer && data?.caller !== me));
    });
    return () => unsub();
  }, [me, peerId]);

  async function answerCall() {
    if (!me || !peerId) return;
    const roomRef = callRoomRefFor(me, peerId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data?.offer) return;

    const pc = await setupPeer("callee");
    setCallRoomId(roomRef.path);

    // ICE candidates (callee)
    const calleeCandidates = collection(roomRef, "calleeCandidates");
    pc.onicecandidate = async (e) => {
      if (e.candidate) await addDoc(calleeCandidates, e.candidate.toJSON());
    };

    // Set remote offer
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    // Create and set local answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp }, answeredAt: serverTimestamp(), callee: me });

    // Listen for caller candidates
    onSnapshot(collection(roomRef, "callerCandidates"), (snap2) => {
      snap2.docChanges().forEach((c) => {
        if (c.type === "added") {
          pc.addIceCandidate(new RTCIceCandidate(c.doc.data()));
          console.log("added remote ICE (caller)", c.doc.data()?.type || "host");
        }
      });
    });
  }

  async function hangUp() {
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => { try { s.track && s.track.stop(); } catch{} });
        pcRef.current.close();
      }
    } catch {}
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch{} });
      localStreamRef.current = null;
    }
    setCallActive(false);
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
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{peer?.name || "Select a conversation"}</div>
            {peerId && <small style={{ color: "#666" }}>Chat with {peer?.name || peerId}</small>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {peerId && (
              <>
                {!callActive && (
                  <>
                    <button
                      type="button"
                      onClick={startCall}
                      style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                      title="Start call"
                    >
                      Call
                    </button>
                    {hasIncomingOffer && (
                      <button
                        type="button"
                        onClick={answerCall}
                        style={{ border: "1px solid #0b5", background: "#eaffef", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                        title="Answer"
                      >
                        Answer
                      </button>
                    )}
                  </>
                )}
                {callActive && (
                  <button
                    type="button"
                    onClick={hangUp}
                    style={{ border: "1px solid #e33", background: "#ffecec", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                    title="Hang up"
                  >
                    Hang up
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {/* Floating mini-call panel (only shown during call) */}
        {callActive && (
          <div style={{ position: "relative", background: "#000", padding: 8, display: "flex", gap: 8, borderBottom: "1px solid #eee" }}>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: 160, height: 96, background: "#000", borderRadius: 8, objectFit: "cover" }} />
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 320, height: 180, background: "#000", borderRadius: 8, objectFit: "cover" }} />
          </div>
        )}

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
