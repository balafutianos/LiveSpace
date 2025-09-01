// Navbar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import "./navbar-dark.css";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

/**
 * Props (all optional except currentUserId when logged in):
 * - currentUserId
 * - searchTerm, setSearchTerm, handleSearch, searchResults
 */
export default function Navbar({
  currentUserId,
  searchTerm = "",
  setSearchTerm = () => {},
  handleSearch = () => {},
  searchResults = [],
}) {
  const navigate = useNavigate();

  // my mini profile
  const [me, setMe] = useState(null);

  // UI
  const [openSearch, setOpenSearch] = useState(false);
  const [openFriends, setOpenFriends] = useState(false);
  const [openNotifs, setOpenNotifs] = useState(false);

  // data
  const [pendingReqs, setPendingReqs] = useState([]); // FriendRequests → to me, status=pending
  const [notifs, setNotifs] = useState([]);           // Notifications → to me

  const inputRef = useRef(null);

  // ------------------ helpers ------------------
  const displayName = useMemo(() => {
    if (!me) return "";
    const name = `${me.firstName || ""} ${me.lastName || ""}`.trim();
    return name || me.email || "";
  }, [me]);

  const closeAll = () => {
    setOpenSearch(false);
    setOpenFriends(false);
    setOpenNotifs(false);
  };

  const gotoProfile = (uid) => {
    closeAll();
    navigate(`/profile/${uid}`);
  };

  const sortByCreatedDesc = (a, b) => {
    const ta =
      (a.createdAt?.toMillis?.() && a.createdAt.toMillis()) ||
      (a.createdAt?.seconds && a.createdAt.seconds * 1000) ||
      0;
    const tb =
      (b.createdAt?.toMillis?.() && b.createdAt.toMillis()) ||
      (b.createdAt?.seconds && b.createdAt.seconds * 1000) ||
      0;
    return tb - ta;
  };

  // ------------------ my avatar/name ------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentUserId) return setMe(null);
      try {
        const s = await getDoc(doc(db, "Users", currentUserId));
        if (!alive) return;
        setMe(s.exists() ? s.data() : null);
      } catch {
        if (alive) setMe(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentUserId]);

  // ------------------ friend requests (no orderBy → client sort) ------------------
  useEffect(() => {
    if (!currentUserId) return;
    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort(sortByCreatedDesc);
        setPendingReqs(rows);
      },
      (err) => console.error("FriendRequests listener:", err)
    );
    return () => unsub();
  }, [currentUserId]);

  // ------------------ notifications (no orderBy → client sort) ------------------
  useEffect(() => {
    if (!currentUserId) return;
    const qy = query(
      collection(db, "Notifications"),
      where("recipientId", "==", currentUserId)
    );
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort(sortByCreatedDesc);
        // keep a light cap in memory for UI
        setNotifs(rows.slice(0, 20));
      },
      (err) => console.error("Notifications listener:", err)
    );
    return () => unsub();
  }, [currentUserId]);

  // ------------------ actions ------------------
  const acceptFriend = async (reqId) => {
    try {
      await updateDoc(doc(db, "FriendRequests", reqId), { status: "accepted" });
    } catch (e) {
      console.error("acceptFriend error", e);
    }
  };

  const declineFriend = async (reqId) => {
    try {
      await updateDoc(doc(db, "FriendRequests", reqId), { status: "declined" });
    } catch (e) {
      console.error("declineFriend error", e);
    }
  };

  const openNotification = async (n) => {
    try {
      await updateDoc(doc(db, "Notifications", n.id), { read: true });
    } catch {}
    if (n.postId) navigate(`/post/${n.postId}`);
    else if (n.actorId) navigate(`/profile/${n.actorId}`);
    setOpenNotifs(false);
  };

  // ------------------ render ------------------
  const unreadNotif = notifs.filter((n) => !n.read).length;

  return (
    <header className="nav-wrap" onMouseLeave={() => {/* keep open unless explicitly toggled */}}>
      {/* Brand */}
      <div className="brand" onClick={() => { closeAll(); navigate("/"); }}>
        <span className="brand-mark">LivespaceZone</span>
      </div>

      {/* Search */}
      <div className="search-area">
        <div className="search-pill">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 0 0 1.57-4.23C15.99 6.01 13.98 4 11.5 4S7 6.01 7 9.5 9.01 15 11.5 15c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l4.25 4.25a1 1 0 0 1-1.41 1.41L15.5 14zM9 9.5C9 7.57 10.57 6 12.5 6S16 7.57 16 9.5 14.43 13 12.5 13 9 11.43 9 9.5z" fill="currentColor"/>
          </svg>
          <input
            ref={inputRef}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); if (!openSearch) setOpenSearch(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { handleSearch?.(); setOpenSearch(true); }
              if (e.key === "Escape") setOpenSearch(false);
            }}
            onFocus={() => setOpenSearch(true)}
            placeholder="Search by name or email..."
          />
          <button
            className="btn-search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { handleSearch?.(); setOpenSearch(true); inputRef.current?.focus(); }}
          >
            Search
          </button>
        </div>

        {openSearch && (
          <div className="results" onMouseDown={(e) => e.preventDefault()}>
            {(!searchResults || searchResults.length === 0) ? (
              <div className="result empty">No results</div>
            ) : (
              searchResults.map((u) => (
                <button
                  key={u.id}
                  className="result"
                  onClick={() => gotoProfile(u.id)}
                  title={`${u.firstName || ""} ${u.lastName || ""}`}
                >
                  <img
                    src={
                      !u.photo || u.photo === "" || String(u.photo).includes("defaultavatar.jpg")
                        ? FALLBACK_IMAGE
                        : u.photo
                    }
                    alt=""
                  />
                  <div className="r-meta">
                    <div className="r-name">{(u.firstName || "") + " " + (u.lastName || "")}</div>
                    <div className="r-sub">{u.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right side icons */}
      <div className="right">
        {/* Friend requests */}
        <div className="icon-pop">
          <button
            className={`icon-btn ${openFriends ? "is-open" : ""}`}
            title="Friend requests"
            onClick={() => { setOpenFriends(v => !v); setOpenNotifs(false); setOpenSearch(false); }}
          >
            {/* users */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.96 1.97 3.45V19a1 1 0 0 1-1 1h6a1 1 0 0 0 1-1v-.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor"/>
            </svg>
            {pendingReqs.length > 0 && <span className="badge">{pendingReqs.length}</span>}
          </button>

          {openFriends && (
            <div className="popover">
              <div className="popover-title">Friend Requests</div>
              {pendingReqs.length === 0 ? (
                <div className="popover-empty">No pending requests.</div>
              ) : (
                pendingReqs.map((r) => (
                  <div key={r.id} className="row">
                    <div className="row-main">
                      <div className="row-title">{r.fromName || "Someone"}</div>
                      <div className="row-sub">{r.fromEmail || ""}</div>
                    </div>
                    <div className="row-actions">
                      <button className="mini-btn approve" onClick={() => acceptFriend(r.id)}>Accept</button>
                      <button className="mini-btn" onClick={() => declineFriend(r.id)}>Decline</button>
                    </div>
                  </div>
                ))
              )}
              <div className="popover-foot">
                <button className="mini-link" onClick={() => setOpenFriends(false)}>Close</button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="icon-pop">
          <button
            className={`icon-btn ${openNotifs ? "is-open" : ""}`}
            title="Notifications"
            onClick={() => { setOpenNotifs(v => !v); setOpenFriends(false); setOpenSearch(false); }}
          >
            {/* bell */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/>
            </svg>
            {unreadNotif > 0 && <span className="badge">{unreadNotif}</span>}
          </button>

          {openNotifs && (
            <div className="popover">
              <div className="popover-title">Notifications</div>
              {notifs.length === 0 ? (
                <div className="popover-empty">Nothing new.</div>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    className={`row ${n.read ? "" : "unread"}`}
                    onClick={() => openNotification(n)}
                  >
                    <div className="row-main">
                      <div className="row-title">
                        <strong>{n.actorName || "Someone"}</strong>{" "}
                        {n.type === "post" ? "posted"
                          : n.type === "like" ? "liked your post"
                          : n.type === "comment" ? "commented on your post"
                          : "updated"}
                      </div>
                      {n.text && <div className="row-sub">{n.text}</div>}
                    </div>
                  </button>
                ))
              )}
              <div className="popover-foot">
                <button className="mini-link" onClick={() => setOpenNotifs(false)}>Close</button>
              </div>
            </div>
          )}
        </div>

        {/* Me */}
        <div className="me" onClick={() => { closeAll(); if (currentUserId) navigate(`/profile/${currentUserId}`); }}>
          <div className="me-img">
            <img
              src={
                me?.photo && me.photo !== "" && me.photo !== FIREBASE_DEFAULT_IMAGE
                  ? me.photo
                  : FALLBACK_IMAGE
              }
              alt=""
            />
          </div>
          <span className="me-name">{displayName || "Profile"}</span>
        </div>
      </div>
    </header>
  );
}
