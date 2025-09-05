// FriendInbox.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
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

// Build a friendly full name from either the request doc or the Users doc
function resolveSenderName(r, u = {}) {
  // 1) Prefer explicit fields from the request doc if present
  const rFirst =
    r.fromFirstName ??
    r.firstName ??
    r.firstname ??
    r.from_first_name ??
    r.from_first ??
    "";
  const rLast =
    r.fromLastName ??
    r.lastName ??
    r.lastname ??
    r.from_last_name ??
    r.from_last ??
    "";
  const rFull =
    (r.fromName ?? r.fullName ?? r.name ?? `${rFirst} ${rLast}`.trim()).trim();

  // If request already carries a proper name, use it
  if (rFull && rFull.toLowerCase() !== "someone") return rFull;

  // 2) Try common fields on the Users doc
  // first/last variants
  const uFirst =
    u.firstName ??
    u.firstname ??
    u.first_name ??
    u.givenName ??
    u.given_name ??
    "";
  const uLast =
    u.lastName ??
    u.lastname ??
    u.last_name ??
    u.familyName ??
    u.family_name ??
    "";
  const direct = `${uFirst || ""} ${uLast || ""}`.trim();
  if (direct) return direct;

  // displayName / name
  const disp =
    u.displayName ??
    u.display_name ??
    u.name ??
    u.fullName ??
    u.full_name ??
    "";
  if (disp) return String(disp).trim();

  // 3) Fall back to email prefix if available
  if (u.email) return String(u.email).split("@")[0];
  if (r.fromEmail) return String(r.fromEmail).split("@")[0];

  // 4) Final fallback
  return "Someone";
}

function resolveSenderPhoto(r, u = {}) {
  // Prefer a photo carried on the request doc if present
  const rp = r.fromPhoto ?? r.photo ?? r.avatar ?? "";
  if (rp && rp !== FIREBASE_DEFAULT_IMAGE) return rp;

  // Otherwise, use the Users doc photo if present
  const up = u.photo ?? u.avatar ?? u.picture ?? "";
  if (up && up !== FIREBASE_DEFAULT_IMAGE) return up;

  // Fallback
  return FALLBACK_IMAGE;
}

export default function FriendInbox({ currentUserId }) {
  const [incoming, setIncoming] = useState([]); // [{id, fromId, toId, ... , _from:{fullName,photo}}]
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) return;

    let snapTo = null;
    let snapReceiver = null;

    const toMillis = (t) =>
      typeof t?.toMillis === "function"
        ? t.toMillis()
        : t?.seconds
        ? t.seconds * 1000
        : typeof t === "number"
        ? t
        : 0;

    const mergeAndSet = async () => {
      const snaps = [snapTo, snapReceiver].filter(Boolean);
      const map = new Map();

      // Merge all docs from both listeners (avoid duplicates)
      snaps.forEach((s) => {
        s.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
      });

      // Keep only pending (case-insensitive). If status missing, treat as pending.
      const raw = [...map.values()].filter((r) => {
        const s = (r.status ?? "pending") + "";
        return s.toLowerCase() === "pending";
      });

      // Sort newest first locally
      raw.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

      // Hydrate sender mini profile – prefer fields on the request; else read Users doc
      const hydrated = await Promise.all(
        raw.map(async (r) => {
          let u = {};
          try {
            if (r.fromId) {
              const s = await getDoc(doc(db, "Users", r.fromId));
              if (s.exists()) u = s.data();
            }
          } catch {
            /* ignore user fetch errors; we'll still render from request fields */
          }

          const fullName = resolveSenderName(r, u);
          const photo = resolveSenderPhoto(r, u);

          return { ...r, _from: { fullName, photo } };
        })
      );

      setIncoming(hydrated);
      setLoading(false);
    };

    // Listen to requests targeting me via toId
    const unsubTo = onSnapshot(
      query(collection(db, "FriendRequests"), where("toId", "==", currentUserId)),
      (snap) => {
        snapTo = snap;
        mergeAndSet();
      },
      (err) => {
        console.error("[FriendInbox] toId listener error:", err);
        setLoading(false);
      }
    );

    // Also listen in case older code used receiverId
    const unsubReceiver = onSnapshot(
      query(collection(db, "FriendRequests"), where("receiverId", "==", currentUserId)),
      (snap) => {
        snapReceiver = snap;
        mergeAndSet();
      },
      (err) => console.error("[FriendInbox] receiverId listener error:", err)
    );

    return () => {
      unsubTo();
      unsubReceiver();
    };
  }, [currentUserId]);

  async function accept(req) {
    // 3) notify sender that I accepted
try {
  const meSnap = await getDoc(doc(db, "Users", currentUserId));
  const me = meSnap.exists() ? meSnap.data() : {};
  const actorName = `${me.firstName || ""} ${me.lastName || ""}`.trim() || (me.email || "");
  await addDoc(collection(db, "Notifications"), {
    recipientId: req.fromId,          // the sender gets the notification
    actorId: currentUserId,           // me (the acceptor)
    actorFirstName: me.firstName || "",
    actorLastName: me.lastName || "",
    actorName,                        // 👈 add this so navbar can show a name immediately
    actorPhoto: !me.photo || me.photo === "" ? FALLBACK_IMAGE : me.photo,
    type: "friend_accept",            // 👈 this is allowed by your rules
    postId: "",
    text: "",                         // optional; we’ll render by type
    createdAt: serverTimestamp(),
    read: false,
  });
} catch (e) {
  console.warn("friend_accept notification failed (ok to ignore):", e);
}

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
          actorPhoto: !me.photo || me.photo === "" ? FALLBACK_IMAGE : me.photo,
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
              alt={req._from?.fullName || "User"}
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
                {req._from?.fullName || "Someone"}
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
