// Navbar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import NotificationBell from "./NotificationBell";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

export default function Navbar({
  currentUserId,
  searchTerm = "",
  setSearchTerm = () => {},
  handleSearch = () => {},
  searchResults = [],
}) {
  const [pending, setPending] = useState([]);   // FriendRequests
  const [senders, setSenders] = useState({});   // fromId -> user data
  const [openReq, setOpenReq] = useState(false);

  const [myPhoto, setMyPhoto] = useState(FALLBACK_IMAGE);

  const reqWrapRef = useRef(null); // wraps the Requests button + dropdown
  const pendingCount = pending.length;

  // Fetch my avatar
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentUserId) return;
      try {
        const snap = await getDoc(doc(db, "Users", currentUserId));
        if (!alive) return;
        if (snap.exists()) {
          const d = snap.data();
          const photo =
            !d.photo || d.photo === "" || d.photo === FIREBASE_DEFAULT_IMAGE
              ? FALLBACK_IMAGE
              : d.photo;
          setMyPhoto(photo);
        } else {
          setMyPhoto(FALLBACK_IMAGE);
        }
      } catch {
        setMyPhoto(FALLBACK_IMAGE);
      }
    })();
    return () => { alive = false; };
  }, [currentUserId]);

  // Close dropdown on outside click / Esc
  useEffect(() => {
    function onDocClick(e) {
      if (!openReq) return;
      if (reqWrapRef.current && !reqWrapRef.current.contains(e.target)) {
        setOpenReq(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpenReq(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openReq]);

  // Subscribe to my pending requests
  useEffect(() => {
    if (!currentUserId) return;
    const q = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending")
    );
    const unsub = onSnapshot(q, async (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPending(rows);

      // fetch sender data (avatars, names)
      const ids = [...new Set(rows.map((r) => r.fromId))];
      const map = {};
      await Promise.all(
        ids.map(async (uid) => {
          const u = await getDoc(doc(db, "Users", uid));
          if (u.exists()) {
            const d = u.data();
            map[uid] = {
              firstName: d.firstName || "",
              lastName: d.lastName || "",
              email: d.email || "",
              photo:
                !d.photo || d.photo === "" || d.photo?.includes("defaultavatar.jpg")
                  ? FALLBACK_IMAGE
                  : d.photo,
            };
          } else {
            map[uid] = { firstName: "", lastName: "", email: "", photo: FALLBACK_IMAGE };
          }
        })
      );
      setSenders(map);
    });
    return () => unsub();
  }, [currentUserId]);

  const handleAccept = async (req) => {
    try {
      await updateDoc(doc(db, "FriendRequests", req.id), {
        status: "accepted",
        respondedAt: serverTimestamp(),
      });
      const [a, b] = [req.fromId, req.toId].sort();
      await setDoc(
        doc(db, "Friends", `${a}_${b}`),
        { userIds: [a, b], createdAt: serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.error("Accept error details:", e?.code, e?.message);
      alert(`Could not accept: ${e?.code || ""} ${e?.message || ""}`);
    }
  };

  const handleDecline = async (req) => {
    try {
      await updateDoc(doc(db, "FriendRequests", req.id), {
        status: "declined",
        respondedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Decline error:", e);
      alert("Could not decline request.");
    }
  };

  const hasSearchResults = useMemo(
    () => Array.isArray(searchResults) && searchResults.length > 0,
    [searchResults]
  );

  return (
    <nav
      style={{
        backgroundColor: "#122939",
        color: "#fff",
        padding: "10px 20px 18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      {/* LEFT: Requests + NotificationBell */}
      <div style={{ position: "absolute", left: 16, top: 10, display: "flex", alignItems: "center", gap: 10 }}>
        {/* Requests button + dropdown */}
        <div ref={reqWrapRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            onClick={() => setOpenReq((o) => !o)}
            title="Friend requests"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              borderRadius: 20,
              padding: "6px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: "33px",
            }}
          >
            <span style={{ fontSize: 16 }}>🔔</span>
            <span style={{ fontSize: 13 }}>Requests</span>
            {pendingCount > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  background: "#27D496",
                  color: "#052023",
                  fontWeight: 700,
                  fontSize: 12,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 6px",
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>

          {/* Dropdown anchored under Requests */}
          {openReq && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                width: 340,
                background: "#fff",
                color: "#000",
                borderRadius: 8,
                boxShadow: "0 12px 24px rgba(0,0,0,0.25)",
                zIndex: 10000,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  fontWeight: 700,
                  borderBottom: "1px solid #eee",
                  background: "#f7f9fb",
                }}
              >
                Friend Requests
              </div>

              {pending.length === 0 ? (
                <div style={{ padding: 12, color: "#666" }}>No pending requests</div>
              ) : (
                pending.map((req) => {
                  const s = senders[req.fromId] || {};
                  return (
                    <div
                      key={req.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      <img
                        src={s.photo || FALLBACK_IMAGE}
                        alt="sender"
                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {s.firstName} {s.lastName}
                        </div>
                        {s.email && <div style={{ fontSize: 12, color: "#666" }}>{s.email}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleAccept(req)}
                          style={{
                            background: "#27D496",
                            color: "#052023",
                            border: "none",
                            padding: "6px 8px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDecline(req)}
                          style={{
                            background: "#eee",
                            color: "#333",
                            border: "1px solid #ddd",
                            padding: "6px 8px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Notification bell placed right next to Requests */}
        {currentUserId && (
          <div style={{ marginTop: "33px" }}>
            <NotificationBell currentUserId={currentUserId} />
          </div>
        )}
      </div>

      {/* Brand */}
      <div
        style={{
          fontWeight: "bold",
          fontSize: "18px",
          color: "#27D496",
          marginBottom: 10,
        }}
      >
        LiveSpaceZone
      </div>

      {/* My profile (top-right) */}
      {currentUserId && (
        <div style={{ position: "absolute", right: 16, top: 10 }}>
          <Link
            to={`/profile/${currentUserId}`}
            title="Go to my profile"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              textDecoration: "none",
              background: "transparent",
              marginTop: "33px",
              marginRight: "102px",
            }}
          >
            <img
              src={myPhoto}
              alt="Me"
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid rgba(255,255,255,0.2)",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600 }}>My profile</span>
          </Link>
        </div>
      )}

      {/* Search */}
      <div style={{ display: "flex", gap: 8, position: "relative", width: "100%", maxWidth: 420 }}>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Search by name or email..."
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.15)",
            width: "100%",
            outline: "none",
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "none",
            background: "#27D496",
            color: "#052023",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Search
        </button>

        {Array.isArray(searchResults) && searchResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "44px",
              left: 0,
              right: 0,
              background: "#fff",
              color: "#000",
              borderRadius: "0 0 6px 6px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              maxHeight: "220px",
              overflowY: "auto",
              zIndex: 1000,
            }}
          >
            {searchResults.map((u) => (
              <a
                key={u.id}
                href={`/profile/${u.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px",
                  textDecoration: "none",
                  color: "inherit",
                  borderBottom: "1px solid #eee",
                }}
              >
                <img
                  src={u.photo || FALLBACK_IMAGE}
                  alt="user"
                  style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {u.firstName} {u.lastName}
                  </div>
                  <div style={{ color: "#666", fontSize: 12 }}>{u.email}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
