// src/Frontend/useMiniUser.js
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const FALLBACK = "https://i.imgur.com/qzsiOuh.png";

export function useMiniUser(uid) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const s = await getDoc(doc(db, "Users", uid));
      if (!alive) return;
      if (s.exists()) {
        const d = s.data();
        const name =
          `${d.firstName || ""} ${d.lastName || ""}`.trim() ||
          d.displayName ||
          d.email?.split("@")[0] ||
          "Someone";
        setUser({ id: uid, name, photo: d.photo || FALLBACK });
      } else {
        setUser({ id: uid, name: "Someone", photo: FALLBACK });
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  return user;
}
