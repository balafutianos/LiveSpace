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

/* =======================
   WebRTC configuration
   ======================= */
// Flip FORCE_TURN to true TEMPORARILY to prove TURN fixes “connecting → failed”.
const FORCE_TURN = false;

const RTC_CONFIG = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun1.l.google.com:19302"] },
    { urls: ["stun:stun2.l.google.com:19302"] },
    // TURN (replace with your real server/creds if needed):
    // { urls: "turn:your.turn.host:3478?transport=udp", username: "USER", credential: "PASS" },
    // { urls: "turn:your.turn.host:3478?transport=tcp", username: "USER", credential: "PASS" },
    // { urls: "turns:your.turn.host:5349?transport=tcp", username: "USER", credential: "PASS" },
  ],
  ...(FORCE_TURN ? { iceTransportPolicy: "relay" } : {}),
  iceCandidatePoolSize: 8,
};

function VideoCallModal({ open, onClose, role, me, peerId, threadId, incoming }) {
  const [pc, setPc] = useState(null);
  const [status, setStatus] = useState(role === "callee" ? "Incoming…" : "Calling…");
  const [callDocRef, setCallDocRef] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const localStreamRef = useRef(null);
  const inboundRef = useRef(new MediaStream()); // our own remote stream
  const [remoteMuted, setRemoteMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);

  const watchUnsubsRef = useRef([]);

  // prefer VP8 to avoid H.264/GPU decode quirks
  function preferVideoCodec(sdp, codecName = "VP8") {
    if (!sdp) return sdp;
    const lines = sdp.split("\r\n");
    const mIndex = lines.findIndex((l) => l.startsWith("m=video"));
    if (mIndex === -1) return sdp;
    const rtpmap = lines
      .map((l, i) => ({ i, l }))
      .filter((x) => x.l.startsWith("a=rtpmap:"))
      .map((x) => {
        const m = /^a=rtpmap:(\d+)\s+([A-Za-z0-9\-]+)/.exec(x.l);
        return m ? { pt: m[1], codec: m[2].toUpperCase() } : null;
      })
      .filter(Boolean);
    const pref = rtpmap.filter((x) => x.codec.includes(codecName.toUpperCase())).map((x) => x.pt);
    if (!pref.length) return sdp;
    const parts = lines[mIndex].split(" ");
    lines[mIndex] = [...parts.slice(0, 3), ...pref, ...parts.slice(3).filter((p) => !pref.includes(p))].join(" ");
    return lines.join("\r\n");
  }

  async function getMediaSmart() {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      const e = new Error("MEDIA_API_UNAVAILABLE");
      e.code = "MEDIA_API_UNAVAILABLE";
      throw e;
    }
    let hasCam = true, hasMic = true;
    try {
      const devs = await md.enumerateDevices();
      hasCam = devs.some((d) => d.kind === "videoinput");
      hasMic = devs.some((d) => d.kind === "audioinput");
    } catch {}
    if (!hasCam && !hasMic) {
      const e = new Error("NO_DEVICES");
      e.code = "NO_DEVICES";
      throw e;
    }
    try {
      return await md.getUserMedia({ video: hasCam ? { facingMode: "user" } : false, audio: !!hasMic });
    } catch (err) {
      if (hasMic) return await md.getUserMedia({ video: false, audio: true });
      throw err;
    }
  }

  // try to start video element; if blocked, show overlay
  async function startRemotePlayback() {
    const el = remoteVideoRef.current;
    if (!el) return;
    try {
      await el.play();
      setNeedsTap(false);
    } catch {
      setNeedsTap(true);
    }
  }

  // if no frames after attach, re-attach and retry play()
  function ensureFirstFrame() {
    const el = remoteVideoRef.current;
    if (!el) return;
    if ("requestVideoFrameCallback" in el) {
      el.requestVideoFrameCallback?.((/* now, metadata */) => {
        // got a frame; keep going
      });
    } else {
      // Fallback: retry once after a short delay
      setTimeout(() => {
        el.pause?.();
        const s = el.srcObject;
        el.srcObject = null;
        el.srcObject = s;
        startRemotePlayback();
      }, 600);
    }
  }

  useEffect(() => {
    if (!open) return;
    let peer; let stopped = false;

    (async () => {
      try {
        const local = await getMediaSmart();
        if (stopped) return;
        localStreamRef.current = local;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = local;
          localVideoRef.current.play?.().catch(() => {});
        }

        peer = new RTCPeerConnection({
          iceServers: [
            { urls: ["stun:stun.l.google.com:19302"] },
            { urls: ["stun:stun1.l.google.com:19302"] },
            { urls: ["stun:stun2.l.google.com:19302"] },
            // add your TURN here for production
          ],
          iceCandidatePoolSize: 8,
        });
        setPc(peer);

        // transceivers help browsers that are picky about recvonly tracks
        try {
          peer.addTransceiver("audio", { direction: "sendrecv" });
          peer.addTransceiver("video", { direction: "sendrecv" });
        } catch {}

        // send our tracks
        local.getTracks().forEach((t) => peer.addTrack(t, local));

        // receive remote tracks — always attach to our own inbound stream
        peer.ontrack = (ev) => {
          if (ev.track) {
            const exists = inboundRef.current.getTracks().some((t) => t.id === ev.track.id);
            if (!exists) inboundRef.current.addTrack(ev.track);
          }
          if (remoteVideoRef.current) {
            // force a fresh assignment to bump some browsers
            remoteVideoRef.current.srcObject = null;
            remoteVideoRef.current.srcObject = inboundRef.current;
            remoteVideoRef.current.muted = remoteMuted; // start muted for autoplay
            startRemotePlayback().then(ensureFirstFrame);
          }
          // make sure we kick when the first data flows
          ev.track.onunmute = () => startRemotePlayback();
        };

        // status hints
        peer.onconnectionstatechange = () => {
          const st = peer.connectionState;
          if (st === "connected") setStatus("Connected");
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

          let offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          offer = { type: offer.type, sdp: preferVideoCodec(offer.sdp, "VP8") };
          await peer.setLocalDescription(offer);
          await updateDoc(callDoc, { offer });

          const callerCandCol = collection(callDoc, "callerCandidates");
          peer.onicecandidate = async (e) => {
            if (!e.candidate) return;
            try {
              await addDoc(callerCandCol, { ...e.candidate.toJSON?.(), createdAt: serverTimestamp(), from: "caller" });
            } catch {}
          };

          const unsubAns = onSnapshot(callDoc, async (snap) => {
            const data = snap.data();
            try {
              if (data?.answer && !peer.remoteDescription) {
                await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
              }
              if (data?.status === "ended") cleanup();
            } catch {}
          });

          const unsubCalleeC = onSnapshot(collection(callDoc, "calleeCandidates"), async (ss) => {
            for (const ch of ss.docChanges()) {
              if (ch.type !== "added") continue;
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
          });

          watchUnsubsRef.current = [unsubAns, unsubCalleeC];
        } else if (role === "callee" && incoming?.callPath) {
          const callDoc = doc(db, incoming.callPath);
          setCallDocRef(callDoc);

          const calleeCandCol = collection(callDoc, "calleeCandidates");
          peer.onicecandidate = async (e) => {
            if (!e.candidate) return;
            try {
              await addDoc(calleeCandCol, { ...e.candidate.toJSON?.(), createdAt: serverTimestamp(), from: "callee" });
            } catch {}
          };

          const callSnap = await getDoc(callDoc);
          const data = callSnap.data();
          if (data?.offer && !peer.remoteDescription) {
            try { await peer.setRemoteDescription(new RTCSessionDescription(data.offer)); } catch {}
          }

          let answer = await peer.createAnswer();
          answer = { type: answer.type, sdp: preferVideoCodec(answer.sdp, "VP8") };
          await peer.setLocalDescription(answer);
          await updateDoc(callDoc, { answer, status: "in-call" });

          const unsubCallerC = onSnapshot(collection(callDoc, "callerCandidates"), async (ss) => {
            for (const ch of ss.docChanges()) {
              if (ch.type !== "added") continue;
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
          });

          const unsubDoc = onSnapshot(callDoc, (snap) => {
            const d = snap.data();
            if (d?.status === "ended") cleanup();
          });

          watchUnsubsRef.current = [unsubCallerC, unsubDoc];
        }

        function cleanup() {
          try { watchUnsubsRef.current.forEach((u) => u && u()); } catch {}
          watchUnsubsRef.current = [];
          try { peer.close(); } catch {}
          try { localStreamRef.current?.getTracks?.().forEach((t) => t.stop()); } catch {}
          inboundRef.current = new MediaStream();
          setPc(null);
          onClose?.();
        }

        return () => {
          stopped = true;
          cleanup();
        };
      } catch (e) {
        console.error("Video setup error", e);
        if (e?.name === "NotFoundError" || e?.code === "NO_DEVICES") {
          alert("No camera/microphone was found on this device.");
        } else if (e?.name === "NotAllowedError") {
          alert("Permission denied. Allow camera & mic and try again.");
        } else if (e?.code === "MEDIA_API_UNAVAILABLE") {
          alert("This page doesn’t allow getUserMedia. Use HTTPS or http://localhost.");
        } else {
          alert("Could not start camera/microphone. See console for details.");
        }
        onClose?.();
      }
    })();
  }, [open, role, me, peerId, threadId, incoming, onClose, remoteMuted]);

  async function hangUp() {
    setStatus("Ending…");
    try { if (callDocRef) await updateDoc(callDocRef, { status: "ended" }); } catch {}
    onClose?.();
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
          {/* Remote tile */}
          <div style={{ position: "relative" }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={remoteMuted}
              style={{ width: "100%", height: 420, background: "#000", borderRadius: 10 }}
              onLoadedMetadata={() => startRemotePlayback()}
            />
            {needsTap && (
              <button
                onClick={() => startRemotePlayback()}
                style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)", border: "none", color: "#fff", fontWeight: 800, fontSize: 16, borderRadius: 10, cursor: "pointer" }}
                title="Start remote video"
              >
                Click to start video
              </button>
            )}
            <button
              onClick={() => { setRemoteMuted((m) => !m); setTimeout(() => startRemotePlayback(), 0); }}
              style={{ position: "absolute", right: 10, bottom: 10, border: "none", background: "rgba(0,0,0,.55)", color: "#fff", padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}
              title={remoteMuted ? "Unmute" : "Mute"}
            >
              {remoteMuted ? "Unmute" : "Mute"}
            </button>
          </div>

          {/* Local mirror */}
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

  const peerId = params.uid || null;

  const [threads, setThreads] = useState([]);
  const [userCache, setUserCache] = useState({});

  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const [showEmoji, setShowEmoji] = useState(false);

  const [showCall, setShowCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);

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

        // Fetch left-list user info
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
                const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || "User";
                const photo =
                  !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : d.photo;
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

  const peer = useMemo(() => userCache[peerId] || null, [userCache, peerId]);

  useEffect(() => {
    (async () => {
      if (!peerId || userCache[peerId]) return;
      const us = await getDoc(doc(db, "Users", peerId));
      if (us.exists()) {
        const d = us.data();
        const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || "User";
        const photo =
          !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : d.photo;
        setUserCache((p) => ({ ...p, [peerId]: { name, photo } }));
      } else {
        setUserCache((p) => ({ ...p, [peerId]: { name: "User", photo: FALLBACK_IMAGE } }));
      }
    })();
  }, [peerId, userCache]);

  useEffect(() => {
    if (!me || !peerId) return;
    const tid = threadIdFor(me, peerId);
    const tRef = doc(db, "Messages", tid);
    (async () => {
      try {
        await updateDoc(tRef, { [`unread.${me}`]: 0 });
      } catch {}
    })();
  }, [me, peerId]);

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

  const myThreads = useMemo(() => threads, [threads]);

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
