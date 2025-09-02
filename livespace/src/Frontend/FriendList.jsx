import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function nameFromUser(u) {
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  if (name) return name;
  if (u.email) return u.email.split("@")[0];
  return "Someone";
}

export default function FriendList({ userId, pageSize = 8 }) {
  const nav = useNavigate();
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // accepted both directions
        const frRef = collection(db, "FriendRequests");
        const [fromSnap, toSnap] = await Promise.all([
          getDocs(query(frRef, where("fromId", "==", userId), where("status", "==", "accepted"))),
          getDocs(query(frRef, where("toId", "==", userId), where("status", "==", "accepted"))),
        ]);

        const ids = new Set();
        fromSnap.forEach((d) => ids.add(d.data().toId));
        toSnap.forEach((d) => ids.add(d.data().fromId));

        const picked = Array.from(ids).slice(0, pageSize);

        const results = await Promise.all(
          picked.map(async (id) => {
            try {
              const s = await getDoc(doc(db, "Users", id));
              if (!s.exists()) return null;
              const u = s.data();
              const photo =
                !u.photo || u.photo === "" || u.photo === FIREBASE_DEFAULT_IMAGE
                  ? FALLBACK_IMAGE
                  : u.photo;
              return { id, name: nameFromUser(u), photo };
            } catch {
              return null;
            }
          })
        );

        if (mounted) setFriends(results.filter(Boolean));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId, pageSize]);

  if (loading && friends.length === 0) {
    return (
      <div className="friends-grid">
        {Array.from({ length: Math.min(8, pageSize) }).map((_, i) => (
          <div className="friend-card skeleton" key={i}>
            <div className="friend-img-skel" />
            <div className="friend-name-skel" />
          </div>
        ))}
      </div>
    );
  }

  if (friends.length === 0) {
    return <div className="muted">No friends yet.</div>;
  }

  return (
    <div className="friends-grid">
      {friends.map((f) => (
        <button
          key={f.id}
          className="friend-card"
          onClick={() => nav(`/profile/${f.id}`)}
          title={f.name}
        >
          <img className="friend-img" src={f.photo} alt={f.name} loading="lazy" />
          <div className="friend-name">{f.name}</div>
        </button>
      ))}
    </div>
  );
}
