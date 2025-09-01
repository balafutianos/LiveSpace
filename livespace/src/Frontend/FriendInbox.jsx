// FriendInbox.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  setDoc,
  addDoc,
} from "firebase/firestore";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const FIREBASE_DEFAULT_IMAGE =
  "https://firebasestorage.googleapis.com/v0/b/livespacezone.appspot.com/o/profilePictures%2Fdefaultavatar.jpg?alt=media";

function nameFromUser(u = {}) {
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  if (name) return name;
  if (u.email) return u.email.split("@")[0];
  return "Someone";
}

export default function FriendInbox({ currentUserId }) {
  const [incoming, setIncoming] = useState([]); // [{id, fromId, toId, ... , _from:{name,photo}}]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;

    const qy = query(
      collection(db, "FriendRequests"),
      where("toId", "==", currentUserId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      async (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // hydrate with sender mini profile
        const hydrated = await Promise.all(
          rows.map(async (r) => {
            try {
              const s = await getDoc(doc(db, "Users", r.fromId));
              const u = s.exists() ? s.data() : {};
              const photo =
                !u.photo || u.photo === "" || u.photo === FIREBASE_DEFAULT_IMAGE
                  ? FALLBACK_IMAGE
                  : u.photo;
              return { ...r, _from: { name: nameFromUser(u), photo } };
            } catch {
              return { ...r, _from: { name: "Someone", photo: FALLBACK_IMAGE } };
            }
          })
        );
        setIncoming(hydrated);
        setLoading(false);
      },
      (err) => {
        console.error("FriendInbox listener error:", err);
        setIncoming([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUserId]);

  async function accept(req) {
    try {
      // 1) mark accepted
      await updateDoc(doc(db, "FriendRequests", req.id), {
        status: "accepted",
        respondedAt: serverTimestamp(),
      });

      // 2) create/merge a Friends pair doc
      const [a, b] = [req.fromId, req.toId].sort();
      await setDoc(
        doc(db, "Friends", `${a}_${b}`),
        { userIds: [a, b], createdAt: serverTimestamp() },
        { merge: true }
      );

      // 3) (optional) notify sender that I accepted
      try {
        const meSnap = await getDoc(doc(db, "Users", currentUserId));
        const me = meSnap.exists() ? meSnap.data() : {};
        await addDoc(collection(db, "Notifications"), {
          recipientId: req.fromId,
          actorId: currentUserId,
          actorFirstName: me.firstName || "",
          actorLastName: me.lastName || "",
          actorPhoto:
            !me.photo || me.photo === "" ? FALLBACK_IMAGE : me.photo,
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
      console.error("Accept friend error:", e);
      alert("Could not accept request. Please try again.");
    }
  }

  async function decline(req) {
    try {
      await updateDoc(doc(db, "FriendRequests", req.id), {
        status: "declined",
        respondedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Decline friend error:", e);
      alert("Could not decline request. Please try again.");
    }
  }

  if (!currentUserId) return null;
  if (loading) return null;
  if (incoming.length === 0) return null;

  return (
    <div style={{ marginTop: 16, padding: "0 24px" }}>
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 12,
          background: "#0e1a24",
          color: "#e6edf3",
        }}
      >
        <h4 style={{ margin: "4px 0 12px 0" }}>Friend Requests</h4>

        {incoming.map((req) => (
          <div
            key={req.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <img
              src={req._from?.photo || FALLBACK_IMAGE}
              alt={req._from?.name || "User"}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid rgba(255,255,255,0.15)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {req._from?.name || "Someone"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                sent you a friend request
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => accept(req)}
                className="btn btn-primary"
                style={{ padding: "6px 10px", borderRadius: 8 }}
              >
                Accept
              </button>
              <button
                onClick={() => decline(req)}
                className="btn btn-ghost"
                style={{ padding: "6px 10px", borderRadius: 8 }}
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
