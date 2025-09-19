// src/Frontend/Navbar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "./firebase";
import { signOut } from "firebase/auth";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import "./navbar-dark.css";

/**
 * Props (all optional except currentUserId in logged-in views):
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
  // Local search fallback (if parent doesn't provide search)
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const [localResults, setLocalResults] = useState([]);

  const effectiveSearchTerm =
    searchTerm !== undefined ? searchTerm : localSearchTerm;
  const effectiveSetSearchTerm =
    typeof setSearchTerm === "function" ? setSearchTerm : setLocalSearchTerm;

  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  // sound + “new unread” detection
  const audioRef = useRef(null);
  const lastUnreadRef = useRef(0);
  const [canPlaySound, setCanPlaySound] = useState(false);

  // counts + lists
  const [pendingReqs, setPendingReqs] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [acceptingId, setAcceptingId] = useState(null);

  // mini user cache for request senders
  const [miniUsers, setMiniUsers] = useState({}); // { uid: { name, photo } }
  const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
  const FIREBASE_DEFAULT_IMAGE =
    "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

  const buildName = (u = {}) => {
    const fn =
      u.firstName ??
      u.firstname ??
      u.first_name ??
      u.givenName ??
      u.given_name ??
      "";
    const ln =
      u.lastName ??
      u.lastname ??
      u.last_name ??
      u.familyName ??
      u.family_name ??
      "";
    const byFirstLast = `${fn} ${ln}`.trim();
    if (byFirstLast) return byFirstLast;
    const disp =
      u.displayName ??
      u.display_name ??
      u.name ??
      u.fullName ??
      u.full_name ??
      "";
    if (disp) return String(disp).trim();
    if (u.email) return String(u.email).split("@")[0];
    return "Someone";
  };

  const pickPhoto = (u = {}) => {
    const p = u.photo ?? u.avatar ?? u.picture ?? "";
    if (p && p !== FIREBASE_DEFAULT_IMAGE) return p;
    return FALLBACK_IMAGE;
  };

  // ---------- NEW: robust “hidden account” helpers ----------
  const isTruthyFlag = (v) => v === true || v === "true" || v === 1;
  const isFalsyFlag = (v) => v === false || v === "false" || v === 0;
  const hasValue = (v) => v !== undefined && v !== null && v !== "";
  const toLower = (s) => (typeof s === "string" ? s.toLowerCase() : "");

  const isUserDeletedOrHidden = (u = {}) => {
    // boolean-ish flags
    if (isTruthyFlag(u.deleted)) return true;
    if (isTruthyFlag(u.disabled)) return true;

    // timestamp / date-style soft delete
    if (hasValue(u.deletedAt)) return true;

    // prefer active:true model (treat explicit false/0/"false" as hidden)
    if (isFalsyFlag(u.active)) return true;

    // status-based
    const s = toLower(u.status);
    if (s && ["deleted", "disabled", "deactivated", "banned", "suspended"].includes(s)) {
      return true;
    }
    return false;
  };
  // ----------------------------------------------------------

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
      } catch {
        setMe(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [currentUserId]);

  // subscribe: pending friend requests
  useEffect(() => {
    if (!currentUserId) return;

    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending")
    );

    const toMs = (t) =>
      typeof t?.toMillis === "function"
        ? t.toMillis()
        : t?.seconds
        ? t.seconds * 1000
        : typeof t === "number"
        ? t
        : 0;

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setPendingReqs(list);
      },
      (err) => console.error("FriendRequests listener error:", err)
    );

    return unsub;
  }, [currentUserId]);

  const runLocalSearch = async () => {
    try {
      const term = (effectiveSearchTerm || "").trim().toLowerCase();
      if (!term) {
        setLocalResults([]);
        return;
      }

      // (Best) If your schema has active:true or status:"active", prefer one of these:
      // const qy = query(collection(db, "Users"), where("active", "==", true), limit(50));
      // const qy = query(collection(db, "Users"), where("status", "==", "active"), limit(50));
      // (Fallback) otherwise fetch a small page and filter client-side:
      const qy = query(collection(db, "Users"), limit(50));
      const snap = await getDocs(qy);

      const results = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => {
          if (isUserDeletedOrHidden(u)) return false;

          const fn = (u.firstName || "").toLowerCase();
          const ln = (u.lastName || "").toLowerCase();
          const em = (u.email || "").toLowerCase();
          const full = (fn + " " + ln).trim();

          return (
            fn.includes(term) ||
            ln.includes(term) ||
            full.includes(term) ||
            em.includes(term)
          );
        })
        .slice(0, 12);

      setLocalResults(results);
    } catch (e) {
      console.error("navbar local search error", e);
      setLocalResults([]);
    }
  };

  useEffect(() => {
    if (!currentUserId || pendingReqs.length === 0) return;
    const missing = Array.from(
      new Set(
        pendingReqs
          .map((r) => r.fromId)
          .filter(Boolean)
          .filter((uid) => !miniUsers[uid])
      )
    );
    if (missing.length === 0) return;

    (async () => {
      try {
        const updates = {};
        for (const uid of missing) {
          try {
            const s = await getDoc(doc(db, "Users", uid));
            if (s.exists()) {
              const u = s.data();
              updates[uid] = { name: buildName(u), photo: pickPhoto(u) };
            } else {
              updates[uid] = { name: "Someone", photo: FALLBACK_IMAGE };
            }
          } catch {
            updates[uid] = { name: "Someone", photo: FALLBACK_IMAGE };
          }
        }
        setMiniUsers((prev) => ({ ...prev, ...updates }));
      } catch (e) {
        console.error("mini user hydrate error", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, pendingReqs]);

  // subscribe: latest notifications
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
        where("userIds", "array-contains", currentUserId)
      );
      unsub = onSnapshot(
        qy,
        (snap) => {
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
        },
        (err) => {
          console.error("Unread messages listener (permission?)", err);
          setUnreadMsgCount(0);
        }
      );
    } catch (e) {
      console.error("Unread messages listener error:", e);
      setUnreadMsgCount(0);
    }
    return () => unsub && unsub();
  }, [currentUserId]);

  // play sound on unread increase
  useEffect(() => {
    const prev = lastUnreadRef.current;
    if (canPlaySound && unreadMsgCount > prev) {
      try {
        audioRef.current?.play?.();
      } catch {
        // ignore autoplay errors
      }
    }
    lastUnreadRef.current = unreadMsgCount;
  }, [unreadMsgCount, canPlaySound]);

  const displayName = useMemo(() => {
    if (!me) return "";
    const fn = me.firstName || "";
    const ln = me.lastName || "";
    const name = `${fn} ${ln}`.trim();
    return name || me.email || "";
  }, [me]);

  const onSearchKey = async (e) => {
    if (e.key === "Enter") {
      if (typeof handleSearch === "function") {
        await handleSearch();
      } else {
        await runLocalSearch();
      }
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
      navigate("/");
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  // Accept with optimistic removal + friend_accept notification
  const acceptFriend = async (reqObj) => {
    try {
      setAcceptingId(reqObj.id);

      await updateDoc(doc(db, "FriendRequests", reqObj.id), { status: "accepted" });

      setPendingReqs((prev) => prev.filter((r) => r.id !== reqObj.id));

      try {
        const meSnap = await getDoc(doc(db, "Users", currentUserId));
        const meData = meSnap.exists() ? meSnap.data() : {};
        const actorName =
          `${meData.firstName || ""} ${meData.lastName || ""}`.trim() ||
          meData.email ||
          "Someone";

        await addDoc(collection(db, "Notifications"), {
          recipientId: reqObj.fromId,
          actorId: currentUserId,
          actorFirstName: meData.firstName || "",
          actorLastName: meData.lastName || "",
          actorName,
          actorPhoto:
            !meData?.photo || meData.photo === "" ? FALLBACK_IMAGE : meData.photo,
          type: "friend_accept",
          postId: "",
          text: "",
          createdAt: serverTimestamp(),
          read: false,
        });
      } catch (e) {
        console.warn("friend_accept notification failed (ok to ignore):", e);
      }
    } catch (e) {
      console.error("acceptFriend error", e);
    } finally {
      setAcceptingId(null);
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

  // Prefer parent results if provided; else fall back to local
  const raw =
    (Array.isArray(searchResults) && searchResults.length > 0
      ? searchResults
      : localResults) || [];

  // Hide deleted/disabled and de-dupe by id
  const seen = new Set();
  const combinedResults = raw.filter((u) => {
    if (!u || !u.id) return false;
    if (isUserDeletedOrHidden(u)) return false;
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  return (
    <header
      className="nav-wrap"
      onMouseLeave={() => {}}
      onClick={() => setCanPlaySound(true)}
      onKeyDown={() => setCanPlaySound(true)}
    >
      {/* Brand */}
      <div
        className="brand"
        onClick={() => {
          closeAllPopovers();
          navigate("/feed");
        }}
      >
        <span className="brand-mark">Livespace</span>
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
            onChange={(e) => {
              effectiveSetSearchTerm(e.target.value);
              if (!openSearch) setOpenSearch(true);
              // optional: runLocalSearch with a debounce if you want live results
            }}
            onKeyDown={onSearchKey}
            onFocus={() => setOpenSearch(true)}
            placeholder="Search by name or email..."
          />
          <button
            className="btn-search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={async () => {
              if (typeof handleSearch === "function") {
                await handleSearch(); // parent-provided search
              } else {
                await runLocalSearch(); // local search (filters hidden accounts)
              }
              setOpenSearch(true);
              inputRef.current?.focus();
            }}
          >
            Search
          </button>
        </div>

        {openSearch && effectiveSearchTerm && (
          <div className="results" onMouseDown={(e) => e.preventDefault()}>
            {combinedResults.length === 0 ? (
              <div className="result empty">No results</div>
            ) : (
              combinedResults.map((u) => (
                <button
                  key={u.id}
                  className="result"
                  onClick={() => gotoProfile(u.id)}
                  title={`${u.firstName || ""} ${u.lastName || ""}`}
                >
                  <img
                    src={u.photo || "https://i.imgur.com/qzsiOuh.png"}
                    alt=""
                  />
                  <div className="r-meta">
                    <div className="r-name">
                      {(u.firstName || "") + " " + (u.lastName || "")}
                    </div>
                    <div className="r-sub">{u.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <button
  className="icon-btn"
  title="Feed"
  onClick={() => {
    closeAllPopovers();
    navigate("/feed");
  }}
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"
      fill="currentColor"
    />
  </svg>
</button>

      <div className="right">
        <button
          className="icon-btn"
          title="Messages"
          onClick={() => {
            closeAllPopovers();
            navigate("/messages");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
              fill="currentColor"
            />
          </svg>
          {unreadMsgCount > 0 && (
            <span className="badge-dot" aria-label="new messages" />
          )}
        </button>

        {/* Friends (pending requests dropdown) */}
        <div className="icon-pop">
          <button
            className={`icon-btn ${openFriends ? "is-open" : ""}`}
            title="Friend requests"
            onClick={() => {
              setOpenFriends((v) => !v);
              setOpenNotifs(false);
              setOpenSearch(false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.96 1.97 3.45V19a1 1 0 0 1-1 1h6a1 1 0 0 0 1-1v-.5c0-2.33-4.67-3.5-7-3.5z"
                fill="currentColor"
              />
            </svg>
            {pendingReqs.length > 0 && (
              <span className="badge">{pendingReqs.length}</span>
            )}
          </button>

          {openFriends && (
            <div className="popover">
              <div className="popover-title">Friend Requests</div>
              {pendingReqs.length === 0 ? (
                <div className="popover-empty">No pending requests.</div>
              ) : (
                pendingReqs.map((r) => (
                  <div key={r.id} className="row">
                    <div
                      className="row-main"
                      style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                      <img
                        src={
                          miniUsers[r.fromId]?.photo || "https://i.imgur.com/qzsiOuh.png"
                        }
                        alt={miniUsers[r.fromId]?.name || "User"}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                      <div>
                        <div className="row-title">
                          {miniUsers[r.fromId]?.name || "Someone"}
                        </div>
                        <div className="row-sub">{r.fromEmail || ""}</div>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        className="mini-btn approve"
                        onClick={() => acceptFriend(r)}
                        disabled={acceptingId === r.id}
                      >
                        Accept
                      </button>
                      <button
                        className="mini-btn"
                        onClick={() => declineFriend(r.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
              <div className="popover-foot">
                <button
                  className="mini-link"
                  onClick={() => {
                    navigate(`/profile/${currentUserId}`);
                    setOpenFriends(false);
                  }}
                >
                  Open inbox
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications dropdown */}
        <div className="icon-pop">
          <button
            className={`icon-btn ${openNotifs ? "is-open" : ""}`}
            title="Notifications"
            onClick={() => {
              setOpenNotifs((v) => !v);
              setOpenFriends(false);
              setOpenSearch(false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z"
                fill="currentColor"
              />
            </svg>
            {notifs.filter((n) => !n.read).length > 0 && (
              <span className="badge">
                {notifs.filter((n) => !n.read).length}
              </span>
            )}
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
                        <strong>
                          {(
                            n.actorName ||
                            `${n.actorFirstName || ""} ${n.actorLastName || ""}`.trim()
                          ) || "Someone"}
                        </strong>{" "}
                        {n.type === "post"
                          ? "posted"
                          : n.type === "like"
                          ? "liked"
                          : n.type === "comment"
                          ? "commented"
                          : n.type === "friend_request"
                          ? "sent you a friend request"
                          : n.type === "friend_accept"
                          ? "accepted your friend request"
                          : "updated"}
                      </div>
                      {n.text && <div className="row-sub">{n.text}</div>}
                    </div>
                  </button>
                ))
              )}
              <div className="popover-foot">
                <button className="mini-link" onClick={() => setOpenNotifs(false)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Me */}
        <div className="me-dropdown" onMouseLeave={() => setShowMenu(false)}>
          <div
            className="me"
            onMouseEnter={() => setShowMenu(true)}
            onClick={() => {
              navigate(`/profile/${currentUserId}`);
            }}
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
                    d="M16 13v-2H7V8l-5 4 5 4v-3h9zm3-10H5c-1.1 0 0-2 .9-2-2v6h2V5h14v14H5v-6H3v6c0 1.1.9 2 2 
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

      {/* Preload the sound once */}
      <audio ref={audioRef} src="/sounds/message.mp3" preload="auto" />
    </header>
  );
}
