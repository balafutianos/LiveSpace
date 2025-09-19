// src/Frontend/useFriends.js
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

export function useFriends(uid) {
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    if (!uid) return;
    const frRef = collection(db, "FriendRequests");

    const q1 = query(frRef, where("fromId", "==", uid), where("status", "==", "accepted"));
    const q2 = query(frRef, where("toId", "==", uid), where("status", "==", "accepted"));

    const unsub1 = onSnapshot(q1, (snap) => {
      snap.forEach((d) => {
        setFriends((prev) => [...prev, { id: d.data().toId }]);
      });
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      snap.forEach((d) => {
        setFriends((prev) => [...prev, { id: d.data().fromId }]);
      });
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [uid]);

  return friends;
}
