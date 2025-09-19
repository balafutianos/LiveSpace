// src/Frontend/FeedSidebar.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "./firebase";
import {
  collection,
  doc,               // <-- needed for Users/{uid}
  onSnapshot,
  query,
  where,
  orderBy,
  limit as qlimit,
} from "firebase/firestore";
import "./FeedSidebar.css";

const FALLBACK = "https://i.imgur.com/qzsiOuh.png";

export default function FeedSidebar({ currentUserId }) {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const [me, setMe] = useState({ id: "", name: "", photo: FALLBACK });
  const [friendReqCount, setFriendReqCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);

  // Subscribe only to my Users/{uid} doc for name (first+last) and profile photo
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const uid = u.uid;

    const unsub = onSnapshot(doc(db, "Users", uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        const fullName =
          `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
          data.displayName ||
          (data.email?.split?.("@")?.[0] || "Me");

        setMe({
          id: uid,
          name: fullName,
          photo: data.photo || FALLBACK,
        });
      } else {
        setMe({
          id: uid,
          name: u.displayName || u.email?.split("@")[0] || "Me",
          photo: u.photoURL || FALLBACK,
        });
      }
    });

    return () => unsub();
  }, []);

  // Friend requests (pending, for me)
  useEffect(() => {
    if (!currentUserId) return;
    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(qy, (snap) => setFriendReqCount(snap.size));
    return unsub;
  }, [currentUserId]);

  // Unread messages (threads that include me and have unread for me)
  useEffect(() => {
    if (!currentUserId) return;
    const qy = query(
      collection(db, "Messages"),
      where("userIds", "array-contains", currentUserId)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const count = snap.docs.reduce((acc, d) => {
        const data = d.data() || {};
        if (Array.isArray(data.unread)) {
          return acc + (data.unread.includes(currentUserId) ? 1 : 0);
        }
        if (data.unread && typeof data.unread === "object") {
          return acc + ((data.unread[currentUserId] || 0) > 0 ? 1 : 0);
        }
        return acc;
      }, 0);
      setUnreadMsgCount(count);
    });
    return unsub;
  }, [currentUserId]);

  // Events: upcoming where I'm an attendee
  // Expected doc: { title, startAt: Timestamp, attendees: [uid,...] }
  useEffect(() => {
    if (!currentUserId) return;
    const now = new Date();
    const qy = query(
      collection(db, "Events"),
      where("attendees", "array-contains", currentUserId),
      where("startAt", ">=", now),
      orderBy("startAt", "asc"),
      qlimit(20)
    );
    const unsub = onSnapshot(qy, (snap) => setUpcomingCount(snap.size));
    return unsub;
  }, [currentUserId]);

  const Item = ({ label, to, icon, badge = 0 }) => {
    const active = pathname === to;
    return (
      <button
        className={`ls-item ${active ? "active" : ""}`}
        onClick={() => nav(to)}
      >
        <span className="ls-ic" aria-hidden="true">{icon}</span>
        <span className="ls-text">{label}</span>
        {badge > 0 && <span className="ls-badge">{badge}</span>}
      </button>
    );
  };

  return (
    <aside className="ls-wrap">
      <div className="ls-me" onClick={() => nav(`/profile/${currentUserId}`)}>
        <img src={me.photo || FALLBACK} alt="Me" />
        <div className="ls-me-name">{me.name || "Profile"}</div>
      </div>

      <Item
        label="Profile"
        to={`/profile/${currentUserId}`}
        icon={
          <svg viewBox="0 0 24 24">
            <path
              d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-4.33 0-8 2.17-8 4.5V21h16v-2.5C20 16.17 16.33 14 12 14z"
              fill="currentColor"
            />
          </svg>
        }
      />

      <Item
        label="Photos"
        to="/photos"
        icon={
          <svg viewBox="0 0 24 24">
            <path
              d="M21 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-1 12H4l4.5-6 3.5 4.5 2.5-3L20 17z"
              fill="currentColor"
            />
          </svg>
        }
      />

      <Item
        label="Friend Requests"
        to="/friends"
        badge={friendReqCount}
        icon={
          <svg viewBox="0 0 24 24">
            <path
              d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.67 0-8 1.34-8 4v2h10v-2c0-2.66-5.33-4-8-4zm8 0c-.3 0-.63.02-1 .05 1.16.84 2 1.96 2 3.45V19h7v-2c0-2.66-5.33-4-8-4z"
              fill="currentColor"
            />
          </svg>
        }
      />

      <Item
        label="Messages"
        to="/messages"
        badge={unreadMsgCount}
        icon={
          <svg viewBox="0 0 24 24">
            <path
              d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
              fill="currentColor"
            />
          </svg>
        }
      />

      <Item
        label="Calendar"
        to="/events"
        badge={upcomingCount}
        icon={
          <svg viewBox="0 0 24 24">
            <path
              d="M7 2v2H5a2 2 0 0 0-2 2v2h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm14 8H3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10z"
              fill="currentColor"
            />
          </svg>
        }
      />
    </aside>
  );
}
