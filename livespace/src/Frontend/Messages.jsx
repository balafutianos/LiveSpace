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
  increment,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import EmojiKeyboard from "./EmojiKeyboard";

// ---- TURN / STUN (Xirsys) ----
const TURN_CONFIG = {
  iceServers: [
    { urls: ["stun:fr-turn8.xirsys.com"] },
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

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function sortPair(a, b) {
  return [a, b].sort();
}
function threadIdFor(a, b) {
  return sortPair(a, b).join("_");
}
// ✅ Calls collection (plural)
function callRoomRefFor(a, b) {
  const tid = threadIdFor(a, b);
  const callId = `${a}__${b}`;
  return doc(db, "Messages", tid, "Calls", callId);
}

export default function Messages() {
  const params = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState(auth.currentUser?.uid || null);

  const peerId = params.uid || null;
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [callActive, setCallActive] = useState(false);
  const [hasIncomingOffer, setHasIncomingOffer] = useState(false);

  // Threads & messages
  const [threads, setThreads] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const inputRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);

  // Auth
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) navigate("/login");
      else setMe(u.uid);
    });
    return () => unsub();
  }, [navigate]);

  // Subscribe to threads
  useEffect(() => {
    if (!me) return;
    const q = query(collection(db, "Messages"), where("userIds", "array-contains", me));
    const unsub = onSnapshot(q, async (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const at = a?.lastAt?.toMillis?.() ? a.lastAt.toMillis() : 0;
        const bt = b?.lastAt?.toMillis?.() ? b.lastAt.toMillis() : 0;
        return bt - at;
      });
      setThreads(rows);

      const uidsToFetch = new Set();
      rows.forEach((t) =>
        (t.userIds || []).forEach((uid) => {
          if (uid !== me && !userCache[uid]) uidsToFetch.add(uid);
        })
      );
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
    });
    return () => unsub();
  }, [me, userCache]);

  // Subscribe to messages
  useEffect(() => {
    if (!me || !peerId) {
      setMsgs([]);
      setLoading(false);
      return;
    }
    const tid = threadIdFor(me, peerId);
    const itemsCol = collection(db, "Messages", tid, "Items");
    const q = query(itemsCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [me, peerId]);

  // Ensure thread exists
  async function ensureThread(meUid, otherUid) {
    const tid = threadIdFor(meUid, otherUid);
    const tRef = doc(db, "Messages", tid);
    const snap = await getDoc(tRef);
    if (!snap.exists()) {
      await setDoc(tRef, {
        userIds: sortPair(meUid, otherUid),
        createdAt: serverTimestamp(),
        lastText: "",
        lastAt: serverTimestamp(),
        unread: { [meUid]: 0, [otherUid]: 0 },
      });
    }
    return tRef;
  }

  async function send() {
    const body = (text || "").trim();
    if (!me || !peerId || !body) return;

    const tRef = await ensureThread(me, peerId);
    await addDoc(collection(tRef, "Items"), {
      senderId: me,
      text: body,
      imageUrl: null, // ✅ required by rules
      createdAt: serverTimestamp(),
    });

    await updateDoc(tRef, {
      lastText: body,
      lastAt: serverTimestamp(),
      [`unread.${peerId}`]: increment(1),
    });
    setText("");
    setShowEmoji(false);
    await updateDoc(tRef, { [`unread.${me}`]: 0 });
  }

  /* ----------------- WebRTC ----------------- */
  async function setupPeer() {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(TURN_CONFIG);
    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallActive(true);
      if (["failed", "disconnected", "closed"].includes(pc.connectionState))
        setCallActive(false);
    };
    pc.ontrack = (e) => {
      const [remoteStream] = e.streams;
      if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    const ls = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = ls;
    ls.getTracks().forEach((t) => pc.addTrack(t, ls));
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = ls;
      localVideoRef.current.muted = true;
    }
    return pc;
  }

  async function startCall() {
    if (!me || !peerId) return;
    await ensureThread(me, peerId);

    const pc = await setupPeer();
    const roomRef = callRoomRefFor(me, peerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await setDoc(roomRef, {
      callerId: me,
      calleeId: peerId,
      createdAt: serverTimestamp(),
      status: "ringing",
      offer: { type: offer.type, sdp: offer.sdp },
      answer: null,
    });

    const callerCandidates = collection(roomRef, "callerCandidates");
    pc.onicecandidate = async (e) => {
      if (!e.candidate) return;
      const c = e.candidate;
      await addDoc(callerCandidates, {
        candidate: c.candidate,
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
        usernameFragment: c.usernameFragment ?? null,
        createdAt: serverTimestamp(),
        from: me,
      });
    };

    onSnapshot(roomRef, async (snap) => {
      const data = snap.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    onSnapshot(collection(roomRef, "calleeCandidates"), (snap) => {
      snap.docChanges().forEach((chg) => {
        if (chg.type !== "added") return;
        const d = chg.doc.data();
        pc.addIceCandidate(new RTCIceCandidate({
          candidate: d.candidate,
          sdpMid: d.sdpMid,
          sdpMLineIndex: d.sdpMLineIndex,
          usernameFragment: d.usernameFragment || undefined,
        }));
      });
    });
  }

  async function answerCall() {
    if (!me || !peerId) return;
    await ensureThread(me, peerId);

    const roomRef = callRoomRefFor(me, peerId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data?.offer) return;

    const pc = await setupPeer();
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await updateDoc(roomRef, {
      status: "accepted",
      answer: { type: answer.type, sdp: answer.sdp },
    });

    const calleeCandidates = collection(roomRef, "calleeCandidates");
    pc.onicecandidate = async (e) => {
      if (!e.candidate) return;
      const c = e.candidate;
      await addDoc(calleeCandidates, {
        candidate: c.candidate,
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
        usernameFragment: c.usernameFragment ?? null,
        createdAt: serverTimestamp(),
        from: me,
      });
    };

    onSnapshot(collection(roomRef, "callerCandidates"), (snap2) => {
      snap2.docChanges().forEach((chg) => {
        if (chg.type !== "added") return;
        const d = chg.doc.data();
        pc.addIceCandidate(new RTCIceCandidate({
          candidate: d.candidate,
          sdpMid: d.sdpMid,
          sdpMLineIndex: d.sdpMLineIndex,
          usernameFragment: d.usernameFragment || undefined,
        }));
      });
    });
  }

  async function hangUp() {
    try {
      const roomRef = callRoomRefFor(me, peerId);
      await updateDoc(roomRef, { status: "ended" }).catch(() => {});
    } catch {}
    if (pcRef.current) pcRef.current.close();
    pcRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setCallActive(false);
  }

  // Incoming offers
  useEffect(() => {
    if (!me || !peerId) return;
    const roomRef = callRoomRefFor(me, peerId);
    const unsub = onSnapshot(roomRef, (snap) => {
      const data = snap.data();
      setHasIncomingOffer(Boolean(data?.offer && !data?.answer && data?.callerId !== me));
    });
    return () => unsub();
  }, [me, peerId]);

  // Peer meta for header
  const peer = useMemo(() => userCache[peerId] || null, [userCache, peerId]);

  /* ----------------- UI ----------------- */
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", height: "calc(100vh - 60px)" }}>
      {/* LEFT: Threads list */}
      <aside style={{ borderRight: "1px solid #eee", overflowY: "auto", background: "#fafbfc" }}>
        <div style={{ padding: "12px 12px 8px", fontWeight: 700 }}>Conversations</div>
        {threads.length === 0 ? (
          <div style={{ padding: 12, color: "#666" }}>No conversations yet.</div>
        ) : (
          threads.map((t) => {
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
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {meta.name || "User"}
                    </strong>
                    <small style={{ color: "#666" }}>{timeLabel}</small>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#555", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.lastText || "New conversation"}
                    </span>
                    {!!unread && (
                      <span style={{ marginLeft: "auto", background: "red", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 12 }}>
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

      {/* RIGHT: Chat */}
      <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderBottom: "1px solid #eee", background: "#fff" }}>
          <img src={peer?.photo || FALLBACK_IMAGE} alt="" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{peer?.name || "Select a conversation"}</div>
            {peerId && <small style={{ color: "#666" }}>Chat with {peer?.name || peerId}</small>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {peerId && (
              <>
                {!callActive && (
                  <>
                    <button onClick={startCall} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "6px 10px" }}>
                      Call
                    </button>
                    {hasIncomingOffer && (
                      <button onClick={answerCall} style={{ border: "1px solid #0b5", background: "#eaffef", borderRadius: 8, padding: "6px 10px" }}>
                        Answer
                      </button>
                    )}
                  </>
                )}
                {callActive && (
                  <button onClick={hangUp} style={{ border: "1px solid #e33", background: "#ffecec", borderRadius: 8, padding: "6px 10px" }}>
                    Hang up
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Call video panel */}
        {callActive && (
          <div style={{ background: "#000", padding: 8, display: "flex", gap: 8 }}>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: 160, height: 96, background: "#000" }} />
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 320, height: 180, background: "#000" }} />
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f7f9fb" }}>
          {loading ? (
            <div style={{ color: "#666" }}>Loading…</div>
          ) : msgs.length === 0 ? (
            <div style={{ color: "#666" }}>No messages yet. Say hello 👋</div>
          ) : (
            msgs.map((m) => {
              const mine = m.senderId === me;
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "70%", background: mine ? "#27D496" : "#fff", color: mine ? "#052023" : "#111", padding: "8px 12px", borderRadius: 10, boxShadow: "0 2px 6px rgba(0,0,0,.08)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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

              {/* Emoji toggle */}
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                title="Emoji"
                style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "0 10px", fontSize: 18, cursor: "pointer" }}
              >
                😊
              </button>

              <button
                type="button"
                onClick={send}
                style={{ border: "none", background: "#27D496", color: "#052023", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}
              >
                Send
              </button>

              {showEmoji && (
                <div style={{ position: "absolute", right: 110, bottom: 46 }}>
                  <EmojiKeyboard
                    onPick={(emoji) => {
                      const el = inputRef.current;
                      if (!el) {
                        setText((t) => (t || "") + emoji);
                      } else {
                        const start = el.selectionStart ?? (text?.length || 0);
                        const end = el.selectionEnd ?? (text?.length || 0);
                        const before = (text || "").slice(0, start);
                        const after = (text || "").slice(end);
                        const next = before + emoji + after;
                        setText(next);
                        requestAnimationFrame(() => {
                          el.focus();
                          const pos = start + emoji.length;
                          try { el.setSelectionRange(pos, pos); } catch {}
                        });
                      }
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
