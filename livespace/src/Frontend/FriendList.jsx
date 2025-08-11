// FriendList.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  documentId
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

// helper: split array into chunks of size N
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function FriendList({ userId, pageSize = 5, max }) {
  // `pageSize` controls how many to show per page (default 5).
  // `max` (if passed) will be ignored for layout, but kept for backward compat.
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // compute paging
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(friends.length / pageSize)),
    [friends.length, pageSize]
  );
  const visible = useMemo(
    () => friends.slice(page * pageSize, page * pageSize + pageSize),
    [friends, page, pageSize]
  );

  // reset page when switching profiles
  useEffect(() => setPage(0), [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    let fromSet = new Set(); // docs where fromId == userId  → friend is toId
    let toSet = new Set();   // docs where toId == userId    → friend is fromId

    async function loadUsersByIds(ids) {
      if (!alive) return;

      if (ids.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // fetch all friends (so arrows can page through all)
      const usersCol = collection(db, "Users");
      const chunks = chunk(ids, 10); // Firestore "in" supports up to 10 ids

      const snaps = await Promise.all(
        chunks.map((c) => getDocs(query(usersCol, where(documentId(), "in", c))))
      );

      const list = [];
      snaps.forEach((snap) => {
        snap.forEach((d) => {
          const data = d.data();
          const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
          const photo =
            !data.photo || data.photo === "" || data.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : data.photo;
          list.push({ id: d.id, name, photo });
        });
      });

      // stable order
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      if (alive) {
        setFriends(list);
        setLoading(false);
        // clamp page if list shrank
        setPage((p) => Math.min(p, Math.max(0, Math.ceil(list.length / pageSize) - 1)));
      }
    }

    const fr = collection(db, "FriendRequests");

    const unsub1 = onSnapshot(
      query(fr, where("fromId", "==", userId), where("status", "==", "accepted")),
      (s1) => {
        fromSet = new Set(s1.docs.map((d) => String(d.data().toId)));
        const ids = Array.from(new Set([...fromSet, ...toSet]));
        loadUsersByIds(ids).catch(console.error);
      },
      (err) => console.error("FriendList fromId listener:", err)
    );

    const unsub2 = onSnapshot(
      query(fr, where("toId", "==", userId), where("status", "==", "accepted")),
      (s2) => {
        toSet = new Set(s2.docs.map((d) => String(d.data().fromId)));
        const ids = Array.from(new Set([...fromSet, ...toSet]));
        loadUsersByIds(ids).catch(console.error);
      },
      (err) => console.error("FriendList toId listener:", err)
    );

    return () => {
      alive = false;
      unsub1();
      unsub2();
    };
  }, [userId, pageSize]);

  const arrowStyle = {
    width: 28,
    height: 28,
    lineHeight: "26px",
    textAlign: "center",
    borderRadius: "50%",
    border: "1px solid #1ee6a9",
    background: "transparent",
    color: "#1ee6a9",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 16
  };

  if (loading) {
    return <p style={{ fontSize: 13, color: "#777" }}>Loading friends…</p>;
  }

  if (friends.length === 0) {
    return <p style={{ fontSize: 13, color: "#777" }}>No friends yet.</p>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Left arrow (hidden placeholder when on first page to keep layout) */}
      {page > 0 ? (
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label="Previous friends"
          style={arrowStyle}
        >
          ‹
        </button>
      ) : (
        <div style={{ width: 28 }} />
      )}

      {/* 5 avatars, spaced */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          justifyContent: "space-between"
        }}
      >
        {visible.map((f) => (
          <Link
            key={f.id}
            to={`/profile/${f.id}`}
            title={f.name || "View profile"}
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              textDecoration: "none"
            }}
          >
            <img
              src={f.photo}
              alt={f.name || "Friend"}
              loading="lazy"
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
              }}
            />
          </Link>
        ))}
        {/* pad so row width stays even if fewer than pageSize */}
        {Array.from({ length: Math.max(0, pageSize - visible.length) }).map((_, i) => (
          <div key={`pad-${i}`} style={{ width: 44, height: 44 }} />
        ))}
      </div>

      {/* Right arrow (hidden placeholder when on last page) */}
      {page < totalPages - 1 ? (
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          aria-label="Next friends"
          style={arrowStyle}
        >
          ›
        </button>
      ) : (
        <div style={{ width: 28 }} />
      )}
    </div>
  );
}
