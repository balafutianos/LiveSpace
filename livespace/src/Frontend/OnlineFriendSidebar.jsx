// src/Frontend/OnlineFriendSidebar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { watchPresence } from "./presence";
import { useChatDock } from "./ChatDockContext";
import "./OnlineFriendSidebar.css";

const FALLBACK_AVATAR = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_AVATAR =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

const norm = (v) => String(v ?? "").trim();

function nameFromUser(u = {}) {
  const first =
    u.firstName ?? u.firstname ?? u.givenName ?? u.given_name ?? "";
  const last = u.lastName ?? u.lastname ?? u.familyName ?? u.family_name ?? "";
  const full = `${first} ${last}`.trim();
  return full || u.fullName || u.displayName || u.name || "Unknown";
}

export default function OnlineFriendSidebar() {
  const uid = norm(auth.currentUser?.uid);
  const nav = useNavigate(); // kept in case you want a “full view” button later
  const { openChat } = useChatDock();

  const [rows, setRows] = useState([]); // [{id,name,photo,online,lastActive}]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    let unsubscribers = [];
    let presenceUnsubs = [];

    const stopPresence = () => {
      presenceUnsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
      presenceUnsubs = [];
    };

    const applyFriendIds = async (idsSet) => {
      const ids = Array.from(idsSet).map(norm).filter(Boolean);

      // Fetch user docs; keep previous presence state if any
      const next = [];
      for (const fid of ids) {
        try {
          const s = await getDoc(doc(db, "Users", fid));
          if (!s.exists()) continue;
          const u = s.data() || {};
          const photo =
            !u.photo || u.photo === "" || u.photo === DEFAULT_AVATAR
              ? FALLBACK_AVATAR
              : u.photo;

          const prev = rows.find((r) => r.id === fid);
          next.push({
            id: fid,
            name: nameFromUser(u),
            photo,
            online: prev?.online || false,
            lastActive: prev?.lastActive || 0,
          });
        } catch (e) {
          console.warn("[Sidebar] failed to read Users/", fid, e);
        }
      }

      if (!alive) return;
      setRows(next);

      // (re)subscribe presence for each friend
      stopPresence();
      presenceUnsubs = next.map((row) =>
        watchPresence(row.id, (p) =>
          setRows((curr) => {
            const i = curr.findIndex((x) => x.id === row.id);
            if (i < 0) return curr;
            const copy = [...curr];
            copy[i] = { ...copy[i], ...p };
            return copy;
          })
        )
      );

      setLoading(false);
    };

    const friendIds = new Set();

    // --- Friends (array pair) ---
    try {
      const qFriends = query(
        collection(db, "Friends"),
        where("userIds", "array-contains", uid)
      );
      const uFriends = onSnapshot(qFriends, (snap) => {
        snap.docs.forEach((d) => {
          const arr = (d.data()?.userIds || []).map(norm);
          const other = arr.find((x) => x && x !== uid);
          if (other) friendIds.add(other);
        });
        applyFriendIds(friendIds);
      });
      unsubscribers.push(uFriends);
    } catch (e) {
      console.warn("[Sidebar] Friends listener failed:", e);
    }

    // --- legacy friends (directional, accepted) ---
    try {
      const qA = query(
        collection(db, "friends"),
        where("fromId", "==", uid),
        where("status", "==", "accepted")
      );
      const qB = query(
        collection(db, "friends"),
        where("toId", "==", uid),
        where("status", "==", "accepted")
      );
      const uA = onSnapshot(qA, (snap) => {
        snap.docs.forEach((d) => {
          const other = norm(d.data()?.toId);
          if (other && other !== uid) friendIds.add(other);
        });
        applyFriendIds(friendIds);
      });
      const uB = onSnapshot(qB, (snap) => {
        snap.docs.forEach((d) => {
          const other = norm(d.data()?.fromId);
          if (other && other !== uid) friendIds.add(other);
        });
        applyFriendIds(friendIds);
      });
      unsubscribers.push(uA, uB);
    } catch (e) {
      console.warn("[Sidebar] legacy friends listener failed:", e);
    }

    // --- Fallback: accepted FriendRequests (in case pair doc wasn’t created) ---
    try {
      const qR1 = query(
        collection(db, "FriendRequests"),
        where("fromId", "==", uid),
        where("status", "==", "accepted")
      );
      const qR2 = query(
        collection(db, "FriendRequests"),
        where("toId", "==", uid),
        where("status", "==", "accepted")
      );
      const uR1 = onSnapshot(qR1, (snap) => {
        snap.docs.forEach((d) => {
          const other = norm(d.data()?.toId);
          if (other && other !== uid) friendIds.add(other);
        });
        applyFriendIds(friendIds);
      });
      const uR2 = onSnapshot(qR2, (snap) => {
        snap.docs.forEach((d) => {
          const other = norm(d.data()?.fromId);
          if (other && other !== uid) friendIds.add(other);
        });
        applyFriendIds(friendIds);
      });
      unsubscribers.push(uR1, uR2);
    } catch (e) {
      console.warn("[Sidebar] FriendRequests listener failed:", e);
    }

    setLoading(true);

    return () => {
      alive = false;
      unsubscribers.forEach((u) => {
        try {
          u();
        } catch {}
      });
      stopPresence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const sorted = useMemo(() => {
    const on = rows
      .filter((r) => r.online)
      .sort((a, b) => a.name.localeCompare(b.name));
    const off = rows
      .filter((r) => !r.online)
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...on, ...off];
  }, [rows]);

  const onlineCount = rows.filter((r) => r.online).length;

  if (!uid) return null;

  return (
    <aside className="ofs-panel">
      <div className="ofs-header">Contacts · {onlineCount} online</div>

      {loading && <div className="ofs-empty">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="ofs-empty">No friends yet.</div>
      )}

      {!loading &&
        sorted.map((r) => (
          <button
            key={r.id}
            className="ofs-row"
            onClick={() => openChat({ id: r.id, name: r.name, photo: r.photo })}
            title={r.name}
          >
            <img
              className="ofs-avatar"
              src={r.photo}
              alt={r.name}
              loading="lazy"
            />
            <div className="ofs-main">
              <div className="ofs-name">{r.name}</div>
              <div className="ofs-sub">{r.online ? "Online" : "Offline"}</div>
            </div>
            <span
              className="ofs-dot"
              style={{ background: r.online ? "#22c55e" : "#64748b" }}
            />
          </button>
        ))}
    </aside>
  );
}
