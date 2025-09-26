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

// TURN/STUN config provided
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

function sortPair(a, b) {
  return [a, b].sort();
}
function threadIdFor(a, b) {
  const [x, y] = sortPair(a, b);
  return `${x}_${y}`;
}

/* ===========================
   Shared Firestore helper
   =========================== */
async function ensureThreadDoc(meUid, otherUid) {
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

/* ===========================
   Inline Video Call Components
   =========================== */

function CallControls({ localStreamRef }) {
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  function toggle(kind) {
    const tracks = localStreamRef.current?.getTracks() || [];
    tracks
      .filter((t) => t.kind === kind)
      .forEach((t) => {
        t.enabled = !t.enabled;
      });
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        onClick={() => {
          toggle("video");
          setCamOn((v) => !v);
        }}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #1f2a44",
          background: "#101a33",
          color: "#cde3ff",
          cursor: "pointer",
        }}
      >
        {camOn ? "Turn camera off" : "Turn camera on"}
      </button>
      <button
        onClick={() => {
          toggle("audio");
          setMicOn((v) => !v);
        }}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid #1f2a44",
          background: "#101a33",
          color: "#cde3ff",
          cursor: "pointer",
        }}
      >
        {micOn ? "Mute" : "Unmute"}
      </button>
    </div>
  );
}

/**
 * VideoCall
 * - Caller: incomingRef == null -> create offer
 * - Callee: incomingRef is a Calls doc ref -> read offer, create answer
 */
