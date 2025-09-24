// Messages.jsx (full)
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

// ---- WebRTC config ----
const RTC_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    // Add TURN here for production (symmetric NATs need it):
    // { urls: 'turn:YOUR_TURN_HOST', username: 'user', credential: 'pass' },
  ],
};

function VideoCallModal({ open, onClose, role, me, peerId, threadId, incoming }) {
  const [pc, setPc] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream] = useState(new MediaStream());
  const [status, setStatus] = useState(role === "callee" ? "Incoming…" : "Calling…");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [callDocRef, setCallDocRef] = useState(null);
  const watchUnsubsRef = useRef([]);

  // HTTPS hint (gUM requires secure origin, except localhost)
  useEffect(() => {
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      console.warn("Tip: Use HTTPS (or localhost) for getUserMedia.");
    }
  }, []);

  // Smart media getter: detects devices and falls back to audio-only if needed
  async function getMediaSmart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error("MEDIA_API_UNAVAILABLE");
      err.code = "MEDIA_API_UNAVAILABLE";
      throw err;
    }

    let hasCam = true;
    let hasMic = true;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      hasCam = devices.some((d) => d.kind === "videoinput");
      hasMic = devices.some((d) => d.kind === "audioinput");
    } catch {
      // If enumerateDevices fails, proceed and let gUM decide.
    }

    if (!hasCam && !hasMic) {
      const err = new Error("NO_DEVICES");
      err.code = "NO_DEVICES";
      throw err;
    }

    const constraints = {
      video: hasCam ? { facingMode: "user" } : false,
      audio: !!hasMic,
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      // Retry audio-only if camera fails but mic exists
      if (hasMic) {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      }
      throw e;
    }
  }

  useEffect(() => {
    if (!open) return;

    let peer;
    let stopped = false;

    (async () => {
      try {
        // ---- SMART MEDIA ----
        const s = await getMediaSmart();
        if (stopped) return;
        setLocalStream(s);

        const audioTracks = s.getAudioTracks();
        const videoTracks = s.getVideoTracks();
        const audioOnly = videoTracks.length === 0 && audioTracks.length > 0;

        if (localVideoRef.current) localVideoRef.current.srcObject = s;

        peer = new RTCPeerConnection(RTC_CONFIG);
        setPc(peer);

        // local tracks
        s.getTracks().forEach((t) => peer.addTrack(t, s));

        // remote tracks
        peer.ontrack = (ev) => {
          ev.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        };

        // status updates
        peer.onconnectionstatechange = () => {
          const st = peer.connectionState;
          if (st === "connected") setStatus(audioOnly ? "Connected (audio-only)" : "Connected");
          else if (st === "connecting") setStatus("Connecting…");
          else if (st === "disconnected" || st === "failed") setStatus("Disconnected");
        };

        const tid = threadId;

        if (role === "caller") {
          const callsCol = collection(db, "Messages", tid, "Calls");
          const callDoc = await addDoc(callsCol, {
            callerId: me,
            calleeId: peerId,
            createdAt: serverTimestamp(),
            status: "ringing",
          });
          setCallDocRef(callDoc);

          const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await peer.setLocalDescription(offer);
          await updateDoc(callDoc, { offer: { type: offer.type, sdp: offer.sdp } });

          const callerCandCol = collection(callDoc, "callerCandidates");
          peer.onicecandidate = async (e) => {
            if (e.candidate) {
              try {
                // Save FULL candidate object
                await addDoc(callerCandCol, {
                  ...e.candidate.toJSON(),
                  createdAt: serverTimestamp(),
                  from: "caller",
                });
              } catch {}
            }
          };

          // watch answer + ended
          const unsubAns = onSnapshot(callDoc, async (snap) => {
            const data = snap.data();
            try {
              if (data?.answer && !peer.currentRemoteDescription) {
                await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
                setStatus(audioOnly ? "Connected (audio-only)" : "Connected");
              }
              if (data?.status === "ended") {
                setStatus("Ended");
                cleanup();
              }
            } catch {}
          });

          // watch callee ICE
          const unsubCalleeC = onSnapshot(collection(callDoc, "calleeCandidates"), async (ss) => {
            for (const ch of ss.docChanges()) {
              if (ch.type === "added") {
                const c = ch.doc.data();
                try {
                  await peer.addIceCandidate(new RTCIceCandidate({
                    candidate: c.candidate,
                    sdpMid: c.sdpMid ?? null,
                    sdpMLineIndex: c.sdpMLineIndex ?? null,
                    usernameFragment: c.usernameFragment ?? null,
                  }));
                } catch {}
              }
            }
          });

          watchUnsubsRef.current = [unsubAns, unsubCalleeC];
        } else if (role === "callee" && incoming?.callPath) {
          const callDoc = doc(db, incoming.callPath);
          setCallDocRef(callDoc);

          const calleeCandCol = collection(callDoc, "calleeCandidates");
          peer.onicecandidate = async (e) => {
            if (e.candidate) {
              try {
                await addDoc(calleeCandCol, {
                  ...e.candidate.toJSON(),
                  createdAt: serverTimestamp(),
                  from: "callee",
                });
              } catch {}
            }
          };

          // set remote offer
          const callSnap = await getDoc(callDoc);
          const data = callSnap.data();
          if (data?.offer) {
            try { await peer.setRemoteDescription(new RTCSessionDescription(data.offer)); } catch {}
          }

          // create & send answer
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await updateDoc(callDoc, { answer: { type: answer.type, sdp: answer.sdp }, status: "in-call" });
          setStatus(audioOnly ? "Connected (audio-only)" : "Connected");

          // watch caller ICE
          const unsubCallerC = onSnapshot(collection(callDoc, "callerCandidates"), async (ss) => {
            for (const ch of ss.docChanges()) {
              if (ch.type === "added") {
                const c = ch.doc.data();
                try {
                  await peer.addIceCandidate(new RTCIceCandidate({
                    candidate: c.candidate,
                    sdpMid: c.sdpMid ?? null,
                    sdpMLineIndex: c.sdpMLineIndex ?? null,
                    usernameFragment: c.usernameFragment ?? null,
                  }));
                } catch {}
              }
            }
          });

          // watch ended
          const unsubDoc = onSnapshot(callDoc, (snap) => {
            const d = snap.data();
            if (d?.status === "ended") {
              setStatus("Ended");
              cleanup();
            }
          });

          watchUnsubsRef.current = [unsubCallerC, unsubDoc];
        }

        function cleanup() {
          try { watchUnsubsRef.current.forEach((u) => u && u()); } catch {}
          watchUnsubsRef.current = [];
          try { peer.close(); } catch {}
          try { s.getTracks().forEach((t) => t.stop()); } catch {}
          setPc(null);
          if (onClose) onClose();
        }

        // unmount / close
        return () => {
          stopped = true;
          try { watchUnsubsRef.current.forEach((u) => u && u()); } catch {}
          try { peer && peer.close(); } catch {}
          try { localStream && localStream.getTracks().forEach((t) => t.stop()); } catch {}
          watchUnsubsRef.current = [];
          setPc(null);
        };
      } catch (e) {
        console.error("Video setup error", e);
        if (e?.name === "NotFoundError" || e?.code === "NO_DEVICES") {
          alert(
`No camera/microphone was found.

Quick checks:
• Connect a webcam or unmute your laptop mic.
• macOS: System Settings → Privacy & Security → Camera/Microphone → allow your browser.
• Windows: Settings → Privacy → Camera/Microphone → allow apps.
• Browser: Click the lock icon → allow Camera & Microphone.
• Close apps that may be using the camera (Zoom/Teams).`
          );
        } else if (e?.name === "NotAllowedError") {
          alert("Permission denied. Please allow camera & microphone in the browser site settings and try again.");
        } else if (e?.code === "MEDIA_API_UNAVAILABLE") {
          alert("This browser/page doesn’t allow getUserMedia. Use HTTPS or http://localhost.");
        } else {
          alert("Could not start your camera/microphone. See console for details.");
        }
        if (onClose) onClose();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function hangUp() {
    setStatus("Ending…");
    try { if (callDocRef) await updateDoc(callDocRef, { status: "ended" }); } catch {}
    if (onClose) onClose();
  }

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ width: 860, maxWidth: "95vw", background: "#0b1215", color: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.4)" }}>
        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f1a1d" }}>
          <strong>Video call</strong>
          <span style={{ opacity: .8 }}>{status}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, padding: 10 }}>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: 420, background: "#000", borderRadius: 10 }} />
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: "100%", height: 420, background: "#000", borderRadius: 10, transform: "scaleX(-1)" }} />
        </div>
        <div style={{ padding: 10, display: "flex", gap: 8, justifyContent: "flex-end", background: "#0f1a1d" }}>
          <button onClick={hangUp} style={{ background: "#ff4d4f", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            Hang up
          </button>
        </div>
      </div>
    </div>
  );
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

  // Emoji toggle
  const [showEmoji, setShowEmoji] = useState(false);

  // Video call state
  const [showCall, setShowCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null); // {callPath, data}

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
    const qy = query(collection(db, "Messages"), where("userIds", "array-contains", me));
    const unsub = onSnapshot(
      qy,
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
    const qy = query(itemsCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      qy,
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
      } catch { /* ignore */ }
    })();
  }, [me, peerId]);

  // Incoming call watcher for this thread (only ringing to me)
  useEffect(() => {
    if (!me || !peerId) { setIncomingCall(null); return; }
    const tid = threadIdFor(me, peerId);
    const callsCol = collection(db, "Messages", tid, "Calls");
    const unsub = onSnapshot(
      query(callsCol, where("calleeId", "==", me), where("status", "==", "ringing")),
      (snap) => {
        const first = snap.docs[0];
        if (first) {
          setIncomingCall({ callPath: first.ref.path, data: { id: first.id, ...first.data() } });
        } else {
          setIncomingCall(null);
        }
      },
      (err) => console.error("incoming call watch error:", err)
    );
    return () => unsub();
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
          unread: { [meUid]: 0, [otherUid]: 0 },
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
      await addDoc(collection(tRef, "Items"), {
        senderId: me,
        text: body,
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
      try { el.setSelectionRange(pos, pos); } catch {}
    });
  }

  const myThreads = useMemo(() => threads, [threads]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", height: "calc(100vh - 60px)" }}>
      {/* LEFT: Conversations list */}
      <aside style={{ borderRight: "1px solid #eee", overflowY: "auto", background: "#fafbfc" }}>
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
        {/* Header with peer info + video actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderBottom: "1px solid #eee",
            background: "#fff",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
          {peerId && (
            <div style={{ display: "flex", gap: 8 }}>
              {incomingCall ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setShowCall(true); }}
                    style={{ border: "none", background: "#27D496", color: "#052023", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}
                  >
                    Accept video
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try { await updateDoc(doc(db, incomingCall.callPath), { status: "ended" }); } catch {}
                      setIncomingCall(null);
                    }}
                    style={{ border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
                  >
                    Decline
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCall(true)}
                  title="Start video call"
                  style={{ border: "none", background: "#27D496", color: "#052023", borderRadius: 8, padding: "8px 12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Start video
                </button>
              )}
            </div>
          )}
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
                  style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}
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
                    onPick={(emoji) => { insertAtCursor(emoji); setShowEmoji(false); }}
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

        {/* Video modal */}
        {peerId && (
          <VideoCallModal
            open={showCall}
            onClose={() => { setShowCall(false); setIncomingCall(null); }}
            role={incomingCall ? "callee" : "caller"}
            me={me}
            peerId={peerId}
            threadId={threadIdFor(me, peerId)}
            incoming={incomingCall}
          />
        )}
      </main>
    </div>
  );
}
