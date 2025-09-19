// src/Frontend/FriendRequests.jsx
import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";
 import "./FriendRequests.css";

const FALLBACK = "https://i.imgur.com/qzsiOuh.png";

/* ---------- small hook to fetch a mini user ---------- */
function useMiniUser(uid) {
  const [mini, setMini] = useState(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      try {
        const s = await getDoc(doc(db, "Users", uid));
        if (!alive) return;
        if (s.exists()) {
          const u = s.data() || {};
          const name =
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            u.displayName ||
            (u.email || "").split("@")[0] ||
            "Someone";
          const photo = u.photo || FALLBACK;
          setMini({ name, photo });
        } else {
          setMini({ name: "Someone", photo: FALLBACK });
        }
      } catch {
        setMini({ name: "Someone", photo: FALLBACK });
      }
    })();
    return () => { alive = false; };
  }, [uid]);
  return mini;
}

/* ---------- row components (hooks belong here, not in map) ---------- */
function IncomingRow({ req, busy, onAccept, onDecline }) {
  const mini = useMiniUser(req.fromId);
  return (
    <li className="fr-row">
      <img className="fr-avatar" src={mini?.photo || FALLBACK} alt="" />
      <div className="fr-main">
        <div className="fr-name">{mini?.name || "Someone"}</div>
        <div className="fr-sub">{req.fromEmail || ""}</div>
      </div>
      <div className="fr-actions">
        <button className="btn btn-primary" onClick={() => onAccept(req)} disabled={busy}>
          Accept
        </button>
        <button className="btn btn-ghost" onClick={() => onDecline(req)} disabled={busy}>
          Decline
        </button>
      </div>
    </li>
  );
}

function OutgoingRow({ req, busy, onCancel }) {
  const mini = useMiniUser(req.toId);
  return (
    <li className="fr-row">
      <img className="fr-avatar" src={mini?.photo || FALLBACK} alt="" />
      <div className="fr-main">
        <div className="fr-name">{mini?.name || "Someone"}</div>
        <div className="fr-sub">{req.toEmail || ""}</div>
      </div>
      <div className="fr-actions">
        <button className="btn btn-ghost" onClick={() => onCancel(req)} disabled={busy}>
          Cancel
        </button>
      </div>
    </li>
  );
}

/* ---------- page ---------- */
export default function FriendRequests() {
  const uid = auth.currentUser?.uid;

  const [incoming, setIncoming] = useState([]); // toId==me & pending
  const [outgoing, setOutgoing] = useState([]); // fromId==me & pending
  const [busyId, setBusyId] = useState(null);

  // live incoming
  useEffect(() => {
    if (!uid) return;
    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", uid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qy, (snap) =>
      setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [uid]);

  // live outgoing
  useEffect(() => {
    if (!uid) return;
    const qy = query(
      collection(db, "FriendRequests"),
      where("fromId", "==", uid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qy, (snap) =>
      setOutgoing(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [uid]);

  const accept = async (req) => {
    try {
      setBusyId(req.id);
      await updateDoc(doc(db, "FriendRequests", req.id), { status: "accepted" });
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (req) => {
    try {
      setBusyId(req.id);
      await updateDoc(doc(db, "FriendRequests", req.id), { status: "declined" });
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (req) => {
    try {
      setBusyId(req.id);
      await updateDoc(doc(db, "FriendRequests", req.id), { status: "cancelled" });
    } finally {
      setBusyId(null);
    }
  };

  const empty = incoming.length === 0 && outgoing.length === 0;

  return (
    <div className="fr-page">
      <h2 className="fr-title">Friend Requests</h2>

      {empty && <div className="fr-empty">No pending requests.</div>}

      {incoming.length > 0 && (
        <section className="fr-section">
          <h3 className="fr-h3">Incoming</h3>
          <ul className="fr-list">
            {incoming.map((r) => (
              <IncomingRow
                key={r.id}
                req={r}
                busy={busyId === r.id}
                onAccept={accept}
                onDecline={decline}
              />
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="fr-section">
          <h3 className="fr-h3">Sent</h3>
          <ul className="fr-list">
            {outgoing.map((r) => (
              <OutgoingRow
                key={r.id}
                req={r}
                busy={busyId === r.id}
                onCancel={cancel}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