function VideoCall({ me, peerId, onClose, incomingRef = null }) {
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(incomingRef ? "incoming" : "init"); // incoming | init | ringing | connecting | in-call | ended
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const callDocRef = useRef(null);
  const unsubscribers = useRef([]);
  const startedRef = useRef(false); // StrictMode guard

  async function setupRTCPeer() {
    const pc = new RTCPeerConnection(TURN_CONFIG);

    pc.onicecandidate = async (event) => {
      if (event.candidate && callDocRef.current) {
        try {
          await addDoc(collection(callDocRef.current, "candidates"), {
            fromId: me,
            candidate: event.candidate.toJSON(),
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("add candidate failed", e);
        }
      }
    };

    // Use the remote stream provided by the event directly (avoids black video)
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    pcRef.current = pc;
  }

  async function writeThreadMarker(label) {
    try {
      const cRef = callDocRef.current;
      if (!cRef) return;
      const path = cRef.path.split("/"); // ["Messages", "{tid}", "Calls", "{callId}"]
      const tid = path[1];
      const tRef = doc(db, "Messages", tid);
      await addDoc(collection(tRef, "Items"), {
        senderId: me,
        text: label,
        createdAt: serverTimestamp(),
      });
      await updateDoc(tRef, { lastText: label, lastAt: serverTimestamp() });
    } catch (e) {
      console.warn("could not write thread marker", e);
    }
  }

  async function startAsCaller() {
    setStatus("ringing");

    // Ensure the thread doc exists so Calls rules pass (isParticipant())
    try {
      const tRef = await ensureThreadDoc(me, peerId);
      // Ring message visible in-thread
      await addDoc(collection(tRef, "Items"), {
        senderId: me,
        text: "📞 Calling…",
        createdAt: serverTimestamp(),
      });
      await updateDoc(tRef, { lastText: "📞 Calling…", lastAt: serverTimestamp() });
    } catch (e) {
      console.warn("ensureThread/ring message failed", e);
    }

    await setupRTCPeer();

    const tid = threadIdFor(me, peerId);
    const callsCol = collection(db, "Messages", tid, "Calls");
    const callDoc = await addDoc(callsCol, {
      callerId: me,
      calleeId: peerId,
      status: "ringing",
      createdAt: serverTimestamp(),
    });
    callDocRef.current = callDoc;

    const unsub1 = onSnapshot(callDoc, async (snap) => {
      const data = snap.data();
      if (data?.answer && pcRef.current && pcRef.current.signalingState !== "closed") {
        const answer = new RTCSessionDescription(data.answer);
        if (!pcRef.current.currentRemoteDescription) {
          await pcRef.current.setRemoteDescription(answer);
          setStatus("in-call");
        }
      }
      if (data?.status === "ended" || data?.status === "declined") endCall(data.status);
    });

    const candCol = collection(callDoc, "candidates");
    const unsub2 = onSnapshot(candCol, async (snap) => {
      const pc = pcRef.current;
      if (!pc) return;
      snap
        .docChanges()
        .filter((c) => c.type === "added" && c.doc.data()?.fromId !== me)
        .forEach(async (c) => {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c.doc.data().candidate));
          } catch (e) {
            console.warn("addIceCandidate error", e);
          }
        });
    });

    unsubscribers.current.push(unsub1, unsub2);

    const offer = await pcRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pcRef.current.setLocalDescription(offer);
    await updateDoc(callDoc, { offer: { type: offer.type, sdp: offer.sdp }, status: "connecting" });
  }

  async function startAsCallee(callDoc) {
    setStatus("connecting");
    callDocRef.current = callDoc;
    await setupRTCPeer();

    const candCol = collection(callDoc, "candidates");
    const unsubCand = onSnapshot(candCol, async (snap) => {
      const pc = pcRef.current;
      if (!pc) return;
      snap
        .docChanges()
        .filter((c) => c.type === "added" && c.doc.data()?.fromId !== me)
        .forEach(async (c) => {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c.doc.data().candidate));
          } catch (e) {
            console.warn("addIceCandidate error", e);
          }
        });
    });

    unsubscribers.current.push(unsubCand);

    const snap = await getDoc(callDoc);
    const data = snap.data();
    if (!data?.offer) {
      setError("No offer found");
      return;
    }
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pcRef.current.createAnswer();
    await pcRef.current.setLocalDescription(answer);
    await updateDoc(callDoc, { answer: { type: answer.type, sdp: answer.sdp }, status: "in-call" });

    const unsubEnd = onSnapshot(callDoc, (s) => {
      const st = s.data()?.status;
      if (st === "ended" || st === "declined") endCall(st);
    });
    unsubscribers.current.push(unsubEnd);
  }

  function stopStreams() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function endCall(reason = "ended") {
    setStatus("ended");
    try {
      if (callDocRef.current) {
        await updateDoc(callDocRef.current, { status: reason });
      }
    } catch {}
    try {
      pcRef.current?.getSenders()?.forEach((s) => {
        try {
          s.track?.stop();
        } catch {}
      });
      pcRef.current?.close();
    } catch {}
    unsubscribers.current.forEach((u) => u && u());
    unsubscribers.current = [];
    stopStreams();

    // Thread marker
    const label =
      reason === "declined" ? "❌ Call declined" :
      reason === "ended" ? "📴 Call ended" :
      "📴 Call finished";
    await writeThreadMarker(label);

    onClose?.();
  }

  // Start once (caller or callee). StrictMode-safe silent cleanup.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (incomingRef) {
      // Callee path
      startAsCallee(incomingRef).catch((e) => {
        console.error(e);
        setError(e.message || "Failed to answer");
      });
    } else {
      // Caller path
      startAsCaller().catch((e) => {
        console.error(e);
        setError(e.message || "Failed to start call");
      });
    }

    return () => {
      try { pcRef.current?.close(); } catch {}
      stopStreams();
      unsubscribers.current.forEach((u) => u && u());
      unsubscribers.current = [];
      // No onClose() / status write here (StrictMode test unmount)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingRef]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div style={{ width: 920, maxWidth: "95vw", background: "#0b1220", borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 14px",
            color: "#cde3ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {status === "incoming"
              ? "Incoming call"
              : status === "ringing"
              ? "Calling…"
              : status === "connecting"
              ? "Connecting…"
              : status === "in-call"
              ? "In call"
              : status === "ended"
              ? "Call ended"
              : "Video Call"}
          </div>
          <button
            onClick={() => endCall("ended")}
            style={{
              background: "#ff4d4f",
              border: "none",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Hang up
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 8, padding: 8 }}>
          <div style={{ position: "relative", background: "#000", borderRadius: 8, overflow: "hidden", minHeight: 420 }}>
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                width: 180,
                height: 120,
                objectFit: "cover",
                borderRadius: 8,
                boxShadow: "0 6px 20px rgba(0,0,0,.35)",
              }}
            />
          </div>

          <div style={{ color: "#cde3ff" }}>
            <div style={{ marginBottom: 8, fontWeight: 700 }}>Controls</div>
            <CallControls localStreamRef={localStreamRef} />
            {error && <div style={{ marginTop: 12, color: "#ffb3b3" }}>⚠ {error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Original Messages Component
   =========================== */

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

  // Video call states
  const [showCall, setShowCall] = useState(false);         // open overlay
  const [incomingCall, setIncomingCall] = useState(null);  // { ref, data, callerMeta }
  const [answerRef, setAnswerRef] = useState(null);        // Calls doc ref for callee

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
    const q = query(collection(db, "Messages"), where("userIds", "array-contains", me));
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
        const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || "User";
        const photo =
          !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : d.photo;
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

  async function send() {
    const body = (text || "").trim();
    if (!me || !peerId || !body) return;

    try {
      const tRef = await ensureThreadDoc(me, peerId);
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
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
    });
  }

  /* ===== Incoming call listener (per-thread, no collectionGroup) ===== */
  useEffect(() => {
    if (!me || threads.length === 0) return;
    const unsubs = [];
    threads.forEach((t) => {
      const callsCol = collection(db, "Messages", t.id, "Calls");
      const qy = query(callsCol, orderBy("createdAt", "desc"), qlimit(1));
      const u = onSnapshot(qy, async (snap) => {
        const d = snap.docs[0];
        if (!d) return;
        const data = d.data();
        if (data?.calleeId !== me) return;
        if (!["ringing", "connecting"].includes(data?.status)) return;

        // fetch caller profile (try cache first)
        let callerMeta = { name: "User", photo: FALLBACK_IMAGE };
        const callerId = data.callerId;
        if (callerId) {
          if (userCache[callerId]) {
            callerMeta = userCache[callerId];
          } else {
            try {
              const us = await getDoc(doc(db, "Users", callerId));
              if (us.exists()) {
                const dd = us.data();
                callerMeta = {
                  name: `${dd.firstName || ""} ${dd.lastName || ""}`.trim() || dd.email || "User",
                  photo:
                    !dd.photo || dd.photo === "" || dd.photo === FIREBASE_DEFAULT_IMAGE
                      ? FALLBACK_IMAGE
                      : dd.photo,
                };
              }
            } catch {}
          }
        }
        setIncomingCall({ ref: d.ref, data, callerMeta });
      });
      unsubs.push(u);
    });
    return () => unsubs.forEach((u) => u && u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, threads.map((t) => t.id).join(","), userCache]);

  // Accept incoming call
  async function acceptIncoming() {
    if (!incomingCall) return;
    setAnswerRef(incomingCall.ref);
    const callerId = incomingCall.data?.callerId;
    setIncomingCall(null);
    if (callerId && peerId !== callerId) {
      navigate(`/messages/${callerId}`);
    }
    setShowCall(true);
  }

  // Decline incoming call (also write a small marker in the thread)
  async function declineIncoming() {
    try {
      if (incomingCall?.ref) {
        await updateDoc(incomingCall.ref, { status: "declined", declinedBy: me });

        const path = incomingCall.ref.path.split("/"); // ["Messages", "{tid}", "Calls", "{id}"]
        const tid = path[1];
        const tRef = doc(db, "Messages", tid);
        await addDoc(collection(tRef, "Items"), {
          senderId: me,
          text: "❌ Call declined",
          createdAt: serverTimestamp(),
        });
        await updateDoc(tRef, { lastText: "❌ Call declined", lastAt: serverTimestamp() });
      }
    } catch {}
    setIncomingCall(null);
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
                    <strong
                      style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
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

          {/* Call button */}
          <div style={{ marginLeft: "auto" }}>
            {peerId && (
              <button
                type="button"
                onClick={() => {
                  setAnswerRef(null); // caller path
                  setShowCall(true);
                }}
                title="Start video call"
                style={{
                  border: "none",
                  background: "#27D496",
                  color: "#052023",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                📹 Call
              </button>
            )}
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

      {/* Incoming call banner (global) */}
      {incomingCall && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            background: "#0b1220",
            color: "#cde3ff",
            border: "1px solid #1f2a44",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,.25)",
            padding: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            zIndex: 10000,
            maxWidth: 360,
          }}
        >
          <img
            src={incomingCall.callerMeta?.photo || FALLBACK_IMAGE}
            alt=""
            style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {incomingCall.callerMeta?.name || "Incoming call"}
            </div>
            <small style={{ opacity: 0.8 }}>is calling you…</small>
          </div>
          <button
            onClick={acceptIncoming}
            style={{
              border: "none",
              background: "#27D496",
              color: "#052023",
              borderRadius: 8,
              padding: "8px 10px",
              fontWeight: 700,
              cursor: "pointer",
              marginRight: 6,
            }}
          >
            Accept
          </button>
          <button
            onClick={declineIncoming}
            style={{
              border: "none",
              background: "#ff4d4f",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Decline
          </button>
        </div>
      )}

      {/* Video call overlay */}
      {showCall && (peerId || answerRef) && (
        <VideoCall
          me={me}
          peerId={peerId || incomingCall?.data?.callerId || null}
          incomingRef={answerRef}
          onClose={() => {
            setShowCall(false);
            setAnswerRef(null);
          }}
        />
      )}
    </div>
  );
}
