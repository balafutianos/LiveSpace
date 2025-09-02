// FriendButton.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, serverTimestamp, query, where, getDocs
} from "firebase/firestore";

export default function FriendButton({ viewerId, profileUserId, onChanged = () => {} }) {
  const [status, setStatus] = useState("idle"); // 'idle' | 'pending_out' | 'pending_in' | 'friends' | 'loading'

  useEffect(() => {
    if (!viewerId || !profileUserId) return;
    if (viewerId === profileUserId) { setStatus("idle"); return; }

    let alive = true;
    (async () => {
      setStatus("loading");
      try {
        const fr = collection(db, "FriendRequests");
        // accepted either direction
        const [a, b] = await Promise.all([
          getDocs(query(fr, where("fromId", "==", viewerId), where("toId", "==", profileUserId), where("status", "==", "accepted"))),
          getDocs(query(fr, where("fromId", "==", profileUserId), where("toId", "==", viewerId), where("status", "==", "accepted"))),
        ]);
        if ((a.size + b.size) > 0) { if (alive) setStatus("friends"); return; }

        // pending states
        const [pOut, pIn] = await Promise.all([
          getDocs(query(fr, where("fromId", "==", viewerId), where("toId", "==", profileUserId), where("status", "==", "pending"))),
          getDocs(query(fr, where("fromId", "==", profileUserId), where("toId", "==", viewerId), where("status", "==", "pending"))),
        ]);
        if (pOut.size > 0) { if (alive) setStatus("pending_out"); return; }
        if (pIn.size > 0)  { if (alive) setStatus("pending_in");  return; }

        if (alive) setStatus("idle");
      } catch {
        if (alive) setStatus("idle");
      }
    })();

    return () => { alive = false; };
  }, [viewerId, profileUserId]);

  const sendRequest = async () => {
    if (!viewerId || !profileUserId) return;
    try {
      setStatus("loading");
      // Create ONLY the FriendRequests doc. (No bell notification here.)
      await addDoc(collection(db, "FriendRequests"), {
        fromId: viewerId,
        toId: profileUserId,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setStatus("pending_out");
      onChanged();
    } catch (e) {
      console.error("sendRequest error:", e);
      setStatus("idle");
    }
  };

  const accept = async () => {
    try {
      setStatus("loading");
      // find incoming pending
      const qy = query(
        collection(db, "FriendRequests"),
        where("fromId", "==", profileUserId),
        where("toId", "==", viewerId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(qy);
      if (snap.empty) { setStatus("idle"); return; }
      const reqRef = snap.docs[0].ref;

      await updateDoc(reqRef, { status: "accepted", respondedAt: serverTimestamp() });

      // create/merge Friends pair
      const [a, b] = [viewerId, profileUserId].sort();
      await setDoc(
        doc(db, "Friends", `${a}_${b}`),
        { userIds: [a, b], createdAt: serverTimestamp() },
        { merge: true }
      );

      setStatus("friends");
      onChanged();
    } catch (e) {
      console.error("accept error:", e);
      setStatus("pending_in");
    }
  };

  const cancelOrDecline = async () => {
    try {
      setStatus("loading");
      const outgoing = query(
        collection(db, "FriendRequests"),
        where("fromId", "==", viewerId),
        where("toId", "==", profileUserId),
        where("status", "==", "pending")
      );
      const incoming = query(
        collection(db, "FriendRequests"),
        where("fromId", "==", profileUserId),
        where("toId", "==", viewerId),
        where("status", "==", "pending")
      );
      const [outSnap, inSnap] = await Promise.all([getDocs(outgoing), getDocs(incoming)]);
      if (!outSnap.empty) await updateDoc(outSnap.docs[0].ref, { status: "cancelled", respondedAt: serverTimestamp() });
      if (!inSnap.empty)  await updateDoc(inSnap.docs[0].ref,  { status: "declined",  respondedAt: serverTimestamp() });

      setStatus("idle");
      onChanged();
    } catch (e) {
      console.error("cancel/decline error:", e);
    }
  };

  if (!viewerId || viewerId === profileUserId) return null;

  if (status === "friends") {
    return <button className="btn btn-ghost" disabled>Friends ✓</button>;
  }
  if (status === "pending_out") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost" disabled>Requested…</button>
        <button className="btn btn-ghost" onClick={cancelOrDecline}>Cancel</button>
      </div>
    );
  }
  if (status === "pending_in") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={accept}>Accept</button>
        <button className="btn btn-ghost" onClick={cancelOrDecline}>Decline</button>
      </div>
    );
  }

  return (
    <button className="btn btn-primary" onClick={sendRequest} disabled={status === "loading"}>
      Add Friend
    </button>
  );
}
