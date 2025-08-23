// PhotoGrid.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

export default function PhotoGrid({ userId, max = 12 }) {
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, "Photos"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const unsub = onSnapshot(q, (snap) => {
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [userId, max]);

  if (!userId) return null;

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 4,
        backgroundColor: "#f4f4f4",
        padding: 10,
        marginTop: 12,
      }}
    >
      <h4 style={{ marginTop: 0 }}>Photos</h4>

      {photos.length === 0 ? (
        <div style={{ color: "#666", fontSize: 13 }}>No photos yet.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 8,
          }}
        >
          {photos.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              title={p.type || "photo"}
              style={{ display: "block", borderRadius: 6, overflow: "hidden" }}
            >
              <img
                src={p.url}
                alt={p.type || "photo"}
                loading="lazy"
                style={{ width: "100%", height: 60, objectFit: "cover", display: "block" }}
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
