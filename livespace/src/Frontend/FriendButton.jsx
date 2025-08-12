// FriendButton.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

function reqPairId(a, b) {
  const x = String(a), y = String(b);
  return x < y ? `${x}__${y}` : `${y}__${x}`; // preferred FriendRequests id
}
function friendsPairId(a, b) {
  const x = String(a), y = String(b);
  return x < y ? `${x}_${y}` : `${y}_${x}`;   // Friends doc id
}

export default function FriendButton({ viewerId, profileUserId, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [pairReqs, setPairReqs] = useState([]); // all requests between the pair
  const [status, setStatus] = useState(null);   // null | pending | accepted | declined | cancelled
  const [fromId, setFromId] = useState(null);
  const [friendsDocExists, setFriendsDocExists] = useState(false);

  const preferredReqId = useMemo(() => reqPairId(viewerId, profileUserId), [viewerId, profileUserId]);
  const friendsId = useMemo(() => friendsPairId(viewerId, profileUserId), [viewerId, profileUserId]);
  const friendsRef = useMemo(() => doc(db, "Friends", friendsId), [friendsId]);

  // choose display state
  function pickDisplay(reqs, hasFriendsDoc) {
    const accepted = reqs.find(r => r.status === "accepted");
    if (accepted || hasFriendsDoc) return { status: "accepted", fromId: accepted?.fromId ?? null };
    const pending = reqs.find(r => r.status === "pending");
    if (pending) return { status: "pending", fromId: pending.fromId };
    return { status: null, fromId: null };
  }

  // listen to requests (both directions)
  useEffect(() => {
    if (!viewerId || !profileUserId) return;

    const fr = collection(db, "FriendRequests");
    const qAB = query(fr, where("fromId", "==", viewerId),     where("toId", "==", profileUserId));
    const qBA = query(fr, where("fromId", "==", profileUserId), where("toId", "==", viewerId));

    const unsubA = onSnapshot(qAB, (snap) => {
      const A = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPairReqs(prev => {
        const others = prev.filter(x => !(x.fromId === viewerId && x.toId === profileUserId));
        const next = [...others, ...A];
        const picked = pickDisplay(next, friendsDocExists);
        setStatus(picked.status);
        setFromId(picked.fromId);
        setLoading(false);
        return next;
      });
      onChanged?.();
    }, (e) => { console.error("FriendButton qAB error:", e); setLoading(false); });

    const unsubB = onSnapshot(qBA, (snap) => {
      const B = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPairReqs(prev => {
        const others = prev.filter(x => !(x.fromId === profileUserId && x.toId === viewerId));
        const next = [...others, ...B];
        const picked = pickDisplay(next, friendsDocExists);
        setStatus(picked.status);
        setFromId(picked.fromId);
        setLoading(false);
        return next;
      });
      onChanged?.();
    }, (e) => { console.error("FriendButton qBA error:", e); setLoading(false); });

    return () => { unsubA(); unsubB(); };
  }, [viewerId, profileUserId, friendsDocExists, onChanged]);

  // listen to Friends pair doc (exists => we are friends)
  useEffect(() => {
    if (!friendsRef) return;
    const unsub = onSnapshot(
      friendsRef,
      (snap) => {
        setFriendsDocExists(snap.exists());
        // recompute display using latest reqs + doc existence
        const picked = pickDisplay(pairReqs, snap.exists());
        setStatus(picked.status);
        setFromId(picked.fromId);
        setLoading(false);
      },
      (e) => {
        // If rules deny reading a non-existent doc, swallow it; treat as not friends.
        console.warn("Friends doc listen error (ignored):", e?.code || e);
        setFriendsDocExists(false);
        const picked = pickDisplay(pairReqs, false);
        setStatus(picked.status);
        setFromId(picked.fromId);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [friendsRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const iAmSender   = fromId === viewerId;
  const iAmReceiver = fromId && fromId !== viewerId;

  // --- actions ---
  async function sendRequest() {
    if (!viewerId || !profileUserId) return;
    setLoading(true);
    try {
      const mine = pairReqs.find(r => r.fromId === viewerId);
      if (mine) {
        if (mine.status === "cancelled" || mine.status === "declined") {
          await updateDoc(doc(db, "FriendRequests", mine.id), {
            status: "pending",
            respondedAt: null,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        await setDoc(
          doc(db, "FriendRequests", preferredReqId),
          { fromId: viewerId, toId: profileUserId, status: "pending", createdAt: serverTimestamp() },
          { merge: true }
        );
      }
    } catch (e) {
      console.error("sendRequest error:", e);
      alert("Could not send request.");
    } finally { setLoading(false); }
  }

  async function cancelRequest() {
    if (!iAmSender || status !== "pending") return;
    setLoading(true);
    try {
      const target = pairReqs.find(r => r.fromId === viewerId && r.status === "pending");
      if (target) {
        await updateDoc(doc(db, "FriendRequests", target.id), {
          status: "cancelled",
          respondedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("cancelRequest error:", e);
      alert("Could not cancel request.");
    } finally { setLoading(false); }
  }

  async function acceptRequest() {
    if (!iAmReceiver || status !== "pending") return;
    setLoading(true);
    try {
      const target = pairReqs.find(r => r.toId === viewerId && r.status === "pending");
      if (target) {
        await updateDoc(doc(db, "FriendRequests", target.id), {
          status: "accepted",
          respondedAt: serverTimestamp(),
        });
        // ensure Friends doc exists (idempotent)
        await setDoc(doc(db, "Friends", friendsId), {
          userIds: [viewerId, profileUserId].sort(),
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.error("acceptRequest error:", e);
      alert("Could not accept request.");
    } finally { setLoading(false); }
  }

  async function declineRequest() {
    if (!iAmReceiver || status !== "pending") return;
    setLoading(true);
    try {
      const target = pairReqs.find(r => r.toId === viewerId && r.status === "pending");
      if (target) {
        await updateDoc(doc(db, "FriendRequests", target.id), {
          status: "declined",
          respondedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("declineRequest error:", e);
      alert("Could not decline request.");
    } finally { setLoading(false); }
  }

  async function unfriend() {
    if (status !== "accepted") return;
    setLoading(true);
    try {
      // cancel all accepted requests for this pair (handles legacy duplicates)
      const accepted = pairReqs.filter(r => r.status === "accepted");
      await Promise.all(
        accepted.map(r =>
          updateDoc(doc(db, "FriendRequests", r.id), {
            status: "cancelled",
            respondedAt: serverTimestamp(),
          })
        )
      );
      // delete Friends doc (idempotent)
      await deleteDoc(doc(db, "Friends", friendsId));
    } catch (e) {
      console.error("unfriend error:", e);
      alert("Could not remove friend.");
    } finally { setLoading(false); }
  }

  // --- UI ---
  if (loading) return <button disabled style={{ opacity: 0.6 }}>Loading…</button>;

  if (status === "accepted") {
    return (
      <button
        onClick={unfriend}
        style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e74c3c", color: "#e74c3c", background: "transparent", fontWeight: 600 }}
      >
        Remove
      </button>
    );
  }

  if (status === "pending") {
    if (iAmSender) {
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <button disabled style={{ padding: "8px 12px", borderRadius: 6 }}>Requested</button>
          <button onClick={cancelRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>Cancel</button>
        </div>
      );
    }
    if (iAmReceiver) {
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={acceptRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>Accept</button>
          <button onClick={declineRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>Decline</button>
        </div>
      );
    }
  }

  return (
    <button onClick={sendRequest} style={{ padding: "8px 12px", borderRadius: 6 }}>
      Add Friend
    </button>
  );
}
