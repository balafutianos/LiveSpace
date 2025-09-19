import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useParams } from "react-router-dom";
import { db, auth } from "./firebase";
import PhotoModal from "./PhotoModal";
import "./Photos.css";

const FALLBACK_IMAGE = "https://i.imgur.com/qzsiOuh.png";
const DEFAULT_COVER =
  "https://img.freepik.com/free-photo/gray-abstract-wireframe-technology-background_53876-101941.jpg?semt=ais_hybrid&w=740";

function tsMillis(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  return 0;
}

export default function Photos() {
  const params = useParams();
  const [authUid, setAuthUid] = useState(null);

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState(null);

  // Track auth so /photos (no :uid) knows who to load
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUid(u?.uid || null));
    return () => unsub();
  }, []);

  useEffect(() => {
    const load = async () => {
      const uid = params.uid || authUid; // prefer /photos/:uid
      if (!uid) return;
      setLoading(true);

      try {
        // 1) Pull all user photos from Photos collection (no orderBy; sort client-side)
        const qy = query(collection(db, "Photos"), where("userId", "==", uid));
        const snap = await getDocs(qy);

        let list = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
            _ts:
              tsMillis(data.createdAt) ||
              tsMillis(data.updatedAt) ||
              0,
          };
        });

        // 2) Merge in profile/cover from Users doc if missing
        const uSnap = await getDoc(doc(db, "Users", uid));
        if (uSnap.exists()) {
          const u = uSnap.data() || {};
          if (u.photo && u.photo !== FALLBACK_IMAGE) {
            if (!list.find((p) => p.url === u.photo)) {
              list.push({
                id: "profile-photo-inline",
                userId: uid,
                url: u.photo,
                type: "profile",
                _ts: Number.MAX_SAFE_INTEGER - 1, // float to top
              });
            }
          }
          if (u.coverPhoto && u.coverPhoto !== DEFAULT_COVER) {
            if (!list.find((p) => p.url === u.coverPhoto)) {
              list.push({
                id: "cover-photo-inline",
                userId: uid,
                url: u.coverPhoto,
                type: "cover",
                _ts: Number.MAX_SAFE_INTEGER - 2,
              });
            }
          }
        }

        list.sort((a, b) => b._ts - a._ts);
        setPhotos(list);
      } catch (e) {
        console.error("Photos load error:", e);
        setPhotos([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [params.uid, authUid]);

  return (
    <div className="photos-page">
      <h2 className="photos-title">
        {params.uid ? "Photos" : "Your Photos"}
      </h2>

      {loading && <div className="muted">Loading photos…</div>}

      {!loading && photos.length === 0 && (
        <div className="muted">No photos yet.</div>
      )}

      {!loading && photos.length > 0 && (
        <div className="photos-grid">
          {photos.map((p) => (
            <button
              key={p.id}
              className="photos-btn"
              onClick={() => setActivePhoto(p)}
              title={p.type || "photo"}
            >
              <img src={p.url} alt={p.type || "photo"} />
            </button>
          ))}
        </div>
      )}

      {activePhoto && (
        <PhotoModal
          photo={activePhoto}
          currentUserId={authUid}
          onClose={() => setActivePhoto(null)}
          onDeleted={(deletedId) => {
            setPhotos((prev) => prev.filter((x) => x.id !== deletedId));
          }}
        />
      )}
    </div>
  );
}
