import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";

import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import "./navbar-dark.css";

/**
 * Props expected:
 * - currentUserId
 * - searchTerm, setSearchTerm, handleSearch, searchResults
 */
export default function Navbar({
  currentUserId,
  searchTerm,
  setSearchTerm,
  handleSearch,
  searchResults = [],
}) {
  // ✅ fallback state if props not provided
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const effectiveSearchTerm =
    searchTerm !== undefined ? searchTerm : localSearchTerm;
  const effectiveSetSearchTerm =
    typeof setSearchTerm === "function" ? setSearchTerm : setLocalSearchTerm;

  const navigate = useNavigate();
  const [me, setMe] = useState(null);
const [showMenu, setShowMenu] = useState(false);

  // counts + lists
  const [pendingReqs, setPendingReqs] = useState([]);   // FriendRequests docs (to me, pending)
  const [notifs, setNotifs] = useState([]);             // latest notifications to me
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // UI state
  const [openSearch, setOpenSearch] = useState(false);
  const [openFriends, setOpenFriends] = useState(false);
  const [openNotifs, setOpenNotifs] = useState(false);

  const inputRef = useRef(null);

  // load my mini profile for avatar + name
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentUserId) return setMe(null);
      try {
        const snap = await getDoc(doc(db, "Users", currentUserId));
        if (!alive) return;
        setMe(snap.exists() ? snap.data() : null);
      } catch { setMe(null); }
    })();
    return () => { alive = false; };
  }, [currentUserId]);

  // subscribe: pending friend requests
  useEffect(() => {
    if (!currentUserId) return;
    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(qy, (snap) => {
      setPendingReqs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUserId]);

  // subscribe: latest notifications (and unread count via filter)
  useEffect(() => {
    if (!currentUserId) return;
    const qy = query(
      collection(db, "Notifications"),
      where("recipientId", "==", currentUserId),
      orderBy("createdAt", "desc"),
      limit(12)
    );
    const unsub = onSnapshot(qy, (snap) => {
      setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [currentUserId]);

  // subscribe: unread messages count
  useEffect(() => {
    if (!currentUserId) return;
    let unsub;
    try {
      const qy = query(
        collection(db, "Messages"),
        where("toId", "==", currentUserId),
        where("read", "==", false)
      );
      unsub = onSnapshot(qy, (snap) => setUnreadMsgCount(snap.size || 0));
    } catch {
      // ignore
    }
    return () => unsub && unsub();
  }, [currentUserId]);

  const displayName = useMemo(() => {
    if (!me) return "";
    const fn = me.firstName || "";
    const ln = me.lastName || "";
    const name = `${fn} ${ln}`.trim();
    return name || (me.email || "");
  }, [me]);

  const onSearchKey = (e) => {
    if (e.key === "Enter") {
      handleSearch?.();
      setOpenSearch(true);
    } else if (e.key === "Escape") {
      setOpenSearch(false);
    }
  };

  const closeAllPopovers = () => {
    setOpenSearch(false);
    setOpenFriends(false);
    setOpenNotifs(false);
  };
const doLogout = async () => {
  try {
    await signOut(auth);
    navigate("/login");
  } catch (e) {
    console.error("Logout failed", e);
  }
};

  const acceptFriend = async (reqId) => {
    try { await updateDoc(doc(db, "FriendRequests", reqId), { status: "accepted" }); }
    catch (e) { console.error("acceptFriend error", e); }
  };
  const declineFriend = async (reqId) => {
    try { await updateDoc(doc(db, "FriendRequests", reqId), { status: "declined" }); }
    catch (e) { console.error("declineFriend error", e); }
  };

  const openNotification = async (n) => {
    try { await updateDoc(doc(db, "Notifications", n.id), { read: true }); } catch {}
    if (n.postId) {
      navigate(`/post/${n.postId}`);
    } else if (n.actorId) {
      navigate(`/profile/${n.actorId}`);
    }
    setOpenNotifs(false);
  };

  const gotoProfile = (uid) => {
    setOpenSearch(false);
    navigate(`/profile/${uid}`);
  };

  return (
    <header className="nav-wrap" onMouseLeave={() => {}}>
      {/* Brand */}
      <div className="brand" onClick={() => { closeAllPopovers(); navigate("/"); }}>
        <span className="brand-mark">LivespaceZone</span>
      </div>

      {/* Search Center */}
      <div className="search-area">
        <div className="search-pill">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15.5 14h-.79l-.28-.27a6.471 6.471 0 0 0 1.57-4.23C15.99 6.01 13.98 4 11.5 4S7 6.01 7 9.5 9.01 15 11.5 15c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l4.25 4.25a1 1 0 0 1-1.41 1.41L15.5 14zM9 9.5C9 7.57 10.57 6 12.5 6S16 7.57 16 9.5 14.43 13 12.5 13 9 11.43 9 9.5z"
              fill="currentColor"
            />
          </svg>
          <input
            ref={inputRef}
            value={effectiveSearchTerm}
            onChange={(e) => { effectiveSetSearchTerm(e.target.value); if (!openSearch) setOpenSearch(true); }}
            onKeyDown={onSearchKey}
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

        {openSearch && effectiveSearchTerm && (
          <div className="results" onMouseDown={(e) => e.preventDefault()}>
            {searchResults.length === 0 ? (
              <div className="result empty">No results</div>
            ) : (
              searchResults.map((u) => (
                <button
                  key={u.id}
                  className="result"
                  onClick={() => gotoProfile(u.id)}
                  title={`${u.firstName || ""} ${u.lastName || ""}`}
                >
                  <img src={u.photo || "https://i.imgur.com/qzsiOuh.png"} alt="" />
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



      {/* Right side */}
      <div className="right">

        {/* Messages button (navigates) */}
        <button
          className="icon-btn"
          title="Messages"
          onClick={() => { closeAllPopovers(); navigate("/messages"); }}
        >
          {/* chat bubble */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" fill="currentColor"/>
          </svg>
          {unreadMsgCount > 0 && <span className="badge">{unreadMsgCount}</span>}
        </button>

        {/* Friends (pending requests dropdown) */}
        <div className="icon-pop">
          <button
            className={`icon-btn ${openFriends ? "is-open": ""}`}
            title="Friend requests"
            onClick={() => { setOpenFriends((v) => !v); setOpenNotifs(false); setOpenSearch(false); }}
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
                <button className="mini-link" onClick={() => { navigate(`/profile/${currentUserId}`); setOpenFriends(false); }}>
                  Open inbox
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications dropdown */}
        <div className="icon-pop">
          <button
            className={`icon-btn ${openNotifs ? "is-open": ""}`}
            title="Notifications"
            onClick={() => { setOpenNotifs((v) => !v); setOpenFriends(false); setOpenSearch(false); }}
          >
            {/* bell */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/>
            </svg>
            {notifs.filter(n => !n.read).length > 0 && (
              <span className="badge">{notifs.filter(n=>!n.read).length}</span>
            )}
          </button>

          {openNotifs && (
            <div className="popover">
              <div className="popover-title">Notifications</div>
              {notifs.length === 0 ? (
                <div className="popover-empty">Nothing new.</div>
              ) : (
                notifs.map((n) => (
                  <button key={n.id} className={`row ${n.read ? "" : "unread"}`} onClick={() => openNotification(n)}>
                    <div className="row-main">
                      <div className="row-title">
                        <strong>{n.actorName || "Someone"}</strong>{` `}
                        {n.type === "post" ? "posted" : n.type === "like" ? "liked" : n.type === "comment" ? "commented" : "updated"}
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
        <div
  className="me-dropdown"
  onMouseLeave={() => setShowMenu(false)}
>
  <div
    className="me"
    onMouseEnter={() => setShowMenu(true)}
     onClick={() => { navigate(`/profile/${currentUserId}`); }}
  >
    <div className="me-img">
      <img src={me?.photo || "https://i.imgur.com/qzsiOuh.png"} alt="" />
    </div>
    <span className="me-name">{displayName || "Profile"}</span>
  </div>

  {showMenu && (
    <div className="me-menu">
      
      <button className="icon-btn logout-btn" onClick={doLogout}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M16 13v-2H7V8l-5 4 5 4v-3h9zm3-10H5c-1.1 0-2 .9-2 
         2v6h2V5h14v14H5v-6H3v6c0 1.1.9 2 2 
         2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      fill="currentColor"
    />
  </svg>
  Logout
</button>

    </div>
  )}
</div>

      </div>
    </header>
  );
}
