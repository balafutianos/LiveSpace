// PhotoGrid.jsx
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";

/**
 * Props:
 *  - userId (required)
 *  - max (default 12)
 *  - onOpen(photo) optional: called when a tile is clicked
 */
export default function PhotoGrid({ userId, max = 12, onOpen }) {
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

  if (photos.length === 0) {
    return <div className="muted">No photos yet.</div>;
  }

  return (
    <div className="photos-grid">
      {photos.map((p) => {
        const Tile = (
          <img
            src={p.url}
            alt={p.type || "photo"}
            loading="lazy"
            style={{ width: "100%", height: 160, objectFit: "cover" }}
          />
        );
        return onOpen ? (
          <button
            key={p.id}
            className="photos-grid-btn"
            onClick={() => onOpen(p)}
            title={p.type || "photo"}
          >
            {Tile}
          </button>
        ) : (
          <a
            key={p.id}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="photos-grid-btn"
            title={p.type || "photo"}
          >
            {Tile}
          </a>
        );
      })}
    </div>
  );
}
