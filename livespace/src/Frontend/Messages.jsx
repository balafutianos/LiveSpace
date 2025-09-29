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
  deleteDoc, // <-- ADDED
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./Messages.css";

// OPTIONAL: only if you added the emoji keyboard files I gave you.
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

async function deleteMessage(threadId, messageId) {
  await deleteDoc(doc(db, "Messages", threadId, "Items", messageId));
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
    <div className="vc-controls">
      <button
        onClick={() => {
          toggle("video");
          setCamOn((v) => !v);
        }}
        className="btn btn--ghost"
      >
        {camOn ? "Turn camera off" : "Turn camera on"}
      </button>
      <button
        onClick={() => {
          toggle("audio");
          setMicOn((v) => !v);
        }}
        className="btn btn--ghost"
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

    try {
      const tRef = await ensureThreadDoc(me, peerId);
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

    const label =
      reason === "declined" ? "❌ Call declined" :
      reason === "ended" ? "📴 Call ended" :
      "📴 Call finished";
    await writeThreadMarker(label);

    onClose?.();
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (incomingRef) {
      startAsCallee(incomingRef).catch((e) => {
        console.error(e);
        setError(e.message || "Failed to answer");
      });
    } else {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingRef]);

  return (
    <div className="vc-overlay">
      <div className="vc-card">
        <div className="vc-card__top">
          <div className="vc-title">
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
          <button onClick={() => endCall("ended")} className="btn btn--danger">Hang up</button>
        </div>

        <div className="vc-body">
          <div className="vc-video">
            <video ref={remoteVideoRef} autoPlay playsInline className="vc-video__remote" />
            <video ref={localVideoRef} autoPlay muted playsInline className="vc-video__local" />
          </div>

          <div className="vc-side">
            <div className="vc-side__title">Controls</div>
            <CallControls localStreamRef={localStreamRef} />
            {error && <div className="vc-error">⚠ {error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Messages Component
   =========================== */

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
  const [answerRef, setAnswerRef] = useState(null);

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

  // ADDED: ensure my own profile is in cache (for avatar next to my messages)
  useEffect(() => {
    (async () => {
      if (!me || userCache[me]) return;
      try {
        const us = await getDoc(doc(db, "Users", me));
        if (us.exists()) {
          const d = us.data();
          const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || "Me";
          const photo =
            !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE ? FALLBACK_IMAGE : d.photo;
          setUserCache((p) => ({ ...p, [me]: { name, photo } }));
        } else {
          const photo = auth.currentUser?.photoURL || FALLBACK_IMAGE;
          setUserCache((p) => ({ ...p, [me]: { name: "Me", photo } }));
        }
      } catch {
        const photo = auth.currentUser?.photoURL || FALLBACK_IMAGE;
        setUserCache((p) => ({ ...p, [me]: { name: "Me", photo } }));
      }
    })();
  }, [me, userCache]);

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

  // Decline incoming call
  async function declineIncoming() {
    try {
      if (incomingCall?.ref) {
        await updateDoc(incomingCall.ref, { status: "declined", declinedBy: me });

        const path = incomingCall.ref.path.split("/");
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

  /* ========= fancy grouping helpers ========= */

  const normalized = useMemo(() => {
    return msgs
      .filter(Boolean)
      .map((m) => ({
        ...m,
        _ts: typeof m?.createdAt?.toMillis === "function" ? m.createdAt.toMillis() : null,
        _date: toDate(m?.createdAt),
        _isMine: m.senderId === me,
      }))
      .sort((a, b) => (a._ts ?? 0) - (b._ts ?? 0));
  }, [msgs, me]);

  const startedOn = useMemo(() => {
    if (!normalized.length) return null;
    return formatFullDate(normalized[0]._date);
  }, [normalized]);

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return d;
  }, []);

  const { earlier, newer } = useMemo(() => {
    const earlier = [];
    const newer = [];
    for (const m of normalized) {
      (m._date < cutoffDate ? earlier : newer).push(m);
    }
    return { earlier, newer };
  }, [normalized, cutoffDate]);

  const groupedEarlier = useMemo(() => groupByDay(earlier), [earlier]);
  const groupedNewer = useMemo(() => groupByDay(newer), [newer]);

  const listRef = useRef(null);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [groupedNewer.length, peerId]);

  // ADDED: delete my message handler
  async function handleDeleteMessage(message) {
    if (!me || !peerId || !message?.id) return;
    if (message.senderId !== me) return; // only allow deleting my own messages
    const ok = window.confirm("Delete this message?");
    if (!ok) return;
    try {
      const tid = threadIdFor(me, peerId);
      const mRef = doc(db, "Messages", tid, "Items", message.id);
      await deleteDoc(mRef);
      // intentionally not touching thread.lastText/lastAt to avoid changing existing behavior
    } catch (e) {
      console.error("delete message error:", e);
      alert("Could not delete the message.");
    }
  }

  return (
    <div className="msg-layout">
      {/* LEFT: Conversations list */}
      <aside className="threads">
        <div className="threads__title">Conversations</div>
        {myThreads.length === 0 ? (
          <div className="threads__empty">No conversations yet.</div>
        ) : (
          myThreads.map((t) => {
            const other = (t.userIds || []).find((u) => u !== me);
            const meta = userCache[other] || {};
            const unread = t?.unread?.[me] || 0;

            const timeLabel =
              typeof t?.lastAt?.toMillis === "function"
                ? new Date(t.lastAt.toMillis()).toLocaleTimeString()
                : "";

            const active = other === peerId;

            return (
              <button
                key={t.id}
                onClick={() => navigate(`/messages/${other}`)}
                className={`thread ${active ? "is-active" : ""}`}
              >
                <img
                  src={meta.photo || FALLBACK_IMAGE}
                  alt=""
                  className="thread__avatar"
                />
                <div className="thread__meta">
                  <div className="thread__top">
                    <strong className="thread__name">{meta.name || "User"}</strong>
                    <small className="thread__time">{timeLabel}</small>
                  </div>
                  <div className="thread__bottom">
                    <span className="thread__preview">{t.lastText || "New conversation"}</span>
                    {!!unread && <span className="thread__badge">{unread}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </aside>

      {/* RIGHT: Chat area */}
      <main className="chat">
        {/* Header with peer info */}
        <div className="chat__header">
          <img
            src={peer?.photo || FALLBACK_IMAGE}
            alt=""
            className="chat__avatar"
          />
          <div className="chat__titles">
            <div className="chat__name">{peer?.name || "Select a conversation"}</div>
            {peerId && <small className="chat__subtitle">Chat with {peer?.name || peerId}</small>}
          </div>

        {/* Call button */}
          <div className="chat__actions">
            {peerId && (
              <button
                type="button"
                onClick={() => {
                  setAnswerRef(null); // caller path
                  setShowCall(true);
                }}
                title="Start video call"
                className="btn btn--brand"
              >
                📹 Call
              </button>
            )}
          </div>
        </div>

        {/* Conversation start banner */}
        <div className="chat__banner">
          {startedOn ? (
            <div className="banner__pill">
              Conversation started on <strong>{startedOn}</strong>
            </div>
          ) : (
            <div className="banner__pill">No messages yet</div>
          )}
        </div>

        {/* Messages list */}
        <div className="chat__list" ref={listRef} role="log" aria-live="polite">
          {loading ? (
            <div className="chat__empty">Loading…</div>
          ) : normalized.length === 0 ? (
            <div className="chat__empty">No messages yet. Say hello 👋</div>
          ) : (
            <>
              {/* Earlier section */}
              {groupedEarlier.length > 0 && (
                <>
                  <Divider label="Earlier" />
                  {groupedEarlier.map((g) => (
                    <DayGroup
                      key={`earlier-${g.dayKey}`}
                      label={g.label}
                      items={g.items}
                      me={me}
                      userCache={userCache}           // <-- ADDED
                      onDelete={handleDeleteMessage}   // <-- ADDED
                    />
                  ))}
                </>
              )}

              {/* Newer section */}
              {groupedNewer.length > 0 && (
                <>
                  {groupedEarlier.length > 0 && <Divider label="Newer" tone="brand" />}
                  {groupedNewer.map((g) => (
                    <DayGroup
                      key={`newer-${g.dayKey}`}
                      label={g.label}
                      items={g.items}
                      me={me}
                      userCache={userCache}           // <-- ADDED
                      onDelete={handleDeleteMessage}   // <-- ADDED
                    />
                  ))}
                </>
              )}
            </>
          )}
          <div id="msg-end" />
        </div>

        {/* Composer */}
        {peerId ? (
          <div className="composer">
            <div className="composer__row">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
                className="composer__input"
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
                className="btn btn--ghost"
              >
                😊
              </button>

              <button type="button" onClick={send} className="btn btn--brand">
                Send
              </button>

              {showEmoji && (
                <div className="emoji-pop">
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
          <div className="chat__hint">Pick a conversation from the left.</div>
        )}
      </main>

      {/* Incoming call banner (global) */}
      {incomingCall && (
        <div className="incoming">
          <img
            src={incomingCall.callerMeta?.photo || FALLBACK_IMAGE}
            alt=""
            className="incoming__avatar"
          />
          <div className="incoming__meta">
            <div className="incoming__name">
              {incomingCall.callerMeta?.name || "Incoming call"}
            </div>
            <small className="incoming__sub">is calling you…</small>
          </div>
          <button onClick={acceptIncoming} className="btn btn--brand">Accept</button>
          <button onClick={declineIncoming} className="btn btn--danger">Decline</button>
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

/* ========= Subcomponents for messages ========= */

function Divider({ label, tone = "muted" }) {
  return (
    <div className={`divider divider--${tone}`}>
      <span>{label}</span>
    </div>
  );
}

function DayGroup({ label, items, me, userCache, onDelete }) { // <-- ADDED props
  return (
    <section className="day-group" aria-label={label}>
      <div className="day-group__chip">{label}</div>
      <ul className="day-group__list">
        {renderClusters(items, me, userCache, onDelete)} {/* <-- ADDED */}
      </ul>
    </section>
  );
}

function renderClusters(items, me, userCache, onDelete) { // <-- ADDED params
  const clusters = [];
  let current = null;

  for (const m of items) {
    const mine = m.senderId === me;
    if (!current || current.mine !== mine) {
      if (current) clusters.push(current);
      current = { mine, msgs: [m] };
    } else {
      current.msgs.push(m);
    }
  }
  if (current) clusters.push(current);

  return clusters.map((cluster, idx) => (
    <li key={`cluster-${idx}`} className={`msg-cluster ${cluster.mine ? "is-mine" : "is-theirs"}`}>
      <div className="msg-cluster__bubbles">
        {cluster.msgs.map((m, i) => {
  const senderMeta = userCache[m.senderId] || { photo: FALLBACK_IMAGE };
  return (
    <div key={m.id} className={`bubble-row ${cluster.mine ? "is-mine" : "is-theirs"}`}>
      {/* Avatar always on the left of the bubble */}
      <img src={senderMeta.photo || FALLBACK_IMAGE} alt="" className="bubble__avatar" />

      <Bubble
        text={m.text}
        isMine={cluster.mine}
        isFirst={i === 0}
        isLast={i === cluster.msgs.length - 1}
        time={formatTime(m._date)}
        onDelete={cluster.mine ? () => onDelete?.(m) : undefined}
      />
    </div>
  );
})}

      </div>
    </li>
  ));
}

function Bubble({ text, isMine, isFirst, isLast, time, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={[
        "bubble",
        isMine ? "bubble--mine" : "bubble--theirs",
        isFirst && "bubble--first",
        isLast && "bubble--last",
      ].filter(Boolean).join(" ")}
    >
      <p className="bubble__text">{text}</p>
      <time className="bubble__time" dateTime={time.iso}>
        {time.short}
      </time>

      {isMine && (
        <div className="bubble__actions">
          <button
            type="button"
            className="bubble__menu-btn"
            onClick={() => setShowMenu((v) => !v)}
            aria-label="Message options"
          >
            ⋯
          </button>

          {showMenu && (
            <div className="bubble__menu">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onDelete?.();
                }}
              >
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
/* ========= Utilities ========= */

function toDate(tsOrDate) {
  if (!tsOrDate) return new Date();
  if (typeof tsOrDate?.toMillis === "function") return new Date(tsOrDate.toMillis());
  if (tsOrDate instanceof Date) return tsOrDate;
  if (typeof tsOrDate === "number") return new Date(tsOrDate);
  if (typeof tsOrDate === "string") return new Date(tsOrDate);
  return new Date();
}

function formatTime(d) {
  const dt = new Date(d);
  return {
    short: dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    iso: dt.toISOString(),
  };
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(d) {
  const today = new Date();
  const yday = new Date();
  today.setHours(0, 0, 0, 0);
  yday.setHours(0, 0, 0, 0);
  yday.setDate(today.getDate() - 1);

  const X = new Date(d);
  if (sameDay(X, today)) return "Today";
  if (sameDay(X, yday)) return "Yesterday";
  return X.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatFullDate(d) {
  const X = new Date(d);
  return X.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function keyForDay(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
}

function groupByDay(items) {
  const map = new Map();
  for (const m of items) {
    const k = keyForDay(m._date);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(m);
  }
  return [...map.entries()].map(([dayKey, arr]) => ({
    dayKey,
    label: formatDayLabel(arr[0]._date),
    items: arr,
  }));
}