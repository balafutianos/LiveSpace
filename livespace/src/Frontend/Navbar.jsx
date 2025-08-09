// Navbar.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
  serverTimestamp,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export default function Navbar({
  currentUserId,
  searchTerm = "",
  setSearchTerm = () => {},
  handleSearch = () => {},
  searchResults = [],
}) {
  const [pending, setPending] = useState([]);  // FriendRequests
  const [senders, setSenders] = useState({});  // fromId -> user data
  const [openReq, setOpenReq] = useState(false);

  const pendingCount = pending.length;

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

      // fetch sender data
      const ids = [...new Set(rows.map((r) => r.fromId))];
      const map = {};
      await Promise.all(
        ids.map(async (uid) => {
          const uref = doc(db, "Users", uid);
          const u = await getDoc(uref);
          if (u.exists()) {
            const d = u.data();
            map[uid] = {
              firstName: d.firstName || "",
              lastName: d.lastName || "",
              email: d.email || "",
              photo:
                !d.photo ||
                d.photo === "" ||
                d.photo?.includes("defaultavatar.jpg")
                  ? "https://i.imgur.com/qzsiOuh.png"
                  : d.photo,
            };
          } else {
            map[uid] = {
              firstName: "",
              lastName: "",
              email: "",
              photo: "https://i.imgur.com/qzsiOuh.png",
            };
          }
        })
      );
      setSenders(map);
    });
    return () => unsub();
  }, [currentUserId]);

  const handleAccept = async (req) => {
  try {
    // 1) mark request accepted + respondedAt (allowed by rules now)
    await updateDoc(doc(db, "FriendRequests", req.id), {
      status: "accepted",
      respondedAt: serverTimestamp(),
    });

    // 2) create/merge friendship pair
    const [a, b] = [req.fromId, req.toId].sort();
    const pairId = `${a}_${b}`;
    await setDoc(
      doc(db, "Friends", pairId),
      { userIds: [a, b], createdAt: serverTimestamp() },
      { merge: true }
    );
    } catch (e) {
    console.error("Accept error details:", e?.code, e?.message);
    alert(`Could not accept: ${e?.code || ''} ${e?.message || ''}`);
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
        padding: "10px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
      }}
    >
      {/* Requests button (top-left) */}
      <div style={{ position: "absolute", left: 16, top: 10 }}>
        <button
          onClick={() => setOpenReq((o) => !o)}
          title="Friend requests"
          style={{
            position: "relative",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff",
            borderRadius: 20,
            padding: "6px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
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

        {/* Dropdown list of requests */}
        {openReq && (
          <div
            style={{
              position: "absolute",
              top: 36,
              left: 0,
              width: 340,
              background: "#fff",
              color: "#000",
              borderRadius: 8,
              boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
              zIndex: 2000,
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
                      src={s.photo || "https://i.imgur.com/qzsiOuh.png"}
                      alt="sender"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {s.firstName} {s.lastName}
                      </div>
                      {s.email && (
                        <div style={{ fontSize: 12, color: "#666" }}>{s.email}</div>
                      )}
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
                        onClick={() => handleDecline(req.id)}
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

      {/* Search */}
      <div style={{ display: "flex", gap: 8, position: "relative", width: "100%", maxWidth: 420 }}>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
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
                  src={u.photo || "https://i.imgur.com/qzsiOuh.png"}
                  alt="user"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
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
